from pydantic import BaseModel
from typing import Literal


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
