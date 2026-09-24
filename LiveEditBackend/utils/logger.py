import os
import json
import logging
import time
import traceback
import re
from datetime import datetime
from flask import request, g
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

# Load Env config
LOG_LEVEL_STR = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_LEVEL = getattr(logging, LOG_LEVEL_STR, logging.INFO)
JSON_LOGS = os.getenv("JSON_LOGS", "true").strip().lower() in {"1", "true", "yes", "on"}
SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()

# Regular expressions for sanitization
# Sensitive keys: api_key, key, token, secret, auth, password, credentials
SENSITIVE_KEY_RE = re.compile(
    r'(api[-_]?key|token|secret|auth|password|credentials|signature|payload)',
    re.IGNORECASE
)

# Absolute path pattern: e.g., /home/user/... or C:\Users\... or absolute path
PATH_RE = re.compile(
    r'(?:/[a-zA-Z0-9_\.\-]+)+',
    re.IGNORECASE
)

def sanitize_value(key, value):
    """Sanitize individual values based on keys."""
    if isinstance(key, str) and SENSITIVE_KEY_RE.search(key):
        return "[MASKED]"
    if isinstance(value, str):
        # Check if value itself looks like an API key/secret or token
        # E.g. AIzaSy... (Gemini) or long hex
        if len(value) > 20 and not (" " in value or "/" in value or "\\" in value):
            return "[MASKED]"
        return sanitize_string(value)
    return value

def sanitize_string(text: str) -> str:
    """Mask absolute paths and secrets in generic string messages."""
    if not isinstance(text, str):
        return text
    # Mask absolute file paths, except we should keep the filename
    def path_replacer(match):
        path = match.group(0)
        # Avoid masking simple URLs or short fragments
        if path.startswith("/api/") or path == "/health" or len(path) < 4:
            return path
        # Keep only the basename of the file
        parts = path.split("/")
        if parts:
            filename = parts[-1]
            if "." in filename:
                return f"[PATH]/{filename}"
        return "[PATH]"
    
    return PATH_RE.sub(path_replacer, text)

def sanitize_data(data):
    """Recursively sanitize dicts, lists, and strings to strip sensitive info."""
    if isinstance(data, dict):
        return {str(k): sanitize_data(sanitize_value(k, v)) for k, v in data.items()}
    if isinstance(data, list):
        return [sanitize_data(v) for v in data]
    if isinstance(data, str):
        return sanitize_string(data)
    return data

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": sanitize_string(record.getMessage()),
        }
        
        # Include custom context if available on the record
        if hasattr(record, "endpoint"):
            log_data["endpoint"] = record.endpoint
        if hasattr(record, "error_message"):
            log_data["error_message"] = sanitize_string(record.error_message)
        
        # Add context fields
        context = {}
        for key in ["request_id", "user_id", "video_id", "duration_ms", "status_code", "method", "ip"]:
            if hasattr(record, key):
                context[key] = getattr(record, key)
        
        # Pull request context if in a Flask application context
        try:
            if request:
                if "endpoint" not in log_data:
                    log_data["endpoint"] = request.path
                context["method"] = request.method
                context["ip"] = request.remote_addr
                # Extract query parameters or headers (sanitized)
                context["query_params"] = sanitize_data(dict(request.args))
                # Check for user identity (e.g. from g.user or session or request)
                if hasattr(g, "user_id"):
                    context["user_id"] = g.user_id
                elif hasattr(g, "user") and hasattr(g.user, "id"):
                    context["user_id"] = g.user.id
                elif hasattr(g, "user") and isinstance(g.user, dict) and "id" in g.user:
                    context["user_id"] = g.user["id"]
                
                # Check for video context in Flask 'g'
                if hasattr(g, "video_id"):
                    context["video_id"] = g.video_id
                if hasattr(g, "video_info"):
                    context["video_info"] = sanitize_data(g.video_info)
        except RuntimeError:
            # Outside request context
            pass
            
        if context:
            log_data["context"] = context

        if record.exc_info:
            log_data["traceback"] = self.formatException(record.exc_info)

        # Include additional extra args passed to logger
        extra_keys = record.__dict__.keys() - logging.LogRecord(None, None, None, None, None, None, None).__dict__.keys()
        for k in extra_keys:
            if k not in ["endpoint", "error_message", "request_id", "user_id", "video_id", "duration_ms", "status_code", "method", "ip"]:
                log_data[k] = sanitize_data(record.__dict__[k])

        return json.dumps(log_data)

# Sentry integration
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FlaskIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

def setup_logger(name="LiveEdit"):
    logger = logging.getLogger(name)
    logger.setLevel(LOG_LEVEL)
    
    # Avoid duplicate handlers
    if not logger.handlers:
        handler = logging.StreamHandler()
        if JSON_LOGS:
            handler.setFormatter(JsonFormatter())
        else:
            handler.setFormatter(logging.Formatter(
                "[%(asctime)s] %(levelname)s in %(name)s: %(message)s"
            ))
        logger.addHandler(handler)
        logger.propagate = False
        
    return logger

# Create standard logger
logger = setup_logger()

# Request logging middleware
def init_app_logging(app):
    """Register request logging middleware to flask application."""
    @app.before_request
    def before_request():
        g.start_time = time.time()
        
        # Clean request headers
        headers = {k: v for k, v in request.headers.items() if k.lower() not in ["authorization", "cookie"]}
        
        log_payload = {
            "method": request.method,
            "path": request.path,
            "headers": sanitize_data(headers),
        }
        
        # Log request (avoid payload if it's too big, e.g. files, but log small JSON payloads)
        if request.is_json and request.content_length and request.content_length < 10000:
            try:
                log_payload["body"] = sanitize_data(request.get_json())
            except Exception:
                pass
                
        logger.info(f"Incoming request: {request.method} {request.path}", extra=log_payload)

    @app.after_request
    def after_request(response):
        if hasattr(g, "start_time"):
            duration_ms = int((time.time() - g.start_time) * 1000)
        else:
            duration_ms = 0
            
        # Log response status and duration
        log_payload = {
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "method": request.method,
            "path": request.path,
        }
        
        # Only log response bodies for small JSON responses
        if response.is_json and response.content_length and response.content_length < 10000:
            try:
                log_payload["response_body"] = sanitize_data(response.get_json())
            except Exception:
                pass
                
        # Determine level based on status code
        if response.status_code >= 500:
            logger.error(f"Outgoing response: {response.status_code} ({duration_ms}ms)", extra=log_payload)
        elif response.status_code >= 400:
            logger.warning(f"Outgoing response: {response.status_code} ({duration_ms}ms)", extra=log_payload)
        else:
            logger.info(f"Outgoing response: {response.status_code} ({duration_ms}ms)", extra=log_payload)
            
        return response

    @app.teardown_request
    def teardown_request(exception=None):
        if exception:
            # Fetch context
            video_info = getattr(g, "video_info", None)
            user_id = getattr(g, "user_id", None)
            
            error_ctx = {
                "error_message": str(exception),
                "endpoint": request.path,
                "method": request.method,
            }
            if video_info:
                error_ctx["video_info"] = video_info
            if user_id:
                error_ctx["user_id"] = user_id
                
            logger.error(
                f"Unhandled exception during request processing: {str(exception)}",
                exc_info=exception,
                extra=error_ctx
            )
