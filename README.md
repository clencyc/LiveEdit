# LiveEdit - AI-Powered Video Editor

A full-stack application combining React frontend with Python backend for AI-driven video analysis and editing.
https://live-edit-eight.vercel.app/
## 🚀 Quick Start

### Option 1: Using Setup Script (Recommended)
```bash
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

**Backend Setup:**
```bash
cd LiveEditBackend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

**Frontend Setup (new terminal):**
```bash
cd LiveEditFronten
npm install
npm run dev
```

## 📁 Project Structure

```
LiveEditProject/
├── LiveEditBackend/          # Python Flask backend
│   ├── app.py                # Main Flask application
│   ├── main.ipynb            # Development notebook
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Backend configuration
│
├── LiveEditFronten/          # React frontend
│   ├── App.tsx               # Main app component
│   ├── index.tsx             # Entry point
│   ├── types.ts              # TypeScript types
│   ├── vite.config.ts        # Vite configuration
│   ├── components/           # React components
│   │   ├── ChatInterface.tsx
│   │   ├── LiveInterface.tsx
│   │   ├── MediaSidebar.tsx
│   │   └── VideoGenerator.tsx
│   ├── services/             # API services
│   │   └── gemini.ts         # Gemini & backend integration
│   ├── context/              # React context
│   │   └── ThemeContext.tsx
│   ├── utils/                # Utilities
│   │   └── audio-utils.ts
│   └── .env.local            # Frontend configuration
│
└── Configuration Files
    ├── setup.sh              # Automated setup script
    ├── start-backend.sh      # Backend startup
    ├── start-frontend.sh     # Frontend startup
    └── SETUP_GUIDE.md        # Detailed setup guide
```

## 🔌 Backend Architecture

**Framework:** Flask  
**API Server:** http://localhost:5000

### Endpoints

#### Health Check
```
GET /health
```
Response: `{"status": "ok", "message": "Backend is running"}`

#### Chat Endpoint
```
POST /api/chat
Content-Type: application/json

{
  "message": "Your message here"
}
```
Response:
```json
{
  "message": "AI response",
  "status": "success"
}
```

#### Video Analysis
```
POST /api/analyze-video
Content-Type: multipart/form-data

FormData:
- video_file: (file)
- prompt: "Analysis prompt"
```
Response:
```json
{
  "summary": "Video description",
  "key_events": [...],
  "edit_plan": [
    {"type": "cut", "start": "00:12", "end": "00:45"},
    ...
  ]
}
```

## 🎨 Frontend Architecture

**Framework:** React 19 + TypeScript + Vite  
**Dev Server:** http://localhost:5173

### Key Services

#### `services/gemini.ts`
- `getAiClient()` - Initialize Gemini API client
- `chatWithBackend(message)` - Send message to backend
- `analyzeVideoWithBackend(file, prompt)` - Analyze video
- `generateAiVideo(config)` - Generate video with Gemini

### Components

- **ChatInterface** - Text chat with AI
- **LiveInterface** - Real-time AI interaction
- **VideoGenerator** - AI video generation
- **MediaSidebar** - Asset management

## ⚙️ Configuration

### Backend (.env)
```env
GEMINI_API_KEY=your_api_key_here
FLASK_ENV=development
FLASK_DEBUG=True
```

### Frontend (.env.local)
```env
VITE_BACKEND_URL=http://localhost:5000
VITE_GEMINI_API_KEY=your_api_key_here
```

## 🔗 Integration Flow

```
User Input (React)
    ↓
ChatInterface.tsx
    ↓
services/gemini.ts (chatWithBackend)
    ↓
Backend /api/chat (Flask)
    ↓
Google Gemini API
    ↓
Response → Frontend
    ↓
Display in Chat
```

## 🎯 Features

✅ **AI Chat Interface** - Talk to Gemini AI  
✅ **Video Analysis** - Analyze videos for editing suggestions  
✅ **Video Generation** - Generate videos with AI  
✅ **Asset Management** - Organize media files  
✅ **Live AI Mode** - Real-time interaction  
✅ **Theme Support** - Dark/Light modes  
✅ **Responsive Design** - Works on desktop & tablet  

## 📦 Dependencies

### Backend
- Flask 3.0.0
- Flask-CORS 4.0.0
- google-generativeai 0.3.0
- python-dotenv 1.0.0

### Frontend
- React 19.2.3
- React DOM 19.2.3
- @google/genai 1.37.0
- Vite 6.2.0
- TypeScript 5.8.2

## 🚀 Deployment

### Backend (Python)
Deploy to: Heroku, Railway, Render, or DigitalOcean

Update frontend `.env.local`:
```env
VITE_BACKEND_URL=https://your-backend-url.com
```

### Frontend (React)
Deploy to: Vercel, Netlify, or GitHub Pages

```bash
npm run build
```

## 🔧 Development

### Backend Development
```bash
cd LiveEditBackend
source venv/bin/activate
python app.py  # with FLASK_DEBUG=True for auto-reload
```

### Frontend Development
```bash
cd LiveEditFronten
npm run dev
```

### Testing Backend
```bash
curl http://localhost:5000/health
```

## 📝 API Testing

### Using curl
```bash
# Test chat
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# Test video analysis
curl -X POST http://localhost:5000/api/analyze-video \
  -F "video_file=@video.mp4" \
  -F "prompt=Analyze this video"
```

## 🐛 Troubleshooting

### Backend Issues

**Port 5000 already in use:**
```bash
lsof -i :5000  # Find process
kill -9 <PID>  # Kill process
```

**Module not found:**
```bash
source venv/bin/activate
pip install -r requirements.txt
```

**API key errors:**
- Check `.env` file exists in `LiveEditBackend/`
- Verify `GEMINI_API_KEY` is valid
- Restart Flask server

### Frontend Issues

**Backend not responding:**
- Check backend is running on port 5000
- Verify `VITE_BACKEND_URL` in `.env.local`
- Check browser console for CORS errors

**Dependencies missing:**
```bash
cd LiveEditFronten
rm -rf node_modules package-lock.json
npm install
```

## 📚 Documentation

- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Detailed setup instructions
- Backend: `LiveEditBackend/app.py` - See docstrings for endpoint details
- Frontend: `LiveEditFronten/services/gemini.ts` - Service documentation

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test locally (both frontend & backend)
4. Submit PR with description

## 📄 License

MIT License - See LICENSE file

## ✨ Next Steps

1. **Video Analysis UI** - Implement video upload & analysis display
2. **Authentication** - Add user login/signup
3. **Database** - Store analysis results & user data
4. **Queue System** - Handle long-running tasks
5. **WebSockets** - Real-time progress updates
6. **Mobile App** - React Native version

---

**Questions?** Check SETUP_GUIDE.md or the API documentation above.
