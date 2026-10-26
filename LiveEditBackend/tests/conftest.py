"""
Pytest configuration and hermetic fixtures for LiveEdit backend tests.
Ensures test execution is isolated without requiring live cloud or external services.
"""

import os
import sys

# Ensure LiveEditBackend root is on sys.path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Set fallback environment variables for test execution before modules import
os.environ.setdefault("DATABASE_URL", "postgresql://test_user:test_pass@localhost:5432/liveedit_test")
os.environ.setdefault("LOGTO_ENDPOINT", "https://test.logto.app")
os.environ.setdefault("LOGTO_APP_ID", "test-app-id")
os.environ.setdefault("USE_VERTEX_AI", "false")
os.environ.setdefault("GEMINI_API_KEY", "test-api-key")
os.environ.setdefault("JOB_WORKDIR", "/tmp/liveedit_test_jobs")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
