# Testing Guide

This document explains how to write and run tests for LiveEdit — both the React frontend and the Flask backend.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Frontend Testing (Jest + React Testing Library)](#frontend-testing)
- [Backend Testing (pytest)](#backend-testing)
- [Coverage Targets](#coverage-targets)
- [CI/CD](#cicd)
- [Writing New Tests](#writing-new-tests)

---

## Quick Start

**Run all frontend tests:**
```bash
cd LiveEditFronten
npm test
```

**Run all backend tests:**
```bash
cd LiveEditBackend
source venv/bin/activate
pytest
```

---

## Frontend Testing

### Setup

Dependencies are already in `package.json`. If starting fresh:

```bash
cd LiveEditFronten
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom ts-jest
```

### Running Tests

```bash
# Run all tests
npm test

# Run in watch mode (re-runs on file save)
npm test -- --watch

# Run with coverage report
npm test -- --coverage

# Run a specific test file
npm test -- ChatInterface.test.tsx
```

### Test File Locations

Place test files in `LiveEditFronten/__tests__/` or co-located with components as `ComponentName.test.tsx`.

### What to Test

**Component render tests** — does the component mount without errors and show the right elements?

**Hook tests** — do custom hooks return the correct state and handle updates?

**Service/API mock tests** — do service functions call the right endpoints and handle responses correctly?

### Frontend Test Examples

See `LiveEditFronten/__tests__/example.test.tsx` for full working examples covering:
- Component rendering
- User interactions
- API mock patterns
- Hook testing

---

## Backend Testing

### Setup

```bash
cd LiveEditBackend
source venv/bin/activate
pip install pytest pytest-cov httpx
```

### Running Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run with coverage report
pytest --cov=. --cov-report=term-missing

# Run a specific test file
pytest tests/test_example.py

# Run tests matching a keyword
pytest -k "chat"
```

### Test File Locations

Place all backend tests in `LiveEditBackend/tests/`. Name files `test_*.py`.

### What to Test

**Unit tests** — individual functions in isolation (e.g. input validation, response formatting)

**API endpoint tests** — does each Flask route return the correct status code and response shape?

**Database tests** — do queries return expected results? (use a test database or mock)

### Backend Test Examples

See `LiveEditBackend/tests/test_example.py` for full working examples covering:
- Health check endpoint
- Chat endpoint with mocked Gemini API
- Video analysis endpoint
- Error handling cases

---

## Coverage Targets

| Area | Target |
|---|---|
| Backend API endpoints | 80% |
| Backend utility functions | 70% |
| Frontend components | 70% |
| Frontend services | 80% |

These are minimums, not ceilings. More coverage is always better.

---

## CI/CD

Tests run automatically on every pull request via GitHub Actions. See `.github/workflows/tests.yml`.

The CI pipeline:
1. Runs backend pytest with coverage
2. Runs frontend Jest with coverage
3. Fails the PR if either suite fails

Do not merge a PR with failing tests.

---

## Writing New Tests

### Frontend checklist

- [ ] Test file named `ComponentName.test.tsx`
- [ ] Mock all external API calls (never hit real endpoints in tests)
- [ ] Test the happy path first, then error states
- [ ] Use `screen.getByRole` over `getByTestId` where possible (more accessible)
- [ ] Clean up after each test (`afterEach` cleanup is automatic with RTL)

### Backend checklist

- [ ] Test file named `test_feature.py`
- [ ] Use `pytest` fixtures for shared setup (app client, mock data)
- [ ] Mock `google.generativeai` calls — never hit the real Gemini API in tests
- [ ] Test both success responses (2xx) and error responses (4xx, 5xx)
- [ ] Keep each test focused on one behaviour

---

## Useful Resources

- [Jest docs](https://jestjs.io/docs/getting-started)
- [React Testing Library docs](https://testing-library.com/docs/react-testing-library/intro)
- [pytest docs](https://docs.pytest.org/en/stable/)
- [pytest-cov](https://pytest-cov.readthedocs.io/en/latest/)