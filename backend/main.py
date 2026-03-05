import base64
import json
import os
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types as genai_types

load_dotenv()

from agents.orchestrator import APP_NAME, build_runner, create_new_session, get_runner, get_session_service
from agents.prompts import EVALUATOR_PROMPT
from auth import get_current_user, get_optional_user
from db.database import (
    init_db,
    get_pool,
    save_answer,
    save_test,
    get_tests_for_user,
    get_test_by_id,
    get_test_by_id_for_assignment,
    get_or_create_profile,
    set_profile_role,
    add_child,
    get_children,
    create_assignment,
    get_assignment_by_token,
    update_assignment_status,
    get_last_attempt_score,
    get_child_assignments,
    get_unassigned_tests,
    get_student_assignments,
    get_assignment_review,
)
from models import (
    AddChildRequest,
    AssignmentCreateRequest,
    AssignmentResponse,
    AttemptScoreResponse,
    ChatRequest,
    ChildInfo,
    CreateSessionRequest,
    CreateSessionResponse,
    MCQEvalRequest,
    MCQFeedback,
    ProfileCreateRequest,
    SubjectiveEvalRequest,
    SubjectiveFeedback,
    TestSummary,
    AssignmentMCQEvalRequest,
    AssignmentSubjectiveEvalRequest,
    SelfTestMCQEvalRequest,
    SelfTestSubjectiveEvalRequest,
)

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await init_db()
    build_runner(pool)
    yield
    await pool.close()


app = FastAPI(title="AI Practice MVP", lifespan=lifespan)

_origins_env = os.getenv("ALLOWED_ORIGINS", "")
_allowed_origins = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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
# Auth / Profile
# ---------------------------------------------------------------------------

@app.post("/api/auth/profile")
async def create_profile(
    req: ProfileCreateRequest,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Create or update user profile with role after Google OAuth signup."""
    pool = get_pool()
    profile = await set_profile_role(pool, user_id, req.role, req.display_name)
    return profile


@app.get("/api/profile")
async def get_profile(user_id: Annotated[str, Depends(get_current_user)]):
    """Get current user's profile."""
    pool = get_pool()
    profile = await get_or_create_profile(pool, user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found. Please complete onboarding.")
    return profile


# ---------------------------------------------------------------------------
# Test library
# ---------------------------------------------------------------------------

@app.get("/api/tests")
async def list_tests(user_id: Annotated[str, Depends(get_current_user)]):
    """List tests created by the current user."""
    pool = get_pool()
    tests = await get_tests_for_user(pool, user_id)
    return tests


@app.get("/api/tests/{test_id}")
async def get_test(
    test_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Get a test by ID (only accessible to creator)."""
    pool = get_pool()
    test = await get_test_by_id(pool, test_id, user_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found.")
    return test


# ---------------------------------------------------------------------------
# Parent / children management
# ---------------------------------------------------------------------------

@app.post("/api/parent/children")
async def add_child_route(
    req: AddChildRequest,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Add a child link by email (parent only)."""
    pool = get_pool()
    result = await add_child(pool, user_id, req.child_email)
    return result


@app.get("/api/parent/children")
async def list_children(user_id: Annotated[str, Depends(get_current_user)]):
    """List parent's children."""
    pool = get_pool()
    children = await get_children(pool, user_id)
    return children


@app.get("/api/parent/children/{child_id}/assignments")
async def list_child_assignments(
    child_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Return all assignments made by this parent to a child (by parent_child.id), with scores."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT child_email FROM parent_child WHERE id = $1 AND parent_id = $2",
        child_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Child not found.")
    assignments = await get_child_assignments(pool, user_id, row["child_email"])
    return assignments


@app.get("/api/parent/children/{child_id}/unassigned-tests")
async def list_unassigned_tests(
    child_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Return tests created by this parent not yet assigned to the specified child."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT child_email FROM parent_child WHERE id = $1 AND parent_id = $2",
        child_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Child not found.")
    tests = await get_unassigned_tests(pool, user_id, row["child_email"])
    return tests


@app.get("/api/student/assignments")
async def list_student_assignments(user_id: Annotated[str, Depends(get_current_user)]):
    """Return all assignments for the authenticated student."""
    pool = get_pool()
    assignments = await get_student_assignments(pool, user_id)
    return assignments


@app.get("/api/assignment/{token}/review")
async def get_assignment_review_route(
    token: str,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Return full assignment with child's answers (parent/assigner only)."""
    pool = get_pool()
    data = await get_assignment_review(pool, token, user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Assignment not found or not authorized.")
    return data


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

@app.post("/api/assignments", response_model=AssignmentResponse)
async def create_assignment_route(
    req: AssignmentCreateRequest,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Assign a test to a child. Returns shareable link with token."""
    pool = get_pool()
    assignment = await create_assignment(
        pool, req.test_id, user_id, req.child_email, req.mode, req.time_multiplier
    )
    token = assignment["token"]
    link = f"{FRONTEND_BASE_URL}/take-test/{token}"
    return AssignmentResponse(
        id=assignment["id"],
        token=token,
        link=link,
        expires_at=assignment["token_expires_at"],
        mode=assignment["mode"],
        time_multiplier=float(assignment["time_multiplier"]),
    )


@app.get("/api/assignment/{token}")
async def get_assignment_route(token: str):
    """Validate assignment token and return test (answer keys stripped)."""
    pool = get_pool()
    assignment = await get_assignment_by_token(pool, token)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found or expired.")

    test_data = assignment["test_data"]
    stripped_test = _strip_answers(test_data)

    # Mark as started
    if assignment["status"] == "pending":
        await update_assignment_status(pool, assignment["assignment_id"], "started")

    return {
        "assignment_id": assignment["assignment_id"],
        "test": stripped_test,
        "status": assignment["status"],
        "mode": assignment["mode"],
        "time_multiplier": assignment["time_multiplier"],
    }


@app.get("/api/assignment/{token}/last-attempt", response_model=AttemptScoreResponse)
async def get_last_attempt_route(token: str):
    """Return score summary for the most recent attempt on this assignment."""
    pool = get_pool()
    assignment = await get_assignment_by_token(pool, token)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found or expired.")
    score = await get_last_attempt_score(pool, assignment["assignment_id"], assignment["test_id"])
    if score is None:
        raise HTTPException(status_code=404, detail="No previous attempt found.")
    return AttemptScoreResponse(**score)


@app.post("/api/assignment/{token}/complete")
async def complete_assignment_route(token: str):
    """Mark an assignment as completed."""
    pool = get_pool()
    assignment = await get_assignment_by_token(pool, token)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found or expired.")
    await update_assignment_status(pool, assignment["assignment_id"], "completed")
    return {"status": "completed"}


@app.post("/api/assignment/{token}/evaluate/mcq", response_model=MCQFeedback)
async def evaluate_assignment_mcq(token: str, req: AssignmentMCQEvalRequest):
    """Evaluate MCQ answer for a link-based (token) test taker."""
    pool = get_pool()
    assignment = await get_assignment_by_token(pool, token)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found or expired.")

    test_data = assignment["test_data"]
    question = _find_question(test_data, req.question_id)
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
        pool=pool,
        session_id=f"assignment:{token}",
        test_id=req.test_id,
        question_id=req.question_id,
        question_type="mcq",
        selected_option=req.selected_option,
        feedback_json=feedback.model_dump_json(),
        assignment_id=assignment["assignment_id"],
    )

    return feedback


@app.post("/api/assignment/{token}/evaluate/subjective", response_model=SubjectiveFeedback)
async def evaluate_assignment_subjective(token: str, req: AssignmentSubjectiveEvalRequest):
    """Evaluate subjective answer for a link-based (token) test taker."""
    pool = get_pool()
    assignment = await get_assignment_by_token(pool, token)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found or expired.")

    test_data = assignment["test_data"]
    question = _find_question(test_data, req.question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question {req.question_id} not found.")
    if question.get("type") not in ("subjective", "short_answer", "long_answer"):
        raise HTTPException(status_code=400, detail="Question is not a written answer question.")

    solution_steps = question.get("solution_steps", [])
    expected_answer = question.get("expected_answer", "")
    marks = question.get("marks", 4)

    try:
        image_bytes = base64.b64decode(req.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 image data.")

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
        pool=pool,
        session_id=f"assignment:{token}",
        test_id=req.test_id,
        question_id=req.question_id,
        question_type="subjective",
        selected_option=None,
        feedback_json=feedback.model_dump_json(),
        assignment_id=assignment["assignment_id"],
    )

    return feedback


# ---------------------------------------------------------------------------
# Self-test evaluation (creator takes their own test, no ADK session needed)
# ---------------------------------------------------------------------------

@app.post("/api/tests/{test_id}/evaluate/mcq", response_model=MCQFeedback)
async def evaluate_self_test_mcq(
    test_id: str,
    req: SelfTestMCQEvalRequest,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Evaluate MCQ for a creator self-testing their own test."""
    pool = get_pool()
    test_data = await get_test_by_id(pool, test_id, user_id)
    if test_data is None:
        raise HTTPException(status_code=404, detail="Test not found.")

    question = _find_question(test_data, req.question_id)
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
        pool=pool,
        session_id=req.session_id,
        test_id=test_id,
        question_id=req.question_id,
        question_type="mcq",
        selected_option=req.selected_option,
        feedback_json=feedback.model_dump_json(),
        taker_id=user_id,
    )
    return feedback


@app.post("/api/tests/{test_id}/evaluate/subjective", response_model=SubjectiveFeedback)
async def evaluate_self_test_subjective(
    test_id: str,
    req: SelfTestSubjectiveEvalRequest,
    user_id: Annotated[str, Depends(get_current_user)],
):
    """Evaluate subjective answer for a creator self-testing their own test."""
    pool = get_pool()
    test_data = await get_test_by_id(pool, test_id, user_id)
    if test_data is None:
        raise HTTPException(status_code=404, detail="Test not found.")

    question = _find_question(test_data, req.question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question {req.question_id} not found.")
    if question.get("type") not in ("subjective", "short_answer", "long_answer"):
        raise HTTPException(status_code=400, detail="Question is not a written answer question.")

    solution_steps = question.get("solution_steps", [])
    expected_answer = question.get("expected_answer", "")
    marks = question.get("marks", 4)

    try:
        image_bytes = base64.b64decode(req.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 image data.")

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
                            inline_data=genai_types.Blob(mime_type="image/jpeg", data=image_bytes)
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
        pool=pool,
        session_id=req.session_id,
        test_id=test_id,
        question_id=req.question_id,
        question_type="subjective",
        selected_option=None,
        feedback_json=feedback.model_dump_json(),
        taker_id=user_id,
    )
    return feedback


# ---------------------------------------------------------------------------
# Chat (SSE streaming)
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat(
    req: ChatRequest,
    current_user_id: Annotated[str | None, Depends(get_optional_user)],
):
    """
    Send a message to the orchestrator and stream back SSE events.

    Event types:
      {"type": "text_delta", "content": "..."}
      {"type": "artifact", "test": {...}}   <- stripped of answers before sending
      {"type": "done"}
      {"type": "error", "message": "..."}
    """
    runner = get_runner()
    svc = get_session_service()
    pool = get_pool()

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
                    if hasattr(part, "function_response") and part.function_response:
                        fn = part.function_response
                        result_str = fn.response.get("result", "") if isinstance(fn.response, dict) else ""

                        # ── research_book → emit research event ──
                        if fn.name == "research_book":
                            try:
                                research_data = json.loads(result_str)
                            except (json.JSONDecodeError, ValueError):
                                continue
                            frontend_research = {k: v for k, v in research_data.items() if k != "raw_research"}
                            yield f"data: {json.dumps({'type': 'research', 'data': frontend_research})}\n\n"
                            try:
                                session = await svc.get_session(app_name=APP_NAME, user_id=req.user_id, session_id=req.session_id)
                                if session:
                                    await svc.persist_state(app_name=APP_NAME, user_id=req.user_id, session_id=req.session_id, state=dict(session.state))
                            except Exception:
                                pass

                        # ── design_blueprint → emit blueprint event ──
                        elif fn.name == "design_blueprint":
                            try:
                                blueprint_data = json.loads(result_str)
                            except (json.JSONDecodeError, ValueError):
                                continue
                            yield f"data: {json.dumps({'type': 'blueprint', 'data': blueprint_data})}\n\n"
                            try:
                                session = await svc.get_session(app_name=APP_NAME, user_id=req.user_id, session_id=req.session_id)
                                if session:
                                    await svc.persist_state(app_name=APP_NAME, user_id=req.user_id, session_id=req.session_id, state=dict(session.state))
                            except Exception:
                                pass

                        # ── generate_questions → emit artifact event (answer key stripped) ──
                        elif fn.name == "generate_questions":
                            try:
                                full_test = json.loads(result_str)
                            except (json.JSONDecodeError, ValueError):
                                continue
                            frontend_test = _strip_answers(full_test)
                            yield f"data: {json.dumps({'type': 'artifact', 'test': frontend_test})}\n\n"
                            try:
                                session = await svc.get_session(app_name=APP_NAME, user_id=req.user_id, session_id=req.session_id)
                                if session:
                                    await svc.persist_state(app_name=APP_NAME, user_id=req.user_id, session_id=req.session_id, state=dict(session.state))
                            except Exception:
                                pass
                            # Save test to DB (with answer keys, for library + assignments)
                            if current_user_id:
                                try:
                                    await save_test(
                                        pool=pool,
                                        test_id=full_test["test_id"],
                                        session_id=req.session_id,
                                        creator_id=current_user_id,
                                        test_data=full_test,
                                    )
                                except Exception:
                                    pass  # don't fail the stream if DB save fails

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
# Per-question evaluation (session-based, for authenticated users)
# ---------------------------------------------------------------------------

@app.post("/api/evaluate/mcq", response_model=MCQFeedback)
async def evaluate_mcq(req: MCQEvalRequest):
    """
    Evaluate a single MCQ answer. Returns immediate feedback.
    Answer key is retrieved from server-side session state — never exposed to client.
    """
    pool = get_pool()
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
        pool=pool,
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
    pool = get_pool()
    state = await _get_state(req.user_id, req.session_id)
    current_test = state.get("current_test")

    if not current_test:
        raise HTTPException(status_code=404, detail="No active test found for this session.")

    question = _find_question(current_test, req.question_id)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question {req.question_id} not found.")
    if question.get("type") not in ("subjective", "short_answer", "long_answer"):
        raise HTTPException(status_code=400, detail="Question is not a written answer question.")

    solution_steps = question.get("solution_steps", [])
    expected_answer = question.get("expected_answer", "")
    marks = question.get("marks", 4)

    try:
        image_bytes = base64.b64decode(req.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 image data.")

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
        pool=pool,
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
    """Remove answer key fields before sending test to the frontend.

    Called in two places:
    1. SSE stream — when generate_questions fires, before emitting the artifact event.
    2. GET /api/assignment/{token} — before returning the test to an unauthenticated student.

    The full answer key stays in tests.test_data (PostgreSQL). Evaluation endpoints
    look it up server-side and never echo it back — only feedback is returned.
    """
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
