"""
Redis analysis-cache integration tests (no real Redis / Gemini required).

Run:
  cd LiveEditBackend && pytest tests/test_analysis_cache.py -v
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import os
import tempfile
from unittest.mock import patch

import pytest


class FakeRedis:
    """Minimal Redis stand-in supporting the cache code paths."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    def get(self, key: str):
        return self.store.get(key)

    def setex(self, key: str, ttl: int, value: str) -> bool:
        self.store[key] = value
        self.ttls[key] = int(ttl)
        return True

    def incr(self, key: str) -> int:
        current = int(self.store.get(key) or 0)
        current += 1
        self.store[key] = str(current)
        return current

    def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if key in self.store:
                del self.store[key]
                deleted += 1
            self.ttls.pop(key, None)
        return deleted

    def scan_iter(self, match: str | None = None, count: int = 100):
        for key in list(self.store.keys()):
            if match is None or fnmatch.fnmatch(key, match):
                yield key


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest.fixture
def video_file():
    """Temp video bytes with a stable MD5 for key assertions."""
    content = b"fake-video-content-for-cache-tests-v1"
    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.write(fd, content)
    os.close(fd)
    try:
        yield path, content, hashlib.md5(content).hexdigest()
    finally:
        if os.path.exists(path):
            os.unlink(path)


@pytest.fixture
def app():
    from app import app as flask_app

    flask_app.config["TESTING"] = True
    flask_app.config["DEBUG"] = False
    yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


# ─────────────────────────────────────────────
# Task-level cache behavior (analyze_video_task)
# ─────────────────────────────────────────────


class TestAnalyzeVideoTaskCache:
    @patch("video_tasks.update_job")
    def test_miss_stores_value_and_increments_misses(
        self, mock_update_job, fake_redis, video_file
    ):
        path, _content, file_hash = video_file
        cache_key = f"liveedit:analysis:{file_hash}"

        with (
            patch("video_tasks._redis_client", fake_redis),
            patch("video_tasks.ENABLE_ANALYSIS_CACHE", True),
            patch("video_tasks.CACHE_TTL", 604800),
        ):
            from video_tasks import analyze_video_task

            result = analyze_video_task(
                job_id="job-miss-1",
                video_path=path,
                user_prompt="Analyze",
                skip_cache=False,
            )

        assert result["summary"] == "test cached analysis"
        assert cache_key in fake_redis.store
        stored = json.loads(fake_redis.store[cache_key])
        assert "timestamp" in stored
        assert stored["analysis"] == result
        assert fake_redis.ttls[cache_key] == 604800
        assert fake_redis.get("liveedit:cache:misses") == "1"
        assert fake_redis.get("liveedit:cache:hits") is None

        # Job should record MISS
        kwargs = mock_update_job.call_args.kwargs
        assert kwargs.get("cache_status") == "MISS"
        assert kwargs.get("status") == "succeeded"

    @patch("video_tasks.update_job")
    def test_hit_returns_cached_and_increments_hits(
        self, mock_update_job, fake_redis, video_file
    ):
        path, _content, file_hash = video_file
        cache_key = f"liveedit:analysis:{file_hash}"
        cached_analysis = {
            "summary": "from redis",
            "key_events": [{"time": "00:01", "event": "x"}],
            "edit_plan": [{"type": "cut", "start": "00:00", "end": "00:02"}],
        }
        fake_redis.setex(
            cache_key,
            604800,
            json.dumps({"timestamp": 123.0, "analysis": cached_analysis}),
        )

        with (
            patch("video_tasks._redis_client", fake_redis),
            patch("video_tasks.ENABLE_ANALYSIS_CACHE", True),
        ):
            from video_tasks import analyze_video_task

            result = analyze_video_task(
                job_id="job-hit-1",
                video_path=path,
                user_prompt="Analyze",
                skip_cache=False,
            )

        assert result == cached_analysis
        assert fake_redis.get("liveedit:cache:hits") == "1"
        assert fake_redis.get("liveedit:cache:misses") is None
        kwargs = mock_update_job.call_args.kwargs
        assert kwargs.get("cache_status") == "HIT"
        assert "cache hit" in (kwargs.get("message") or "").lower()

    @patch("video_tasks.update_job")
    def test_skip_cache_bypasses_hit_and_does_not_count_miss(
        self, mock_update_job, fake_redis, video_file
    ):
        path, _content, file_hash = video_file
        cache_key = f"liveedit:analysis:{file_hash}"
        fake_redis.setex(
            cache_key,
            604800,
            json.dumps(
                {
                    "timestamp": 1.0,
                    "analysis": {
                        "summary": "old",
                        "key_events": [],
                        "edit_plan": [],
                    },
                }
            ),
        )

        with (
            patch("video_tasks._redis_client", fake_redis),
            patch("video_tasks.ENABLE_ANALYSIS_CACHE", True),
            patch("video_tasks.CACHE_TTL", 604800),
        ):
            from video_tasks import analyze_video_task

            result = analyze_video_task(
                job_id="job-skip-1",
                video_path=path,
                user_prompt="Analyze",
                skip_cache=True,
            )

        # Stub path still runs; should not return the old cached summary
        assert result["summary"] == "test cached analysis"
        assert fake_redis.get("liveedit:cache:hits") is None
        assert fake_redis.get("liveedit:cache:misses") is None
        kwargs = mock_update_job.call_args.kwargs
        assert kwargs.get("cache_status") == "BYPASS"
        # Still refreshes cache after recompute
        stored = json.loads(fake_redis.store[cache_key])
        assert stored["analysis"]["summary"] == "test cached analysis"

    @patch("video_tasks.update_job")
    def test_cache_disabled_skips_redis(self, mock_update_job, fake_redis, video_file):
        path, _content, file_hash = video_file

        with (
            patch("video_tasks._redis_client", fake_redis),
            patch("video_tasks.ENABLE_ANALYSIS_CACHE", False),
        ):
            from video_tasks import analyze_video_task

            analyze_video_task(
                job_id="job-off-1",
                video_path=path,
                user_prompt="Analyze",
                skip_cache=False,
            )

        assert fake_redis.store == {}
        kwargs = mock_update_job.call_args.kwargs
        assert kwargs.get("cache_status") == "BYPASS"

    @patch("video_tasks.update_job")
    def test_no_redis_client_is_bypass(self, mock_update_job, video_file):
        path, _content, _hash = video_file

        with (
            patch("video_tasks._redis_client", None),
            patch("video_tasks.ENABLE_ANALYSIS_CACHE", True),
        ):
            from video_tasks import analyze_video_task

            result = analyze_video_task(
                job_id="job-noredis-1",
                video_path=path,
                user_prompt="Analyze",
            )

        assert "summary" in result
        kwargs = mock_update_job.call_args.kwargs
        assert kwargs.get("cache_status") == "BYPASS"


# ─────────────────────────────────────────────
# API: GET /api/cache/stats
# ─────────────────────────────────────────────


class TestCacheStatsEndpoint:
    def test_stats_with_redis_counters(self, client, fake_redis):
        fake_redis.incr("liveedit:cache:hits")
        fake_redis.incr("liveedit:cache:hits")
        fake_redis.incr("liveedit:cache:hits")
        fake_redis.incr("liveedit:cache:misses")

        with (
            patch("app._redis_client", fake_redis),
            patch("app.ENABLE_ANALYSIS_CACHE", True),
            patch("app.CACHE_TTL", 604800),
        ):
            response = client.get("/api/cache/stats")

        assert response.status_code == 200
        data = response.get_json()
        assert data["hits"] == 3
        assert data["misses"] == 1
        assert data["total_requests"] == 4
        assert data["hit_ratio"] == 75.0
        assert data["cache_enabled"] is True
        assert data["cache_ttl"] == 604800
        assert data["redis_connected"] is True

    def test_stats_missing_keys_are_zero(self, client, fake_redis):
        with patch("app._redis_client", fake_redis):
            response = client.get("/api/cache/stats")

        data = response.get_json()
        assert data["hits"] == 0
        assert data["misses"] == 0
        assert data["total_requests"] == 0
        assert data["hit_ratio"] == 0.0
        assert data["redis_connected"] is True

    def test_stats_without_redis(self, client):
        with (
            patch("app._redis_client", None),
            patch("app.ENABLE_ANALYSIS_CACHE", True),
            patch("app.CACHE_TTL", 604800),
        ):
            response = client.get("/api/cache/stats")

        assert response.status_code == 200
        data = response.get_json()
        assert data["hits"] == 0
        assert data["misses"] == 0
        assert data["total_requests"] == 0
        assert data["hit_ratio"] == 0.0
        assert data["redis_connected"] is False
        assert data["cache_enabled"] is True
        assert data["cache_ttl"] == 604800


# ─────────────────────────────────────────────
# API: POST /api/cache/clear
# ─────────────────────────────────────────────


class TestCacheClearEndpoint:
    def test_clear_deletes_analysis_keys_and_metrics(self, client, fake_redis):
        fake_redis.setex(
            "liveedit:analysis:aaa",
            100,
            json.dumps({"timestamp": 1, "analysis": {"summary": "a"}}),
        )
        fake_redis.setex(
            "liveedit:analysis:bbb",
            100,
            json.dumps({"timestamp": 2, "analysis": {"summary": "b"}}),
        )
        fake_redis.incr("liveedit:cache:hits")
        fake_redis.incr("liveedit:cache:misses")
        # Unrelated key should remain
        fake_redis.store["celery-task-meta-xyz"] = "keep-me"

        with patch("app._redis_client", fake_redis):
            response = client.post("/api/cache/clear")

        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert data["deleted_keys"] == 2
        assert data["metrics_reset"] is True
        assert "liveedit:analysis:aaa" not in fake_redis.store
        assert "liveedit:analysis:bbb" not in fake_redis.store
        assert fake_redis.get("liveedit:cache:hits") is None
        assert fake_redis.get("liveedit:cache:misses") is None
        assert fake_redis.store["celery-task-meta-xyz"] == "keep-me"

    def test_clear_without_redis(self, client):
        with patch("app._redis_client", None):
            response = client.post("/api/cache/clear")

        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is False
        assert "redis" in data["message"].lower()

    def test_clear_then_stats_are_zero(self, client, fake_redis):
        fake_redis.setex("liveedit:analysis:x", 60, "{}")
        fake_redis.incr("liveedit:cache:hits")
        fake_redis.incr("liveedit:cache:misses")

        with patch("app._redis_client", fake_redis):
            clear_resp = client.post("/api/cache/clear")
            stats_resp = client.get("/api/cache/stats")

        assert clear_resp.get_json()["success"] is True
        stats = stats_resp.get_json()
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["total_requests"] == 0


# ─────────────────────────────────────────────
# API: skip_cache plumbing on analyze-video
# ─────────────────────────────────────────────


class TestAnalyzeVideoSkipCacheParam:
    @patch("app.analyze_video_task.delay")
    @patch("app.get_db_connection")
    def test_skip_cache_true_passed_to_task(
        self, mock_db, mock_delay, client, tmp_path
    ):
        mock_conn = mock_db.return_value
        mock_cur = mock_conn.cursor.return_value

        video_path = tmp_path / "clip.mp4"
        video_path.write_bytes(b"abc")
        with open(video_path, "rb") as fh:
            response = client.post(
                "/api/analyze-video?skip_cache=true",
                data={"video_file": (fh, "clip.mp4"), "prompt": "Analyze"},
                content_type="multipart/form-data",
            )

        assert response.status_code == 202
        body = response.get_json()
        assert body["skip_cache"] is True
        assert mock_delay.called
        args = mock_delay.call_args.args
        # delay(job_id, video_path, user_prompt, skip_cache)
        assert args[3] is True
        mock_cur.execute.assert_called()
        mock_conn.commit.assert_called()

    @patch("app.analyze_video_task.delay")
    @patch("app.get_db_connection")
    def test_skip_cache_default_false(self, mock_db, mock_delay, client, tmp_path):
        mock_db.return_value.cursor.return_value

        video_path = tmp_path / "clip.mp4"
        video_path.write_bytes(b"xyz")
        with open(video_path, "rb") as fh:
            response = client.post(
                "/api/analyze-video",
                data={"video_file": (fh, "clip.mp4"), "prompt": "Analyze"},
                content_type="multipart/form-data",
            )

        assert response.status_code == 202
        assert response.get_json()["skip_cache"] is False
        assert mock_delay.call_args.args[3] is False
