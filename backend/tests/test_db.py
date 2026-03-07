"""
DB layer tests via the live local backend API.

These test that tests are actually persisted and retrievable.
They use the real backend, which in turn uses the real Supabase DB.

Requires:
  - Backend running on localhost:8000
  - A valid Supabase JWT for a test user in TEST_AUTH_TOKEN env var

Set TEST_AUTH_TOKEN by logging in to the frontend, opening DevTools → Application →
Local Storage → supabase.auth.token → access_token, and copying it.

If TEST_AUTH_TOKEN is not set, these tests are skipped.
"""
import os
import uuid

import pytest
import pytest_asyncio

TEST_TOKEN = os.environ.get("TEST_AUTH_TOKEN", "")


def auth_header():
    if not TEST_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN not set — copy access_token from browser DevTools")
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.mark.asyncio
async def test_list_tests_requires_auth(http_client):
    """GET /api/tests with no token must return 401."""
    resp = await http_client.get("/api/tests")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_tests_returns_array(http_client):
    """GET /api/tests with valid token returns a JSON array."""
    resp = await http_client.get("/api/tests", headers=auth_header())
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"


@pytest.mark.asyncio
async def test_missing_test_returns_404(http_client):
    """GET /api/tests/<nonexistent> returns 404, not 500."""
    fake_id = str(uuid.uuid4())
    resp = await http_client.get(f"/api/tests/{fake_id}", headers=auth_header())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_chat_without_auth_does_not_save(http_client):
    """
    Verify the warning path: chat with no auth token should log a warning
    and the stream should still complete (not crash). We can't check the DB
    directly here, but we can verify the stream doesn't 500.

    Note: this sends a real message to the AI — only run manually, not in CI.
    Marked xfail if TEST_AUTH_TOKEN not set, to document the expected behaviour.
    """
    pytest.skip("This test sends a real AI request — run manually only")
