import base64
import json
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types as genai_types

load_dotenv()

from agents.orchestrator import APP_NAME, build_runner, create_new_session, get_runner, get_session_service
from agents.prompts import EVALUATOR_PROMPT
from db.database import init_db, save_answer
from models import (
    ChatRequest,
    CreateSessionRequest,
    CreateSessionResponse,
    MCQEvalRequest,
    MCQFeedback,
    SubjectiveEvalRequest,
    SubjectiveFeedback,
)

DB_PATH = os.getenv("DB_PATH", "data/sessions.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db(DB_PATH)
    build_runner(DB_PATH)
    yield


app = FastAPI(title="AI Practice MVP", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

@app.post("/api/session/create", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest):
    """Create a new ADK session for a user."""
    await create_new_session(user_id=req.user_id, session_id=req.session_id)
    return CreateSessionResponse(session_id=req.session_id, user_id=req.user_id)


# ---------------------------------------------------------------------------
# Chat (SSE streaming)
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat(req: ChatRequest):
    """
    Send a message to the orchestrator and stream back SSE events.

    Event types:
      {"type": "text_delta", "content": "..."}
      {"type": "artifact", "test": {...}}   ← stripped of answers before sending
      {"type": "done"}
      {"type": "error", "message": "..."}
    """
    runner = get_runner()
    svc = get_session_service()

    from google.genai import types as t

    new_message = t.Content(
        role="user",
        parts=[t.Part(text=req.message)],
    )

    async def event_stream():
        try:
            async for event in runner.run_async(
                user_id=req.user_id,
                session_id=req.session_id,
                new_message=new_message,
            ):
                if not hasattr(event, "content") or not event.content:
                    continue

                for part in event.content.parts or []:
                    # ── Detect test artifact from generate_test tool response ──
                    if hasattr(part, "function_response") and part.function_response:
                        fn = part.function_response
                        if fn.name == "generate_test":
                            result_str = fn.response.get("result", "") if isinstance(fn.response, dict) else ""
                            try:
                                full_test = json.loads(result_str)
                            except (json.JSONDecodeError, ValueError):
                                continue  # malformed JSON — skip artifact

                            # Emit artifact immediately — answer key stripped
                            frontend_test = _strip_answers(full_test)
                            yield f"data: {json.dumps({'type': 'artifact', 'test': frontend_test})}\n\n"

                            # Persist state to SQLite separately so a failure here
                            # never blocks the stream
                            try:
                                session = await svc.get_session(
                                    app_name=APP_NAME,
                                    user_id=req.user_id,
                                    session_id=req.session_id,
                                )
                                if session:
                                    await svc.persist_state(
                                        app_name=APP_NAME,
                                        user_id=req.user_id,
                                        session_id=req.session_id,
                                        state=dict(session.state),
                                    )
                            except Exception:
                                pass

                    # ── Stream text from the orchestrator ──
                    elif hasattr(part, "text") and part.text and event.author != "user":
                        yield f"data: {json.dumps({'type': 'text_delta', 'content': part.text})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Per-question evaluation
# ---------------------------------------------------------------------------

@app.post("/api/evaluate/mcq", response_model=MCQFeedback)
async def evaluate_mcq(req: MCQEvalRequest):
    """
    Evaluate a single MCQ answer. Returns immediate feedback.
    Answer key is retrieved from server-side session state — never exposed to client.
    """
    state = await _get_state(req.user_id, req.session_id)
    current_test = state.get("current_test")

    if not current_test:
        raise HTTPException(status_code=404, detail="No active test found for this session.")

    question = _find_question(current_test, req.question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question {req.question_id} not found.")
    if question.get("type") != "mcq":
        raise HTTPException(status_code=400, detail="Question is not an MCQ.")

    correct_option = question["correct_option"]
    is_correct = req.selected_option.upper() == correct_option.upper()

    feedback = MCQFeedback(
        question_id=req.question_id,
        correct=is_correct,
        selected_option=req.selected_option,
        correct_option=correct_option,
        explanation=question.get("explanation", ""),
    )

    await save_answer(
        db_path=DB_PATH,
        session_id=req.session_id,
        test_id=req.test_id,
        question_id=req.question_id,
        question_type="mcq",
        selected_option=req.selected_option,
        feedback_json=feedback.model_dump_json(),
    )

    return feedback


@app.post("/api/evaluate/subjective", response_model=SubjectiveFeedback)
async def evaluate_subjective(req: SubjectiveEvalRequest):
    """
    Evaluate handwritten work submitted as a Base64-encoded image.
    Uses Gemini Vision to grade against the expected solution steps.
    """
    state = await _get_state(req.user_id, req.session_id)
    current_test = state.get("current_test")

    if not current_test:
        raise HTTPException(status_code=404, detail="No active test found for this session.")

    question = _find_question(current_test, req.question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question {req.question_id} not found.")
    if question.get("type") != "subjective":
        raise HTTPException(status_code=400, detail="Question is not subjective.")

    solution_steps = question.get("solution_steps", [])
    expected_answer = question.get("expected_answer", "")
    marks = question.get("marks", 4)

    # Decode the image
    try:
        image_bytes = base64.b64decode(req.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 image data.")

    # Call Gemini Vision
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    evaluation_prompt = (
        f"Question: {question['text']}\n\n"
        f"Total marks: {marks}\n\n"
        f"Expected solution steps:\n"
        + "\n".join(f"  {i+1}. {s}" for i, s in enumerate(solution_steps))
        + f"\n\nExpected final answer: {expected_answer}\n\n"
        "Evaluate the student's handwritten work shown in the image."
    )

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part(text=evaluation_prompt),
                        genai_types.Part(
                            inline_data=genai_types.Blob(
                                mime_type="image/jpeg",
                                data=image_bytes,
                            )
                        ),
                    ],
                )
            ],
            config=genai_types.GenerateContentConfig(
                system_instruction=EVALUATOR_PROMPT,
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        result = json.loads(response.text.strip())

        feedback = SubjectiveFeedback(
            question_id=req.question_id,
            score=int(result.get("score", 0)),
            max_score=int(result.get("max_score", marks)),
            explanation=result.get("explanation", ""),
            step_feedback=result.get("step_feedback", []),
            next_step_hint=result.get("next_step_hint", ""),
        )

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(exc)}")

    await save_answer(
        db_path=DB_PATH,
        session_id=req.session_id,
        test_id=req.test_id,
        question_id=req.question_id,
        question_type="subjective",
        selected_option=None,
        feedback_json=feedback.model_dump_json(),
    )

    return feedback


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_answers(test: dict) -> dict:
    """Remove answer key fields before sending test to the frontend."""
    safe = {k: v for k, v in test.items() if k != "questions"}
    safe["questions"] = []

    for q in test.get("questions", []):
        if q.get("type") == "mcq":
            safe_q = {k: v for k, v in q.items() if k not in ("correct_option", "explanation")}
        else:
            safe_q = {k: v for k, v in q.items() if k not in ("solution_steps", "expected_answer")}
        safe["questions"].append(safe_q)

    return safe


def _find_question(test: dict, question_id: str) -> dict | None:
    for q in test.get("questions", []):
        if q.get("id") == question_id:
            return q
    return None


async def _get_state(user_id: str, session_id: str) -> dict:
    svc = get_session_service()
    session = await svc.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    if session is None:
        return {}
    return dict(session.state or {})
