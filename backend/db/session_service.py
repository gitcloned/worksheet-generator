"""
PostgreSQL-backed ADK session service.

Extends InMemorySessionService so ADK's runtime event management stays
in-memory (fast, no serialization complexity), while session metadata
and state are persisted to PostgreSQL for durability across restarts.
"""
import json
from datetime import datetime, timezone

import asyncpg
from google.adk.sessions import InMemorySessionService


class PostgresSessionService(InMemorySessionService):
    def __init__(self, pool: asyncpg.Pool):
        super().__init__()
        self.pool = pool

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: dict | None = None,
        session_id: str | None = None,
    ):
        session = await super().create_session(
            app_name=app_name,
            user_id=user_id,
            state=state or {},
            session_id=session_id,
        )

        now = datetime.now(timezone.utc)
        await self.pool.execute(
            """
            INSERT INTO sessions (app_name, user_id, session_id, state, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (app_name, user_id, session_id) DO NOTHING
            """,
            app_name,
            user_id,
            session.id,
            json.dumps(state or {}),
            now,
            now,
        )

        return session

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config=None,
    ):
        # Try in-memory first (fastest path, covers active sessions)
        session = await super().get_session(
            app_name=app_name,
            user_id=user_id,
            session_id=session_id,
            config=config,
        )
        if session is not None:
            return session

        # Fall back to PostgreSQL (session survived a server restart)
        row = await self.pool.fetchrow(
            """
            SELECT state FROM sessions
            WHERE app_name = $1 AND user_id = $2 AND session_id = $3
            """,
            app_name,
            user_id,
            session_id,
        )

        if row is None:
            return None

        state_data = row["state"]
        if isinstance(state_data, str):
            state_data = json.loads(state_data)

        return await super().create_session(
            app_name=app_name,
            user_id=user_id,
            state=state_data,
            session_id=session_id,
        )

    async def persist_state(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
        state: dict,
    ) -> None:
        """Explicitly persist updated state to PostgreSQL."""
        now = datetime.now(timezone.utc)
        await self.pool.execute(
            """
            UPDATE sessions SET state = $1, updated_at = $2
            WHERE app_name = $3 AND user_id = $4 AND session_id = $5
            """,
            json.dumps(state),
            now,
            app_name,
            user_id,
            session_id,
        )
