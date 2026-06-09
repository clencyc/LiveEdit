# Contributing to LiveEdit

Thank you for your interest in contributing to LiveEdit! This guide will help you get started with the development environment and explain our contribution process.

## 🚀 Getting Started

### Prerequisites
- **Git**
- **Node.js 18+** and **npm**
- **Python 3.10+**
- **FFmpeg** (for video processing)
- **Redis** (local or managed like Upstash)
- **PostgreSQL** (local or managed like Neon)

### Development Environment Setup

#### 1. Fork and Clone
```bash
git clone https://github.com/your-username/LiveEdit.git
cd LiveEdit
```

#### 2. Backend Setup
```bash
cd LiveEditBackend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Configure your environment variables
python init_db.py         # Initialize the database
```

#### 3. Frontend Setup
```bash
cd ../LiveEditFronten
npm install
cp .env.local.example .env.local  # Configure backend URL and API keys
```

#### 4. Running the Application
We provide helper scripts in the root directory:
- `./start-backend.sh`: Starts the Flask API
- `./start-frontend.sh`: Starts the Vite dev server
- `./start-celery.sh`: Starts the Celery worker

## 🧪 Testing

### Backend
Currently, we use manual testing and specific scripts.
- To test the API: `curl http://localhost:5000/health`
- Run specific tests: `python -m pytest` (if applicable) or run individual test scripts in `LiveEditBackend/`.

### Frontend
- Use `npm run dev` and verify changes in the browser.
- Check the console for any TypeScript or React errors.

*Note: We are actively looking to improve our automated test coverage. Contributions in this area are highly welcome!*

## 🎨 Code Style Guidelines

### Python (Backend)
- Follow [PEP 8](https://www.python.org/dev/peps/pep-0008/) style guide.
- Use type hints where possible.
- Use `black` or `ruff` for formatting.

### TypeScript/React (Frontend)
- Use functional components and hooks.
- Maintain strict TypeScript typing.
- Use CamelCase for files and PascalCase for components.
- Standard indentation: 2 spaces.

## 📝 Git Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation only changes
- `style:` Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- `refactor:` A code change that neither fixes a bug nor adds a feature
- `perf:` A code change that improves performance
- `test:` Adding missing tests or correcting existing tests
- `chore:` Changes to the build process or auxiliary tools and libraries such as documentation generation

**Example:**
`feat: add video clipping functionality`

## 🔄 Pull Request Process

1. **Create a Branch**: `git checkout -b feature/your-feature-name` or `fix/your-bug-name`.
2. **Commit Changes**: Follow the commit conventions.
3. **Verify Locally**: Ensure both frontend and backend run correctly.
4. **Push**: `git push origin your-branch-name`.
5. **Open PR**: Provide a clear description of the changes, the problem solved, and any relevant issue numbers.
6. **Code Review**: Address any feedback from the maintainers.

## 🐛 Reporting Bugs

If you find a bug, please open an issue using the **Bug Report** template. Include:
- A clear, descriptive title.
- Steps to reproduce.
- Expected vs. actual behavior.
- Screenshots if applicable.
- Environment details (OS, Browser, etc.).

## 💡 Feature Requests

We love hearing new ideas! Please use the **Feature Request** template to suggest improvements or new features.

---

Thank you for contributing to LiveEdit! 🎬
