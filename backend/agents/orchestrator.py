import os
from google.adk.agents import LlmAgent
from google.adk.runners import Runner

from .prompts import ORCHESTRATOR_PROMPT
from .tools import research_book, design_blueprint, generate_questions
from db.session_service import SQLiteSessionService

APP_NAME = os.getenv("APP_NAME", "ai-practice-mvp")

# Shared session service and runner — initialized at startup
session_service: SQLiteSessionService | None = None
runner: Runner | None = None


def build_runner(db_path: str) -> Runner:
    """Build and return the ADK runner with the orchestrator agent."""
    global session_service, runner

    orchestrator = LlmAgent(
        name="orchestrator",
        model="gemini-2.5-flash",
        instruction=ORCHESTRATOR_PROMPT,
        tools=[research_book, design_blueprint, generate_questions],
    )

    session_service = SQLiteSessionService(db_path=db_path)

    runner = Runner(
        agent=orchestrator,
        app_name=APP_NAME,
        session_service=session_service,
    )

    return runner


def get_runner() -> Runner:
    if runner is None:
        raise RuntimeError("Runner not initialized. Call build_runner() first.")
    return runner


def get_session_service() -> SQLiteSessionService:
    if session_service is None:
        raise RuntimeError("Session service not initialized. Call build_runner() first.")
    return session_service


async def create_new_session(user_id: str, session_id: str) -> None:
    """Create a new ADK session, or silently reuse if it already exists (e.g. page reload)."""
    svc = get_session_service()
    existing = await svc.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    if existing is not None:
        return  # already exists — nothing to do
    await svc.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
        state={},
    )


async def get_session_state(user_id: str, session_id: str) -> dict:
    """Retrieve session state (e.g., current_test) for a session."""
    svc = get_session_service()
    session = await svc.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    if session is None:
        return {}
    return dict(session.state or {})
