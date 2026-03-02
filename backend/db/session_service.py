"""
SQLite-backed ADK session service.

Extends InMemorySessionService so ADK's runtime event management stays
in-memory (fast, no serialization complexity), while session metadata
and state are persisted to SQLite for durability across restarts.
"""
import json
import time

import aiosqlite
from google.adk.sessions import InMemorySessionService


class SQLiteSessionService(InMemorySessionService):
    def __init__(self, db_path: str):
        super().__init__()
        self.db_path = db_path

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

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT OR IGNORE INTO sessions
                    (app_name, user_id, session_id, state, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    app_name,
                    user_id,
                    session.id,
                    json.dumps(state or {}),
                    time.time(),
                    time.time(),
                ),
            )
            await db.commit()

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

        # Fall back to SQLite (session survived a server restart — no conversation
        # history, but state like current_test is recovered)
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """
                SELECT state FROM sessions
                WHERE app_name = ? AND user_id = ? AND session_id = ?
                """,
                (app_name, user_id, session_id),
            ) as cursor:
                row = await cursor.fetchone()

        if row is None:
            return None

        state = json.loads(row[0])
        return await super().create_session(
            app_name=app_name,
            user_id=user_id,
            state=state,
            session_id=session_id,
        )

    async def persist_state(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
        state: dict,
    ) -> None:
        """Explicitly persist updated state to SQLite (call after test generation)."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                UPDATE sessions SET state = ?, updated_at = ?
                WHERE app_name = ? AND user_id = ? AND session_id = ?
                """,
                (json.dumps(state), time.time(), app_name, user_id, session_id),
            )
            await db.commit()
