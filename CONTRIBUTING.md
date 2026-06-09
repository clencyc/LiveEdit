# Contributing to LiveEdit

Thank you for your interest in contributing to LiveEdit! We appreciate all contributions, whether they're bug reports, feature requests, documentation improvements, or code changes.

## Getting Started

### Prerequisites
- Python 3.8+ (for backend)
- Node.js 16+ and npm (for frontend)
- Docker (optional, but recommended)
- Git

### Development Setup

#### Backend Setup
```bash
cd LiveEditBackend
pip install -r requirements.txt
python init_db.py
export GOOGLE_APPLICATION_CREDENTIALS="path/to/credentials.json"
python app.py
```

#### Frontend Setup
```bash
cd LiveEditFronten
npm install
npm run dev
```

For detailed backend and frontend deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Project Structure

```
LiveEditProject/
├── LiveEditBackend/          # Python Flask backend with AI integrations
│   ├── app.py               # Main Flask application
│   ├── video_tasks.py       # Celery task definitions
│   ├── ai_client.py         # AI service integrations
│   └── requirements.txt      # Python dependencies
├── LiveEditFronten/          # React/TypeScript frontend
│   ├── components/          # React components
│   ├── services/            # API and external service clients
│   ├── hooks/               # Custom React hooks
│   └── package.json         # Node.js dependencies
└── [Documentation files]     # Architecture, deployment guides, etc.
```

## Development Workflow

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/LiveEditProject.git
   cd LiveEditProject
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**
   - Keep commits focused and atomic
   - Write clear commit messages
   - Follow the code style guidelines below

4. **Test Your Changes**
   - Backend: Run unit tests and manual API testing
   - Frontend: Test in dev server and verify UI/UX
   - Test both locally and with Docker if possible

5. **Push and Submit a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   - Provide a clear description of your changes
   - Reference any related issues
   - Ensure CI/CD checks pass

## Code Style Guidelines

### Backend (Python)
- Follow PEP 8 conventions
- Use meaningful variable and function names
- Add docstrings to functions and classes
- Keep functions focused and modular

### Frontend (TypeScript/React)
- Use functional components with hooks
- Follow TypeScript strict mode
- Use meaningful component and variable names
- Keep components focused and reusable
- Maintain consistent formatting (consider using Prettier)

## Key Features to Understand

### Video Processing
- Async task handling with Celery (`video_tasks.py`)
- Video ingestion pipeline (`video_ingestion.py`)
- Director workflow system (`video_director.py`)

### AI Integration
- Gemini API integration (`services/gemini.ts`, `services/geminiLive.ts`)
- Backend AI client (`ai_client.py`)
- See [GEMINI_RETRY_FIX.md](GEMINI_RETRY_FIX.md) for known issues

### Real-time Features
- Live editing interface (`LiveInterface.tsx`)
- WebSocket communications via DirectorChatPanel

## Important Considerations

- **Authentication**: Firebase integration for user authentication
- **Subscriptions**: Tiered subscription system with payment integration
- **Environment Variables**: Backend requires Google Cloud credentials
- **Database**: Redis for caching, main DB (see deployment docs)

## Testing

Before submitting a PR:
- Test new features thoroughly
- Verify existing functionality isn't broken
- Test with different screen sizes (frontend)
- Check API responses (backend)

## Reporting Issues

When reporting bugs, please include:
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots/videos if applicable
- Environment details (OS, browser, Python version, etc.)

## Documentation

- Update relevant documentation files when making changes
- Keep README.md current
- Add comments for complex logic
- Update this guide if you change the project structure

## Questions?

Feel free to open an issue for clarification or discussion before starting work on a feature.

## License

By contributing to LiveEdit, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for helping make LiveEdit better! 🚀
