from datetime import datetime
from pydantic import BaseModel
from typing import Literal, Optional


class CreateSessionRequest(BaseModel):
    user_id: str
    session_id: str


class CreateSessionResponse(BaseModel):
    session_id: str
    user_id: str


class ChatRequest(BaseModel):
    session_id: str
    user_id: str
    message: str


class MCQEvalRequest(BaseModel):
    session_id: str
    user_id: str
    test_id: str
    question_id: str
    selected_option: str  # "A", "B", "C", or "D"


class MCQFeedback(BaseModel):
    question_id: str
    correct: bool
    selected_option: str
    correct_option: str
    explanation: str


class SubjectiveEvalRequest(BaseModel):
    session_id: str
    user_id: str
    test_id: str
    question_id: str
    image_base64: str  # Base64-encoded JPEG/PNG of handwritten working


class SubjectiveFeedback(BaseModel):
    question_id: str
    score: int
    max_score: int
    explanation: str
    step_feedback: list[str]
    next_step_hint: str


# ---------------------------------------------------------------------------
# Auth / Profile
# ---------------------------------------------------------------------------

class ProfileCreateRequest(BaseModel):
    role: Literal["parent", "student"]
    display_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Test library
# ---------------------------------------------------------------------------

class TestSummary(BaseModel):
    id: str
    topic: Optional[str] = None
    board: Optional[str] = None
    grade: Optional[str] = None
    book: Optional[str] = None
    question_count: Optional[int] = None
    total_marks: Optional[int] = None
    duration_minutes: Optional[int] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Parent-child
# ---------------------------------------------------------------------------

class AddChildRequest(BaseModel):
    child_email: str


class ChildInfo(BaseModel):
    id: Optional[str] = None
    child_email: str
    child_id: Optional[str] = None
    display_name: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

class AssignmentCreateRequest(BaseModel):
    test_id: str
    child_email: str
    mode: Literal["practice", "exam"] = "practice"
    time_multiplier: float = 1.0


class AssignmentResponse(BaseModel):
    id: str
    token: str
    link: str
    expires_at: datetime
    mode: str
    time_multiplier: float


class AttemptScoreResponse(BaseModel):
    attempted: int
    earned_marks: int
    total_marks: int
    completed_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Assignment evaluation (token-based, no user session)
# ---------------------------------------------------------------------------

class AssignmentMCQEvalRequest(BaseModel):
    assignment_id: str
    test_id: str
    question_id: str
    selected_option: str


class AssignmentSubjectiveEvalRequest(BaseModel):
    assignment_id: str
    test_id: str
    question_id: str
    image_base64: str


# ---------------------------------------------------------------------------
# Self-test evaluation (creator takes their own test, auth required)
# ---------------------------------------------------------------------------

class SelfTestMCQEvalRequest(BaseModel):
    session_id: str
    question_id: str
    selected_option: str


class SelfTestSubjectiveEvalRequest(BaseModel):
    session_id: str
    question_id: str
    image_base64: str
