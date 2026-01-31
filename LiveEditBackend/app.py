from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import google.generativeai as genai
import json
import os
import subprocess
import tempfile
from datetime import datetime
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import hashlib
import hmac
import secrets
from google.genai import Client
from werkzeug.utils import secure_filename

from video_tasks import analyze_video_task, edit_video_task, edit_multi_task

load_dotenv()

app = Flask(__name__)

# Configure CORS with proper settings for cookies and credentials
CORS(app, 
     resources={r"/api/*": {
         "origins": [
             "http://localhost:3000",
             "http://localhost:5173",
             "http://127.0.0.1:3000",
             "http://127.0.0.1:5173",
             "https://liveedit.onrender.com",
             "https://*.vercel.app",
             "https://livedit.space",
             "https://www.livedit.space"
         ],
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"],
         "supports_credentials": True,
         "max_age": 3600
     }})

# Additional CORS headers for all responses
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin in [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://liveedit.onrender.com",
        "https://livedit.space",
        "https://www.livedit.space"
    ] or (origin and origin.endswith('.vercel.app')):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Max-Age'] = '3600'
    return response

# Configure Gemini API
API_KEY = os.getenv('GEMINI_API_KEY')
if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-3-flash-preview")
# Use Gemini 3 Flash for fast video analysis
video_model = genai.GenerativeModel("gemini-3-flash-preview")

# Image generation model
IMAGE_MODEL_ID = os.getenv('GEMINI_IMAGE_MODEL', 'imagen-3.0-generate-001')

# Helper to get AI client for image generation
def getAiClient():
    return Client(api_key=API_KEY)

# Database connections
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env file")

# Where uploaded assets for jobs are stored (shared between API and Celery workers)
JOB_WORKDIR = os.getenv('JOB_WORKDIR', '/tmp/liveedit_jobs')
os.makedirs(JOB_WORKDIR, exist_ok=True)

def get_db_connection():
    """Create a new database connection"""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def save_video_to_db(job_id: str, file_index: int, filename: str, file_data: bytes, content_type: str = 'video/mp4') -> int:
    """Save video blob to database"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO video_files (job_id, file_index, filename, content_type, file_data, file_size)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (job_id, file_index) DO UPDATE
            SET file_data = EXCLUDED.file_data,
                file_size = EXCLUDED.file_size
            RETURNING id;
        """, (job_id, file_index, filename, content_type, file_data, len(file_data)))
        video_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return video_id
    except Exception as e:
        print(f"[ERROR] Failed to save video to database: {str(e)}")
        raise

def save_audio_to_db(job_id: str, filename: str, file_data: bytes, content_type: str = 'audio/mpeg') -> int:
    """Save audio blob to database"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO audio_files (job_id, filename, content_type, file_data, file_size)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (job_id) DO UPDATE
            SET file_data = EXCLUDED.file_data,
                file_size = EXCLUDED.file_size
            RETURNING id;
        """, (job_id, filename, content_type, file_data, len(file_data)))
        audio_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return audio_id
    except Exception as e:
        print(f"[ERROR] Failed to save audio to database: {str(e)}")
        raise

def get_audio_for_job(job_id: str) -> tuple:
    """Retrieve audio blob for a job. Returns (filename, file_data) or (None, None)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT filename, file_data
            FROM audio_files
            WHERE job_id = %s
            LIMIT 1
        """, (job_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            return None, None
        
        return row['filename'], row['file_data']
    except Exception as e:
        print(f"[ERROR] Failed to retrieve audio from database: {str(e)}")
        return None, None

def get_video_from_db(job_id: str, file_index: int) -> tuple:
    """Retrieve video blob from database. Returns (filename, file_data)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT filename, file_data
            FROM video_files
            WHERE job_id = %s AND file_index = %s
        """, (job_id, file_index))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            raise FileNotFoundError(f"Video not found in database: job={job_id}, index={file_index}")
        
        return row['filename'], row['file_data']
    except Exception as e:
        print(f"[ERROR] Failed to retrieve video from database: {str(e)}")
        raise

def get_all_videos_for_job(job_id: str) -> list:
    """Get all video files for a job. Returns list of (file_index, filename, file_data)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT file_index, filename, file_data
            FROM video_files
            WHERE job_id = %s
            ORDER BY file_index ASC
        """, (job_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        return [(row['file_index'], row['filename'], row['file_data']) for row in rows]
    except Exception as e:
        print(f"[ERROR] Failed to retrieve videos from database: {str(e)}")
        return []

def extract_videos_to_workspace(job_id: str) -> list:
    """Extract all videos for a job from database to workspace. Returns list of file paths"""
    try:
        job_dir = os.path.join(JOB_WORKDIR, job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        videos = get_all_videos_for_job(job_id)
        paths = []
        
        for file_index, filename, file_data in videos:
            # Standardize filename as videoN.mp4
            video_path = os.path.join(job_dir, f"video{file_index}.mp4")
            with open(video_path, 'wb') as f:
                f.write(file_data)
            paths.append(video_path)
            print(f"[DEBUG] Extracted video {file_index} from DB: {video_path} ({len(file_data)} bytes)")
        
        return paths
    except Exception as e:
        print(f"[ERROR] Failed to extract videos from database: {str(e)}")
        raise

    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def hash_password(password: str) -> str:
    """Hash a password using PBKDF2"""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}${key.hex()}"

def verify_password(password: str, hash_val: str) -> bool:
    """Verify a password against its hash"""
    try:
        salt, key = hash_val.split('$')
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return hmac.compare_digest(new_key.hex(), key)
    except:
        return False

def init_auth_table():
    """Create users table if it doesn't exist"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                subscription_status VARCHAR(50) DEFAULT 'free',
                subscription_plan VARCHAR(50),
                subscription_end_date TIMESTAMP
            )
        """)

        # Ensure subscription columns exist for legacy tables
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'free'")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50)")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP")
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not initialize auth table: {str(e)}")

def init_payment_tables():
    """Create payment and subscription tables"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Create subscription plans table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS subscription_plans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'KES',
                duration_days INTEGER NOT NULL,
                features JSONB,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create transactions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                reference VARCHAR(255) UNIQUE NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'KES',
                status VARCHAR(50) DEFAULT 'pending',
                plan_id INTEGER REFERENCES subscription_plans(id),
                paystack_reference VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Insert default subscription plan
        cur.execute("""
            INSERT INTO subscription_plans (name, price, currency, duration_days, features)
            VALUES 
                ('Basic', 100.00, 'KES', 30, '{"ai_generations": 100, "storage_gb": 10, "video_exports": "1080p", "priority_support": true}')
            ON CONFLICT (name) DO NOTHING
        """)
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not initialize payment tables: {str(e)}")

def init_video_job_table():
    """Create table to track async video jobs"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS video_jobs (
                job_id VARCHAR(64) PRIMARY KEY,
                job_type VARCHAR(32) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'queued',
                progress NUMERIC(5,2) DEFAULT 0,
                message TEXT,
                result_path TEXT,
                result_json JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_video_jobs_created_at
            ON video_jobs (created_at DESC)
            """
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not initialize video_jobs table: {str(e)}")

def init_media_tables():
    """Create tables to store video/audio blobs for jobs"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS video_files (
                id SERIAL PRIMARY KEY,
                job_id VARCHAR(64) NOT NULL,
                file_index INTEGER NOT NULL,
                filename VARCHAR(255) NOT NULL,
                content_type VARCHAR(100),
                file_data BYTEA NOT NULL,
                file_size BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(job_id, file_index)
            );
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_video_files_job_id
            ON video_files (job_id);
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audio_files (
                id SERIAL PRIMARY KEY,
                job_id VARCHAR(64) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                content_type VARCHAR(100),
                file_data BYTEA NOT NULL,
                file_size BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(job_id)
            );
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_audio_files_job_id
            ON audio_files (job_id);
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not initialize media tables: {str(e)}")

# Initialize auth table on startup
init_auth_table()
init_payment_tables()
init_video_job_table()
init_media_tables()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Backend is running'})

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """Create a new user account"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400

        # Check if email is valid
        import re
        if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
            return jsonify({'error': 'Invalid email format'}), 400

        try:
            conn = get_db_connection()
            cur = conn.cursor()

            # Check if user already exists
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({'error': 'Email already registered'}), 409

            # Hash password and create user
            password_hash = hash_password(password)
            cur.execute(
                "INSERT INTO users (email, password_hash) VALUES (%s, %s)",
                (email, password_hash)
            )
            conn.commit()

            # Generate token (in production, use JWT)
            token = secrets.token_urlsafe(32)
            
            cur.close()
            conn.close()

            return jsonify({'success': True, 'token': token, 'email': email}), 201
        except psycopg2.IntegrityError:
            return jsonify({'error': 'Email already registered'}), 409
    except Exception as e:
        print(f"Signup error: {str(e)}")
        return jsonify({'error': 'Signup failed'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate a user"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        conn = get_db_connection()
        cur = conn.cursor()

        # Find user
        cur.execute("SELECT id, password_hash FROM users WHERE email = %s", (email,))
        user = cur.fetchone()

        if not user or not verify_password(password, user['password_hash']):
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid email or password'}), 401

        # Update last login
        cur.execute(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = %s",
            (user['id'],)
        )
        conn.commit()

        # Generate token (in production, use JWT)
        token = secrets.token_urlsafe(32)

        cur.close()
        conn.close()

        return jsonify({'success': True, 'token': token, 'email': email}), 200
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout endpoint (token cleanup handled on client)"""
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200

@app.route('/api/audio-effects', methods=['GET'])
def list_audio_effects():
    """Get all available audio effects from database"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, name, filename, category, description, duration_seconds, tags
            FROM audio_effects
            ORDER BY name
        """)
        effects = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([dict(effect) for effect in effects])
    except Exception as e:
        print(f"Error fetching audio effects: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/audio-effects/<filename>', methods=['GET'])
def get_audio_file(filename):
    """Serve an audio file from the sounds directory"""
    try:
        sounds_dir = os.path.join(os.path.dirname(__file__), 'sounds')
        file_path = os.path.join(sounds_dir, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'Audio file not found'}), 404
        return send_file(file_path, mimetype='audio/mpeg')
    except Exception as e:
        print(f"Error serving audio file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/audio-effects/import', methods=['POST'])
def import_audio_from_url():
    """Download audio from URL and add to library"""
    import requests
    try:
        data = request.get_json()
        url = data.get('url')
        name = data.get('name')
        category = data.get('category', 'effect')
        description = data.get('description', '')
        tags = data.get('tags', [])
        
        if not url or not name:
            return jsonify({'error': 'URL and name are required'}), 400
        
        # Download the file
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # Generate filename from name
        import re
        filename = re.sub(r'[^\w\s-]', '', name.lower())
        filename = re.sub(r'[-\s]+', '_', filename)
        filename = f"{filename}.mp3"
        
        # Save to sounds directory
        sounds_dir = os.path.join(os.path.dirname(__file__), 'sounds')
        os.makedirs(sounds_dir, exist_ok=True)
        file_path = os.path.join(sounds_dir, filename)
        
        with open(file_path, 'wb') as f:
            f.write(response.content)
        
        # Add to database
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO audio_effects (name, filename, category, description, tags)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (filename) DO UPDATE
            SET name = EXCLUDED.name,
                category = EXCLUDED.category,
                description = EXCLUDED.description,
                tags = EXCLUDED.tags
            RETURNING id;
        """, (name, filename, category, description, tags))
        effect_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'id': effect_id,
            'filename': filename,
            'message': f'Audio effect "{name}" imported successfully'
        })
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Failed to download audio: {str(e)}'}), 500
    except Exception as e:
        print(f"Error importing audio: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-video', methods=['POST'])
def analyze_video():
    """
    Analyze a video file and generate edit suggestions
    
    Expected form data:
    - video_file: The video file to analyze
    - prompt: User's prompt for analysis
    """
    try:
        if 'video_file' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400

        video_file = request.files['video_file']
        user_prompt = request.form.get('prompt', 'Analyze this video')

        if video_file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        job_id = secrets.token_hex(16)
        job_dir = os.path.join(JOB_WORKDIR, job_id)
        os.makedirs(job_dir, exist_ok=True)
        filename = secure_filename(video_file.filename) or 'video.mp4'
        video_path = os.path.join(job_dir, filename)
        video_file.save(video_path)

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO video_jobs (job_id, job_type, status, progress, message)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (job_id, 'analyze', 'queued', 0, 'Queued for analysis')
        )
        conn.commit()
        cur.close()
        conn.close()

        analyze_video_task.delay(job_id, video_path, user_prompt)

        return jsonify({
            'job_id': job_id,
            'status': 'queued',
            'job_type': 'analyze',
            'message': 'Video analysis queued'
        }), 202

    except Exception as e:
        print(f"Error queuing video analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Chat endpoint for text-based interactions
    
    Expected JSON:
    - message: The user's message
    """
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'No message provided'}), 400
        
        user_message = data['message']
        
        # Generate response
        response = model.generate_content(user_message)
        
        # Extract text from response safely
        response_text = ''
        
        try:
            # Try direct text access first
            response_text = response.text
        except Exception:
            # If that fails, try alternative access
            if hasattr(response, 'candidates') and response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                # Check if candidate has content with parts
                if (hasattr(candidate, 'content') and candidate.content and 
                    hasattr(candidate.content, 'parts') and candidate.content.parts and 
                    len(candidate.content.parts) > 0):
                    response_text = candidate.content.parts[0].text
                else:
                    # Content is empty, check if response was blocked
                    if hasattr(candidate, 'finish_reason'):
                        response_text = f'Response was blocked or filtered (Reason: {candidate.finish_reason}). Please try a different query.'
                    else:
                        response_text = 'Received empty response from AI. Please try again.'
            else:
                response_text = 'No response from AI. Please try again.'
        
        return jsonify({
            'message': response_text if response_text else 'No response generated',
            'status': 'success'
        })
    
    except Exception as e:
        print(f"Error in chat: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/edit-video', methods=['POST'])
def edit_video():
    """
    Apply edits to a video based on AI suggestions

    Expected form data:
    - video_file: The video file to edit
    - edit_plan: JSON string containing edit instructions
    - audio_file (optional): Audio file to add to video
    - audio_start (optional): Timestamp to start audio (HH:MM:SS or MM:SS)
    - audio_duck_db (optional): Reduce original audio by X dB (default 0)
    """
    try:
        if 'video_file' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400

        video_file = request.files['video_file']
        edit_plan_str = request.form.get('edit_plan', '[]')
        audio_file = request.files.get('audio_file', None)
        audio_start = request.form.get('audio_start', '00:00')
        audio_duck_db = float(request.form.get('audio_duck_db', '0'))

        if video_file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        try:
            edit_plan = json.loads(edit_plan_str)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid edit plan JSON'}), 400

        has_audio_cue = any(isinstance(e, dict) and e.get('type') == 'audio_cue' for e in edit_plan or [])
        if has_audio_cue and audio_file is None:
            return jsonify({'error': 'Audio cue requested but no audio file provided. Select/import an audio effect before rendering.'}), 400

        if edit_plan:
            cue_times = [e.get('time') for e in edit_plan if isinstance(e, dict) and e.get('type') == 'audio_cue' and e.get('time')]
            if cue_times and audio_start == '00:00':
                audio_start = cue_times[0]

        job_id = secrets.token_hex(16)
        job_dir = os.path.join(JOB_WORKDIR, job_id)
        os.makedirs(job_dir, exist_ok=True)

        video_filename = secure_filename(video_file.filename) or 'input_video.mp4'
        video_path = os.path.join(job_dir, video_filename)
        video_file.save(video_path)
        # Ensure file is written to disk before proceeding
        if not os.path.exists(video_path):
            raise IOError(f"Failed to save video file: {video_path}")

        audio_path = None
        if audio_file:
            audio_filename = secure_filename(audio_file.filename) or 'effect_audio.mp3'
            audio_path = os.path.join(job_dir, audio_filename)
            audio_file.save(audio_path)
            # Ensure audio file is written to disk
            if not os.path.exists(audio_path):
                raise IOError(f"Failed to save audio file: {audio_path}")

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO video_jobs (job_id, job_type, status, progress, message)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (job_id, 'edit', 'queued', 0, 'Queued for rendering')
        )
        conn.commit()
        cur.close()
        conn.close()

        edit_video_task.delay(job_id, video_path, edit_plan, audio_path, audio_start, audio_duck_db)

        return jsonify({
            'job_id': job_id,
            'status': 'queued',
            'job_type': 'edit',
            'message': 'Video render queued'
        }), 202

    except Exception as e:
        print(f"Error queuing video edit: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def time_to_seconds(time_str):
    """Convert time strings (SS, MM:SS, HH:MM:SS) with optional decimals to seconds."""
    if not time_str:
        return 0.0

    try:
        parts = [p.strip() for p in str(time_str).split(':') if p.strip() != '']
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return 0.0

    return 0.0


# Paystack payment endpoints

@app.route('/api/video-jobs/<job_id>', methods=['GET'])
def get_video_job(job_id):
    """Check the status of a queued video job"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT job_id, job_type, status, progress, message, result_path, result_json, created_at, updated_at
            FROM video_jobs
            WHERE job_id = %s
            """,
            (job_id,)
        )
        job = cur.fetchone()
        cur.close()
        conn.close()

        if not job:
            return jsonify({'error': 'Job not found'}), 404

        job_dict = dict(job)
        if job_dict.get('result_json') and isinstance(job_dict['result_json'], str):
            try:
                job_dict['result_json'] = json.loads(job_dict['result_json'])
            except json.JSONDecodeError:
                pass

        return jsonify(job_dict), 200

    except Exception as e:
        print(f"Error fetching job status: {str(e)}")
        return jsonify({'error': 'Failed to fetch job status'}), 500


@app.route('/api/video-jobs/<job_id>/download', methods=['GET'])
def download_video_job(job_id):
    """Download the rendered video for a completed job"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT result_path, status
            FROM video_jobs
            WHERE job_id = %s
            """,
            (job_id,)
        )
        job = cur.fetchone()
        cur.close()
        conn.close()

        if not job:
            return jsonify({'error': 'Job not found'}), 404

        if job['status'] != 'succeeded' or not job.get('result_path'):
            return jsonify({'error': 'Result not ready'}), 400

        result_path = job['result_path']
        if not os.path.exists(result_path):
            return jsonify({'error': 'Result file missing'}), 404

        return send_file(result_path, mimetype='video/mp4', as_attachment=True, download_name=os.path.basename(result_path))

    except Exception as e:
        print(f"Error downloading job result: {str(e)}")
        return jsonify({'error': 'Failed to download result'}), 500

@app.route('/api/edit-multi', methods=['POST'])
def edit_multi():
    """Queue multi-clip edit (up to 3 videos) with instructions-driven plan"""
    try:
        video_files = request.files.getlist('video_files')
        print(f"[DEBUG] Received {len(video_files)} video files from client")
        for i, vf in enumerate(video_files):
            print(f"[DEBUG] File {i}: filename='{vf.filename}', content_type='{vf.content_type}'")
        
        if not video_files:
            return jsonify({'error': 'No video files provided'}), 400
        if len(video_files) > 3:
            return jsonify({'error': 'Maximum of 3 video files allowed'}), 400

        prompt = (request.form.get('prompt') or '').strip()
        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        audio_file = request.files.get('audio_file')
        audio_start = request.form.get('audio_start', '00:00')
        try:
            audio_duck_db = float(request.form.get('audio_duck_db', '0'))
        except ValueError:
            audio_duck_db = 0.0

        job_id = secrets.token_hex(16)
        job_dir = os.path.join(JOB_WORKDIR, job_id)
        os.makedirs(job_dir, exist_ok=True)

        # Save videos to database
        video_count = 0
        for idx, vf in enumerate(video_files):
            if not vf or vf.filename == '':
                print(f"[DEBUG] Skipping empty file at index {idx}")
                continue
            
            # Read file data
            file_data = vf.read()
            filename = secure_filename(vf.filename) or f'video{video_count}.mp4'
            content_type = vf.content_type or 'video/mp4'
            
            # Save to database
            video_id = save_video_to_db(job_id, video_count, filename, file_data, content_type)
            print(f"[DEBUG] Video {video_count} saved to DB: id={video_id}, name={filename}, size={len(file_data)} bytes")
            video_count += 1

        if video_count == 0:
            return jsonify({'error': 'No valid video files provided'}), 400

        print(f"[DEBUG] Total videos saved to DB: {video_count}")

        audio_filename = None
        if audio_file and audio_file.filename:
            audio_filename = secure_filename(audio_file.filename) or 'effect_audio.mp3'
            audio_data = audio_file.read()
            audio_content_type = audio_file.content_type or 'audio/mpeg'
            audio_id = save_audio_to_db(job_id, audio_filename, audio_data, audio_content_type)
            print(f"[DEBUG] Audio saved to DB: id={audio_id}, name={audio_filename}, size={len(audio_data)} bytes")

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO video_jobs (job_id, job_type, status, progress, message)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (job_id, 'edit-multi', 'queued', 0, 'Queued for multi-clip rendering')
        )
        conn.commit()
        cur.close()
        conn.close()

        # Pass job_id and audio_filename instead of file paths - Celery worker will extract from DB
        edit_multi_task.delay(job_id, prompt, audio_filename, audio_start, audio_duck_db)

        return jsonify({
            'job_id': job_id,
            'status': 'queued',
            'job_type': 'edit-multi',
            'message': 'Multi-clip render queued'
        }), 202

    except Exception as e:
        print(f"Error queuing multi-clip edit: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/payments/plans', methods=['GET'])
def get_subscription_plans():
    """Get all active subscription plans"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, name, price, currency, duration_days, features
            FROM subscription_plans
            WHERE is_active = true
            ORDER BY price ASC
        """)
        plans = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([dict(plan) for plan in plans]), 200
    except Exception as e:
        print(f"Error fetching plans: {str(e)}")
        return jsonify({'error': 'Failed to fetch plans'}), 500

@app.route('/api/payments/initialize', methods=['POST'])
def initialize_payment():
    """Initialize Paystack payment"""
    try:
        data = request.get_json()
        email = data.get('email')
        plan_id = data.get('plan_id')
        
        if not email or not plan_id:
            return jsonify({'error': 'Email and plan_id are required'}), 400
        
        # Get plan details
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, name, price, currency
            FROM subscription_plans
            WHERE id = %s AND is_active = true
        """, (plan_id,))
        plan = cur.fetchone()
        
        if not plan:
            cur.close()
            conn.close()
            return jsonify({'error': 'Invalid plan'}), 404
        
        # Get user
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        # Generate reference
        reference = f"LE_{secrets.token_hex(8)}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Save transaction
        cur.execute("""
            INSERT INTO transactions (user_id, reference, amount, currency, plan_id, status)
            VALUES (%s, %s, %s, %s, %s, 'pending')
            RETURNING id
        """, (user['id'], reference, plan['price'], plan['currency'], plan['id']))
        transaction_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        
        # Initialize Paystack payment
        from paystackapi.paystack import Paystack
        paystack = Paystack(secret_key=os.getenv('PAYSTACK_SECRET_KEY'))
        
        response = paystack.transaction.initialize(
            email=email,
            amount=int(float(plan['price']) * 100),  # Convert to kobo
            reference=reference,
            callback_url=os.getenv('PAYSTACK_CALLBACK_URL', 'http://localhost:5173/payment/callback'),
            metadata={
                'plan_id': plan['id'],
                'plan_name': plan['name'],
                'transaction_id': transaction_id
            }
        )
        
        if response['status']:
            return jsonify({
                'success': True,
                'authorization_url': response['data']['authorization_url'],
                'access_code': response['data']['access_code'],
                'reference': reference
            }), 200
        else:
            return jsonify({'error': 'Payment initialization failed'}), 500
            
    except Exception as e:
        print(f"Payment initialization error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Payment initialization failed'}), 500

@app.route('/api/payments/verify/<reference>', methods=['GET'])
def verify_payment(reference):
    """Verify Paystack payment and update subscription"""
    try:
        from paystackapi.paystack import Paystack
        paystack = Paystack(secret_key=os.getenv('PAYSTACK_SECRET_KEY'))
        
        # Verify transaction with Paystack
        response = paystack.transaction.verify(reference=reference)
        
        if not response['status']:
            return jsonify({'error': 'Payment verification failed'}), 400
        
        transaction_data = response['data']
        
        # Update transaction in database
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT user_id, plan_id, status
            FROM transactions
            WHERE reference = %s
        """, (reference,))
        transaction = cur.fetchone()
        
        if not transaction:
            cur.close()
            conn.close()
            return jsonify({'error': 'Transaction not found'}), 404
        
        if transaction['status'] == 'success':
            cur.close()
            conn.close()
            return jsonify({'message': 'Payment already verified', 'status': 'success'}), 200
        
        # Check if payment was successful
        if transaction_data['status'] == 'success':
            # Get plan duration
            cur.execute("""
                SELECT duration_days, name
                FROM subscription_plans
                WHERE id = %s
            """, (transaction['plan_id'],))
            plan = cur.fetchone()
            
            # Update transaction status
            cur.execute("""
                UPDATE transactions
                SET status = 'success',
                    paystack_reference = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE reference = %s
            """, (transaction_data['reference'], reference))
            
            # Update user subscription
            from datetime import timedelta
            subscription_end = datetime.now() + timedelta(days=plan['duration_days'])
            
            cur.execute("""
                UPDATE users
                SET subscription_status = 'active',
                    subscription_plan = %s,
                    subscription_end_date = %s
                WHERE id = %s
            """, (plan['name'], subscription_end, transaction['user_id']))
            
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                'success': True,
                'message': 'Payment verified successfully',
                'subscription': {
                    'status': 'active',
                    'plan': plan['name'],
                    'end_date': subscription_end.isoformat()
                }
            }), 200
        else:
            # Payment failed
            cur.execute("""
                UPDATE transactions
                SET status = 'failed',
                    updated_at = CURRENT_TIMESTAMP
                WHERE reference = %s
            """, (reference,))
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({'error': 'Payment was not successful'}), 400
            
    except Exception as e:
        print(f"Payment verification error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Payment verification failed'}), 500

@app.route('/api/user/subscription', methods=['GET'])
def get_user_subscription():
    """Get user's current subscription status"""
    try:
        # Get email from auth header or query param
        email = request.args.get('email')
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT subscription_status, subscription_plan, subscription_end_date
            FROM users
            WHERE email = %s
        """, (email,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check if subscription expired
        subscription_status = user['subscription_status']
        if user['subscription_end_date'] and datetime.now() > user['subscription_end_date']:
            subscription_status = 'expired'
        
        return jsonify({
            'status': subscription_status or 'free',
            'plan': user['subscription_plan'],
            'end_date': user['subscription_end_date'].isoformat() if user['subscription_end_date'] else None
        }), 200
        
    except Exception as e:
        print(f"Error fetching subscription: {str(e)}")
        return jsonify({'error': 'Failed to fetch subscription'}), 500

@app.route('/api/user/transactions', methods=['GET'])
def get_user_transactions():
    """Get user's payment history"""
    try:
        email = request.args.get('email')
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT t.id, t.reference, t.amount, t.currency, t.status, 
                   t.created_at, sp.name as plan_name
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
            WHERE u.email = %s
            ORDER BY t.created_at DESC
            LIMIT 20
        """, (email,))
        
        transactions = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify([dict(t) for t in transactions]), 200
        
    except Exception as e:
        print(f"Error fetching transactions: {str(e)}")
        return jsonify({'error': 'Failed to fetch transactions'}), 500

@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """Generate a creative image for video moodboarding"""
    try:
        data = request.get_json() or {}
        prompt = (data.get('prompt') or '').strip()

        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        # Enhanced prompt for consistent visual style
        composed_prompt = f"{prompt}\nStyle: cinematic, high contrast, neon green (#00ff41) accents, dark slate backgrounds, professional studio lighting"

        try:
            # Direct REST API call to Imagen
            import requests
            
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{IMAGE_MODEL_ID}:predict"
            headers = {
                'Content-Type': 'application/json',
            }
            payload = {
                'instances': [{'prompt': composed_prompt}],
                'parameters': {
                    'sampleCount': 1,
                    'aspectRatio': '16:9'
                }
            }
            
            response = requests.post(f"{url}?key={API_KEY}", headers=headers, json=payload)
            
            if response.status_code == 200:
                result = response.json()
                # Extract image data from predictions
                if 'predictions' in result and len(result['predictions']) > 0:
                    image_base64 = result['predictions'][0].get('bytesBase64Encoded', '')
                    if image_base64:
                        return jsonify({
                            'image_base64': image_base64,
                            'mime_type': 'image/png'
                        }), 200
            
            # If we get here, the API call didn't work as expected
            raise ValueError(f"API returned status {response.status_code}: {response.text[:200]}")
            
        except Exception as img_err:
            print(f"Image generation failed: {img_err}")
            return jsonify({
                'error': 'Image generation is not currently available. Imagen model access may not be enabled for your API key. Please enable Imagen 3 in Google AI Studio or use an alternative image generation service.',
                'details': str(img_err)
            }), 502
            
    except Exception as e:
        print(f"Image generation error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Image generation failed: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
