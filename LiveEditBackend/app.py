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

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini API
API_KEY = os.getenv('GEMINI_API_KEY')
if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")
# Revert to supported video analysis model
video_model = genai.GenerativeModel("gemini-2.5-pro")

# Database connections
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env file")

def get_db_connection():
    """Create a new database connection"""
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
                currency VARCHAR(3) DEFAULT 'NGN',
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
                currency VARCHAR(3) DEFAULT 'NGN',
                status VARCHAR(50) DEFAULT 'pending',
                plan_id INTEGER REFERENCES subscription_plans(id),
                paystack_reference VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Insert default subscription plans
        cur.execute("""
            INSERT INTO subscription_plans (name, price, duration_days, features)
            VALUES 
                ('Basic', 2000.00, 30, '{"ai_generations": 50, "storage_gb": 5, "video_exports": "720p"}'),
                ('Pro', 5000.00, 30, '{"ai_generations": 200, "storage_gb": 20, "video_exports": "1080p", "priority_support": true}'),
                ('Premium', 10000.00, 30, '{"ai_generations": -1, "storage_gb": 100, "video_exports": "4K", "priority_support": true, "api_access": true}')
            ON CONFLICT (name) DO NOTHING
        """)
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Warning: Could not initialize payment tables: {str(e)}")

# Initialize auth table on startup
init_auth_table()
init_payment_tables()

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
        
        # Read the video file into memory
        print(f"Reading video file: {video_file.filename}")
        video_data = video_file.read()
        
        # Determine MIME type
        import mimetypes
        mime_type, _ = mimetypes.guess_type(video_file.filename)
        if not mime_type:
            mime_type = 'video/mp4'
        
        print(f"Video file size: {len(video_data)} bytes, MIME type: {mime_type}")
        
        # Create analysis prompt
        analysis_prompt = f"""You are viewing a video file. You MUST analyze the actual video content frame-by-frame.

USER REQUEST: {user_prompt}

YOUR TASK:
1. Watch the video and identify the exact timestamps where requested actions occur
2. Generate a concrete ffmpeg-compatible edit plan
3. Return ONLY executable operations, NO instructions or advice

Example - if user says "add sound when I smile":
- Detect the frame where the person smiles
- Return: {{"type": "audio_cue", "time": "00:02.5", "description": "smile detected"}}

Example - if user says "trim first 2 seconds":
- Return: {{"type": "cut", "start": "00:00", "end": "00:02", "description": "remove intro"}}

OUTPUT FORMAT (strict JSON only):
{{
  "summary": "what you see in the video (person, actions, timing)",
  "key_events": [{{"time": "00:01.2", "description": "person looks at camera"}}, {{"time": "00:02.5", "description": "person smiles"}}],
  "edit_plan": [{{"type": "cut", "start": "00:00", "end": "00:02"}}, {{"type": "audio_cue", "time": "00:02.5", "description": "add electronic pulse at smile"}}]
}}

CRITICAL: Base all timestamps on what you actually see in the video. Use MM:SS.MS format."""
        
        # Create inline data structure for the video
        video_part = {
            "mime_type": mime_type,
            "data": video_data
        }
        
        # Generate response with the video
        print(f"Analyzing video with prompt: {user_prompt}")
        response = video_model.generate_content([video_part, analysis_prompt])
        
        # Parse the response
        response_text = ''
        try:
            response_text = response.text
        except Exception as parse_error:
            print(f"Error accessing response.text: {parse_error}")
            if hasattr(response, 'candidates') and response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                if (hasattr(candidate, 'content') and candidate.content and 
                    hasattr(candidate.content, 'parts') and candidate.content.parts and
                    len(candidate.content.parts) > 0):
                    response_text = candidate.content.parts[0].text
        
        # Try to extract JSON from the response
        try:
            # Find JSON in the response
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start != -1 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                result = json.loads(json_str)
            else:
                result = {"summary": response_text, "key_events": [], "edit_plan": []}
        except json.JSONDecodeError:
            result = {"summary": response_text, "key_events": [], "edit_plan": []}
        
        return jsonify(result)
    
    except Exception as e:
        print(f"Error analyzing video: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
    except Exception as e:
        print(f"Error analyzing video: {str(e)}")
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

if __name__ == '__main__':

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
        
            # Parse edit plan
            try:
                edit_plan = json.loads(edit_plan_str)
            except json.JSONDecodeError:
                return jsonify({'error': 'Invalid edit plan JSON'}), 400

            print(f"EDIT_PLAN: {edit_plan}")

            # If audio cues exist but no audio provided, bail early to avoid silent no-op
            has_audio_cue = any(isinstance(e, dict) and e.get('type') == 'audio_cue' for e in edit_plan or [])
            if has_audio_cue and audio_file is None:
                return jsonify({'error': 'Audio cue requested but no audio file provided. Select/import an audio effect before rendering.'}), 400

            # If an audio_cue is present, use its time as start unless user provided one
            if edit_plan:
                cue_times = [e.get('time') for e in edit_plan if isinstance(e, dict) and e.get('type') == 'audio_cue' and e.get('time')]
                if cue_times and audio_start == '00:00':
                    audio_start = cue_times[0]
        
            # Save original video to temp file
            temp_dir = tempfile.mkdtemp()
            input_path = os.path.join(temp_dir, 'input_video.mp4')
            output_path = os.path.join(temp_dir, 'output_video.mp4')
            audio_path = None
        
            video_file.save(input_path)
            
            # Save audio file if provided
            if audio_file:
                audio_path = os.path.join(temp_dir, 'effect_audio.mp3')
                audio_file.save(audio_path)
        
            # Apply edits using ffmpeg
            if not edit_plan or len(edit_plan) == 0:
                # No edits, just return original
                if audio_path:
                    # Add audio to original video
                    cmd = build_ffmpeg_with_audio(input_path, output_path, audio_path, audio_start, audio_duck_db)
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    if result.returncode != 0:
                        print(f"FFmpeg error: {result.stderr}")
                        return jsonify({'error': f'Audio mixing failed: {result.stderr}'}), 500
                else:
                    os.rename(input_path, output_path)
            else:
                # Build ffmpeg filter for cuts and edits
                filter_parts = []
            
                for i, edit in enumerate(edit_plan):
                    edit_type = edit.get('type', '')
                
                    if edit_type == 'cut':
                        # Remove a segment
                        start = edit.get('start', '00:00')
                        end = edit.get('end', '00:00')
                    
                        # Convert time format MM:SS to seconds
                        start_sec = time_to_seconds(start)
                        end_sec = time_to_seconds(end)
                    
                        filter_parts.append(f"between(t,{start_sec},{end_sec})")
                    # Non-cut edits (enhancement/audio_cue) are currently no-ops for video track
            
                if filter_parts:
                    # Create filter to remove segments
                    filter_expr = "select='not(" + "+".join(filter_parts) + ")',setpts=N/FRAME_RATE/TB"
                
                    # First pass: apply cuts only
                    temp_cut_path = os.path.join(temp_dir, 'cut_video.mp4')
                    cmd = [
                        'ffmpeg', '-i', input_path,
                        '-vf', filter_expr,
                        '-af', "aselect='not(" + "+".join(filter_parts) + ")',asetpts=N/SR/TB",
                        '-y', temp_cut_path
                    ]
                    
                    print(f"Running ffmpeg command for cuts: {' '.join(cmd)}")
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    if result.returncode != 0:
                        print(f"FFmpeg error: {result.stderr}")
                        return jsonify({'error': f'Video editing failed: {result.stderr}'}), 500
                    
                    # Second pass: add audio if provided
                    if audio_path:
                        cmd = build_ffmpeg_with_audio(temp_cut_path, output_path, audio_path, audio_start, audio_duck_db)
                    else:
                        cmd = ['ffmpeg', '-i', temp_cut_path, '-c', 'copy', '-y', output_path]
                else:
                    # No valid cuts, copy original
                    if audio_path:
                        cmd = build_ffmpeg_with_audio(input_path, output_path, audio_path, audio_start, audio_duck_db)
                    else:
                        cmd = ['ffmpeg', '-i', input_path, '-c', 'copy', '-y', output_path]
            
                print(f"Running ffmpeg command: {' '.join(cmd)}")
                result = subprocess.run(cmd, capture_output=True, text=True)
            
                if result.returncode != 0:
                    print(f"FFmpeg error: {result.stderr}")
                    return jsonify({'error': f'Video editing failed: {result.stderr}'}), 500
        
            # Read edited video
            with open(output_path, 'rb') as f:
                edited_video = f.read()
        
            # Clean up temp files
            import shutil
            shutil.rmtree(temp_dir)
        
            # Return edited video
            from flask import send_file
            import io
            return send_file(
                io.BytesIO(edited_video),
                mimetype='video/mp4',
                as_attachment=True,
                download_name=f'edited_{datetime.now().strftime("%Y%m%d_%H%M%S")}.mp4'
            )
    
        except Exception as e:
            print(f"Error editing video: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    def build_ffmpeg_with_audio(input_video, output_path, audio_path, audio_start, audio_duck_db):
        """Build ffmpeg command to mix audio into video with optional ducking"""
        audio_start_sec = time_to_seconds(audio_start)
        
        # Create audio filters: delay the audio and duck original if needed
        if audio_duck_db < 0:
            # Original audio volume reduction
            volume_filter = f"volume={10**(audio_duck_db/20):.2f}"
            audio_filter = f"[0:a]{volume_filter}[orig_audio];[1:a]adelay={audio_start_sec*1000}|{audio_start_sec*1000}[effect_audio];[orig_audio][effect_audio]amix=inputs=2:duration=first[audio]"
        else:
            # No ducking
            audio_filter = f"[1:a]adelay={audio_start_sec*1000}|{audio_start_sec*1000}[effect_audio];[0:a][effect_audio]amix=inputs=2:duration=first[audio]"
        
        cmd = [
            'ffmpeg',
            '-i', input_video,
            '-i', audio_path,
            '-filter_complex', audio_filter,
            '-map', '0:v:0',
            '-map', '[audio]',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-y', output_path
        ]
        return cmd

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

    app.run(debug=True, host='0.0.0.0', port=5000)

# Paystack payment endpoints
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
