from urllib.parse import urlparse


def is_valid_url(url: str) -> bool:
    """Return True if url is an http(s) URL with a non-empty hostname."""
    if not isinstance(url, str):
        return False
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.hostname:
        return False
    return True
