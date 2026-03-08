"""
Shared fixtures for backend tests.

Two testing strategies:
  - API tests: hit the live local backend (localhost:8000). Requires the server running.
  - Unit tests: pure logic, no external dependencies.

DB-direct tests are skipped if the Supabase host is unreachable from this machine
(direct connections require IP whitelisting on Supabase free tier).
"""
import asyncio
import os
import sys

import httpx
import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

# Set TEST_BACKEND_URL to your Render backend URL to run API tests.
# Local backend won't start without Supabase direct-connection IP whitelisting.
# Example: TEST_BACKEND_URL=https://your-app.onrender.com pytest tests/test_db.py
BACKEND_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def http_client():
    """Async HTTP client pointed at the local backend."""
    async with httpx.AsyncClient(base_url=BACKEND_URL, timeout=10.0) as client:
        try:
            await client.get("/api/tests", headers={"Authorization": "Bearer invalid"})
        except (httpx.ConnectError, httpx.ReadTimeout):
            pytest.skip(f"Backend not reachable at {BACKEND_URL} — start it first")
        yield client


@pytest_asyncio.fixture(scope="session")
async def db_pool():
    """
    Direct asyncpg pool — only available if Supabase is reachable from this host.
    Tests that use this fixture are skipped if the connection fails.
    """
    import asyncpg
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL not set")
    try:
        pool = await asyncio.wait_for(
            asyncpg.create_pool(database_url, min_size=1, max_size=2, ssl="require"),
            timeout=8.0,
        )
    except Exception as exc:
        pytest.skip(f"Cannot connect directly to Supabase DB ({exc}) — IP may not be whitelisted")
    yield pool
    await pool.close()
