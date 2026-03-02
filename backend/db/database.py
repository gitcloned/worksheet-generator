import aiosqlite
import os

DB_PATH = os.getenv("DB_PATH", "data/sessions.db")


async def init_db(db_path: str = DB_PATH) -> None:
    """Initialize SQLite database and create tables."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    async with aiosqlite.connect(db_path) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                app_name    TEXT NOT NULL,
                user_id     TEXT NOT NULL,
                session_id  TEXT NOT NULL,
                state       TEXT NOT NULL DEFAULT '{}',
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL,
                PRIMARY KEY (app_name, user_id, session_id)
            );

            CREATE TABLE IF NOT EXISTS test_answers (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      TEXT NOT NULL,
                test_id         TEXT NOT NULL,
                question_id     TEXT NOT NULL,
                question_type   TEXT NOT NULL,
                selected_option TEXT,
                feedback_json   TEXT,
                answered_at     REAL NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_answers_session
                ON test_answers (session_id, test_id);
        """)
        await db.commit()


async def save_answer(
    db_path: str,
    session_id: str,
    test_id: str,
    question_id: str,
    question_type: str,
    selected_option: str | None,
    feedback_json: str,
) -> None:
    """Persist a submitted answer and its feedback to SQLite."""
    import time

    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """
            INSERT INTO test_answers
                (session_id, test_id, question_id, question_type, selected_option, feedback_json, answered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, test_id, question_id, question_type, selected_option, feedback_json, time.time()),
        )
        await db.commit()
