# LiveEdit Technical Q&A
**Prepared for Opensource Fireside Chat Demo**

---

## 🎬 ARCHITECTURE QUESTIONS

### Q: How does the frontend communicate with the backend?
**A:**
The frontend (React/TypeScript) communicates with the Flask backend via REST API:

```
User Action (trim clip) 
  → React component state update 
  → POST /api/projects/<id>/timeline (send timeline JSON) 
  → Flask validates & processes 
  → Response with updated timeline 
  → Frontend re-renders
```

**Key flow:**
```typescript
// Frontend: TimelineComponent.tsx
const handleClipTrim = async (clipId, newStart, newEnd) => {
  const response = await fetch(`/api/projects/${projectId}/timeline`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clips: [{id: clipId, start: newStart, end: newEnd}]
    })
  });
  const updatedTimeline = await response.json();
  setTimeline(updatedTimeline);
};
```

**Backend: routes/timeline.py**
```python
@app.route('/api/projects//timeline', methods=['PATCH'])
def update_timeline(project_id):
    data = request.get_json()
    project = Project.query.get(project_id)
    
    # Update clips
    for clip_data in data.get('clips', []):
        clip = Clip.query.get(clip_data['id'])
        clip.start_time = clip_data['start']
        clip.end_time = clip_data['end']
    
    db.session.commit()
    return jsonify(project.to_dict()), 200
```

---

### Q: Why use a separate backend at all? Can't you do everything in React?
**A:**
Great question. In theory, you could use a serverless approach (AWS Lambda + S3), but a backend is better because:

1. **Security:** Never expose API keys in frontend code. Gemini API key lives on server.
2. **Heavy lifting:** Video analysis, rendering, transcoding need backend compute.
3. **Data persistence:** Need a database to store projects, clips, user data.
4. **Rate limiting:** Prevent abuse (e.g., someone hammering the API).
5. **Scalability:** Backend can be deployed to multiple servers; frontend can't.

You *could* do a client-side only version (Electron + local ffmpeg), but then users can't:
- Save projects to the cloud
- Share projects with collaborators
- Use the AI features (would need to expose API keys)

So: React frontend for UX, Flask backend for logic & security.

---

### Q: What happens if the Gemini API is down?
**A:**
Currently, the app will fail ungracefully. Better approach:

```python
# services/gemini_analyzer.py
import time
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
def call_gemini_api(frames):
    """Retry up to 3 times with exponential backoff"""
    try:
        response = genai.Client().messages.create(...)
        return response
    except google.api_core.exceptions.ServiceUnavailable:
        raise  # Tenacity will retry
    except Exception as e:
        logger.error(f'Gemini error: {e}')
        raise

# Fallback: use basic FFmpeg frame analysis if API fails
def fallback_analysis(video_path):
    """Basic analysis without AI (no scene detection, just duration)"""
    return {
        'scenes': [],
        'duration': get_video_duration(video_path),
        'note': 'AI analysis unavailable; basic info only'
    }
```

Better: Add a **fallback mode** where basic editing still works.

---

## 🤖 AI & GEMINI QUESTIONS

### Q: Why use Gemini instead of OpenAI's GPT-4 Vision?
**A:**
Three reasons:

1. **Cost:** Gemini is significantly cheaper for vision tasks (~$2.50/1M tokens vs GPT-4V ~$10/1M)
2. **Video support:** Gemini can handle video frames natively (OpenAI requires you to extract frames yourself)
3. **Speed:** Faster latency on video analysis tasks
4. **Hackathon:** Original submission used Gemini, so we kept it

Trade-off: GPT-4 might give *slightly* better analysis quality, but cost matters for a startup.

---

### Q: How do you handle the token limit for long videos?
**A:**
Gemini has a 2M token context window. A video frame ~= 200-500 tokens. So theoretically, you could send ~4,000 frames (~3 hours at 30fps).

But we do **smart sampling:**

```python
def extract_keyframes_smart(video_path, max_frames=30):
    """
    Extract ~30 frames instead of every frame.
    Use uniform sampling OR detect shot changes.
    """
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    # Uniform sampling: spread frames across video
    frame_indices = np.linspace(0, total_frames - 1, max_frames, dtype=int)
    
    frames = []
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            frames.append({
                'timestamp': idx / fps,
                'data': base64_encode(frame)
            })
    
    cap.release()
    return frames
```

**For 1-hour video:**
- 3600 seconds × 30 fps = 108,000 frames
- Sample every 3600 frame → ~30 keyframes
- 30 frames × 300 tokens ≈ 9,000 tokens (well under limit)

---

### Q: What if Gemini misidentifies a scene cut?
**A:**
Gemini returns confidence scores. We show annotations like:

```
High confidence (>0.9): Bright green marker
Medium (0.7-0.9): Yellow marker
Low (<0.7): Gray marker (hidden by default)
```

User can:
1. Ignore suggestions and edit manually
2. Adjust the threshold (only show cuts >0.85)
3. Report misidentifications (contributes to training data)

It's **AI-assisted, not AI-driven**. Human always has final say.

---

### Q: How do you extract frames from video for Gemini?
**A:**
```python
import cv2
import base64

def extract_frame_as_base64(video_path, timestamp):
    """Extract single frame at timestamp and encode as base64"""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_num = int(timestamp * fps)
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
    ret, frame = cap.read()
    cap.release()
    
    if ret:
        # Resize to reduce token usage
        frame = cv2.resize(frame, (640, 360))
        # Encode as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        b64 = base64.b64encode(buffer).decode('utf-8')
        return b64
    
    return None
```

Then send to Gemini as:
```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpeg",
    "data": ""
  }
}
```

---

## 🎥 VIDEO PROCESSING QUESTIONS

### Q: What's the bottleneck in rendering? Is it CPU or I/O?
**A:**
**CPU-bound** for most operations:
- Video encoding (H.264/VP9 codec) is CPU-intensive
- AI analysis (Gemini API calls) can hit API rate limits
- Audio processing is CPU-bound

**I/O-bound** for:
- Uploading large video files (network)
- Reading/writing to disk (SSD vs HDD matters)
- Database queries

**Profiling:**
```python
import cProfile
import pstats

def profile_rendering():
    pr = cProfile.Profile()
    pr.enable()
    
    render_video('input.mp4')
    
    pr.disable()
    ps = pstats.Stats(pr)
    ps.sort_stats('cumulative')
    ps.print_stats(20)  # Top 20 slowest functions
```

For users with slow machines, we could add:
- **GPU acceleration** (NVIDIA CUDA, Apple Metal)
- **Progressive rendering** (stream low-res while encoding high-res)
- **Cloud rendering** (offload to cloud GPU)

---

### Q: How do you handle different video codecs (H.264, VP9, AV1)?
**A:**
FFmpeg abstracts this. When we render:

```python
import subprocess

def render_video(timeline, output_path, codec='libx264', preset='medium'):
    """
    FFmpeg handles codec automatically.
    preset: ultrafast < superfast < veryfast < faster < fast < medium < slow < slower < veryslow
    """
    cmd = [
        'ffmpeg',
        '-f', 'concat',  # Use concat demuxer for clips
        '-safe', '0',
        '-i', 'filelist.txt',
        '-c:v', codec,           # Video codec
        '-preset', preset,       # Speed vs quality tradeoff
        '-crf', '23',           # Quality (lower = better, 0-51)
        '-c:a', 'aac',          # Audio codec
        output_path
    ]
    
    subprocess.run(cmd)
```

**Common codecs:**
- **H.264** (libx264): Universal, good compression
- **VP9** (libvpx-vp9): Open-source, better quality
- **AV1** (libaom): Best compression, very slow
- **H.265** (libx265): Better than H.264, wider support now

---

### Q: What's the maximum video length you can handle?
**A:**
Theoretically unlimited, but:

|
 Duration 
|
 Gemini Analysis 
|
 Rendering 
|
 Storage 
|
|
----------
|
-----------------
|
-----------
|
---------
|
|
 <10 min 
|
 30-60s 
|
 2-5 min 
|
 ✅ 
|
|
 30 min 
|
 90-120s 
|
 10-15 min 
|
 ✅ 
|
|
 1 hour 
|
 180s 
|
 30-45 min 
|
 ✅ 
|
|
 4+ hours 
|
 ⚠️ API limits 
|
 ⚠️ Very slow 
|
 ❌ Storage 
|

**Bottlenecks:**
1. Gemini API has rate limits (1 request/second by default)
2. FFmpeg encoding is CPU-intensive
3. Storage: 1 hour of 1080p ~= 5-10 GB

**Solution for long videos:**
```python
def process_long_video_in_chunks(video_path, chunk_duration=10):
    """Process video in chunks to avoid timeouts"""
    duration = get_video_duration(video_path)
    chunks = []
    
    for start in range(0, duration, chunk_duration):
        end = min(start + chunk_duration, duration)
        chunk = extract_segment(video_path, start, end)
        analysis = analyze_chunk(chunk)
        chunks.append(analysis)
    
    # Merge analyses
    full_analysis = merge_chunk_analyses(chunks)
    return full_analysis
```

---

## 🗄️ DATABASE QUESTIONS

### Q: How do you store video files? Database or cloud storage?
**A:**
**Cloud storage (S3-like)** is better because:
- Video files are huge (too big for database)
- Need fast streaming/download
- Easier to scale

Currently, we use **local filesystem** for demo, but production should use:
- AWS S3
- Google Cloud Storage
- MinIO (self-hosted S3-compatible)

```python
# services/storage.py
class StorageBackend:
    def upload(self, file_path, remote_name):
        """Upload file to storage"""
        pass
    
    def download(self, remote_name, local_path):
        """Download file from storage"""
        pass

class S3Storage(StorageBackend):
    def __init__(self, bucket_name):
        import boto3
        self.s3 = boto3.client('s3')
        self.bucket = bucket_name
    
    def upload(self, file_path, remote_name):
        self.s3.upload_file(file_path, self.bucket, remote_name)
    
    def download(self, remote_name, local_path):
        self.s3.download_file(self.bucket, remote_name, local_path)
```

Database stores metadata (file name, size, user_id, timestamp), not the file itself.

---

### Q: How do you handle concurrent users editing the same project?
**A:**
**Currently: No multi-user support.**

For collaboration, you'd need:
1. **Conflict resolution:** Last write wins? Merge edits?
2. **Real-time sync:** WebSocket to push changes to other clients
3. **Operational Transform (OT) or CRDT:** Complex sync algorithm

```python
# routes/collab.py (pseudo-code for future)
from flask_socketio import SocketIO, emit, join_room

socketio = SocketIO(app)

@socketio.on('timeline_update')
def handle_timeline_update(data):
    project_id = data['project_id']
    user_id = request.sid  # User's socket ID
    
    # Broadcast to other users in same project
    emit('timeline_update', data, room=project_id, skip_sid=user_id)
```

For now: single-user per project. Document this limitation and mark collab as "future work."

---

## 🔒 SECURITY QUESTIONS

### Q: How do you prevent users from accessing other users' videos?
**A:**
**Authentication & Authorization:**

```python
from functools import wraps
import jwt

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Missing token'}), 401
        
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            user_id = payload['user_id']
        except:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(user_id, *args, **kwargs)
    
    return decorated

@app.route('/api/projects/', methods=['GET'])
@token_required
def get_project(user_id, project_id):
    project = Project.query.get(project_id)
    
    # Check ownership
    if project.user_id != user_id:
        return jsonify({'error': 'Forbidden'}), 403
    
    return jsonify(project.to_dict()), 200
```

**Best practices:**
1. Always verify `project.user_id == current_user.id`
2. Use JWT tokens with expiration
3. HTTPS only
4. Rate limiting on login

---

### Q: Where do you store Gemini API keys?
**A:**
**Never in code or frontend.**

Use environment variables:
```bash
# .env (never commit to Git)
GEMINI_API_KEY=AIzaSy...
DATABASE_URL=postgresql://...
SECRET_KEY=xxx...
```

```python
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_KEY:
    raise ValueError('GEMINI_API_KEY not set')
```

In production, use secret management:
- AWS Secrets Manager
- Google Secret Manager
- HashiCorp Vault

---

## 📈 SCALING QUESTIONS

### Q: How do you scale this to 10,000 concurrent users?
**A:**
**Current architecture (single server) breaks at ~100 concurrent users.**

To scale to 10k:

1. **Load balancing:**
```
[10k users]
    ↓
[Nginx/HAProxy]
    ↓
[API Server 1] [API Server 2] [API Server 3]
    ↓ ↓ ↓
[PostgreSQL (shared)]
```

2. **Async jobs (Celery):**
```
[10k users upload videos]
    ↓
[Task queue (Redis)]
    ↓
[10 Celery workers processing in parallel]
```

3. **Caching (Redis):**
```python
@app.route('/api/projects/')
def get_project(project_id):
    # Check cache first
    cached = redis_client.get(f'project:{project_id}')
    if cached:
        return json.loads(cached)
    
    project = Project.query.get(project_id)
    redis_client.setex(f'project:{project_id}', 3600, json.dumps(project.to_dict()))
    return jsonify(project.to_dict())
```

4. **Database optimization:**
- Connection pooling (PgBouncer)
- Read replicas for queries
- Partitioning large tables

5. **CDN for static assets:**
- CloudFlare for videos
- Serve JS/CSS from edge locations

---

### Q: What's the cost to run this for 1,000 active users?
**A:**
**Rough estimate (AWS/GCP):**

|
 Component 
|
 Cost/month 
|
 Notes 
|
|
-----------
|
-----------
|
-------
|
|
 API Servers (auto-scale) 
|
 $500-1,000 
|
 3-5 t3.medium instances 
|
|
 PostgreSQL (managed) 
|
 $200-500 
|
 db.t3.medium, automated backups 
|
|
 Redis (cache) 
|
 $50-100 
|
 r6g.large 
|
|
 S3 Storage 
|
 $0.023/GB 
|
 100 TB video = $2,300 
|
|
 Gemini API 
|
 $100-500 
|
 Variable usage 
|
|
 Bandwidth 
|
 $100-300 
|
 Egress costs 
|
|
**
Total
**
|
**
~$3,500-5,000
**
|
 Per 1,000 active users 
|

**Revenue needed:** At $10/user/month → $10,000/month = **sustainable**

---

## 🧪 TESTING QUESTIONS

### Q: How do you test video processing without large test videos?
**A:**
Create **synthetic test videos:**

```python
def create_test_video(duration_sec=10, resolution=(320, 240)):
    """Generate a test video programmatically"""
    import cv2
    import numpy as np
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter('/tmp/test.mp4', fourcc, 30.0, resolution)
    
    for frame_num in range(duration_sec * 30):
        # Create a test frame: solid colors changing over time
        frame = np.full((*resolution[::-1], 3), frame_num % 256, dtype=np.uint8)
        out.write(frame)
    
    out.release()
    return '/tmp/test.mp4'
```

Run tests with these small files instead of large real videos.

---

### Q: How do you test the Gemini API without making actual API calls?
**A:**
**Mock the API:**

```python
# tests/test_gemini.py
from unittest.mock import patch, MagicMock

@patch('services.gemini_analyzer.genai.Client')
def test_analyze_video(mock_client):
    """Mock Gemini API response"""
    mock_response = {
        'scenes': [
            {'start': 0, 'end': 5, 'type': 'scene', 'confidence': 0.95}
        ],
        'cuts': [
            {'timestamp': 5, 'type': 'hard_cut', 'confidence': 0.92}
        ]
    }
    
    mock_client.return_value.messages.create.return_value.content = [
        MagicMock(text=json.dumps(mock_response))
    ]
    
    result = analyze_video('test.mp4')
    assert result['scenes'][0]['confidence'] == 0.95
```

This tests your logic without API costs.

---

## 🎓 LEARNING & CONTRIBUTING QUESTIONS

### Q: What's the best way to get up to speed on the codebase?
**A:**
1. **Read architecture diagram** (page 12 of slides)
2. **Clone repo:** `git clone https://github.com/clencyc/LiveEdit`
3. **Read CONTRIBUTING.md** for setup
4. **Run locally:** Follow quickstart
5. **Pick a small issue** (#2 Dark Mode, #17 Filename) — something with isolated scope
6. **Make a PR:** Early feedback helps you learn fast

---

### Q: What should I focus on if I want to contribute to the AI parts?
**A:**
Start with Issue #10 (Scene Detection):
- Read the Gemini_Analysis_Prompt.md
- Experiment with different prompts
- Test on real videos
- Submit findings as a PR

Then move to Issue #12 (Captions) if you want more AI/ML work.

---

### Q: I'm not sure I'm experienced enough to contribute. What should I start with?
**A:**
**Start here (truly beginner-friendly):**
1. Issue #2 (Dark Mode) — CSS + React hooks
2. Issue #17 (Filename Sanitization) — One small function
3. Issue #13 (README) — Documentation, no code

These take 1-2 hours and get you comfortable with the repo. Then tackle medium issues.

---

## 🚀 DEPLOYMENT QUESTIONS

### Q: How do you deploy to production?
**A:**
**GitHub Actions CI/CD pipeline:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: |
          pip install -r requirements.txt
          pytest

  deploy:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Vercel (frontend)
        run: vercel --prod
      - name: Deploy to Heroku (backend)
        run: git push heroku main
```

On every push to `main`:
1. Run tests
2. Build Docker image
3. Push to registry
4. Deploy to Kubernetes or Heroku

---

### Q: What if a render job crashes? How do you handle it?
**A:**
Celery has built-in retry logic:

```python
@celery_app.task(bind=True, max_retries=3)
def render_video_task(self, project_id):
    try:
        # Render logic
        pass
    except Exception as exc:
        # Retry with exponential backoff
        self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

Also log to Sentry so you see errors in dashboard.

---

## 📝 FINAL THOUGHTS

**For the Q&A segment:**
- Be honest about limitations
- Explain trade-offs (cost vs speed, etc.)
- Mention what's "future work"
- Invite contributors to help solve hard problems

**Key message:** This is **early-stage software**. Bugs are features. That's why we're building it open-source—to improve it together.