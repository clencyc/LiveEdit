import pytest

from utils.url import is_valid_url


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",
        "http://example.com/path?q=1",
        "https://sub.domain.co.uk:8080/path",
    ],
)
def test_is_valid_url_accepts_http_https(url):
    assert is_valid_url(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "",
        None,
        123,
        "example.com",
        "ftp://example.com",
        "javascript:alert(1)",
        "http://",
        "http://[::1",
    ],
)
def test_is_valid_url_rejects_invalid(url):
    assert is_valid_url(url) is False
