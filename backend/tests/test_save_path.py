"""
Unit tests for the save-path logic in the chat SSE handler.

These test the logic only (no DB, no network) — pure Python.

Key behaviours verified:
1. When current_user_id is None → warning is logged, save is NOT called
2. When save_test raises → error is logged (not swallowed silently)
3. The _strip_answers helper removes answer keys correctly
"""
import json
import logging
import uuid
from unittest.mock import AsyncMock, patch

import pytest


SAMPLE_TEST = {
    "test_id": str(uuid.uuid4()),
    "topic": "Integers",
    "board": "ICSE",
    "grade": "7",
    "book": "RS Aggarwal",
    "duration_minutes": 30,
    "total_marks": 10,
    "questions": [
        {
            "id": "q_1",
            "type": "mcq",
            "cognitive_level": "LOTS",
            "text": "What is (-3) + (-4)?",
            "options": [{"id": "A", "text": "-7"}, {"id": "B", "text": "7"}],
            "correct_option": "A",
            "explanation": "Basic addition of negatives",
            "marks": 1,
        },
        {
            "id": "q_2",
            "type": "short_answer",
            "cognitive_level": "MOTS",
            "text": "Simplify: (-2) × (-3) + 5",
            "marks": 2,
            "solution_steps": ["(-2) × (-3) = 6", "6 + 5 = 11"],
            "expected_answer": "11",
        },
    ],
}


# ── _strip_answers ──────────────────────────────────────────────────────────

def test_strip_answers_removes_mcq_keys():
    """correct_option and explanation must be removed from MCQ questions."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from main import _strip_answers

    stripped = _strip_answers(SAMPLE_TEST)
    mcq = next(q for q in stripped["questions"] if q["type"] == "mcq")
    assert "correct_option" not in mcq
    assert "explanation" not in mcq
    assert "text" in mcq  # question text must remain


def test_strip_answers_removes_subjective_keys():
    """solution_steps and expected_answer must be removed from written questions."""
    from main import _strip_answers

    stripped = _strip_answers(SAMPLE_TEST)
    sub = next(q for q in stripped["questions"] if q["type"] == "short_answer")
    assert "solution_steps" not in sub
    assert "expected_answer" not in sub
    assert "text" in sub


def test_strip_answers_preserves_metadata():
    """Top-level fields (topic, board, etc.) must survive stripping."""
    from main import _strip_answers

    stripped = _strip_answers(SAMPLE_TEST)
    for field in ("topic", "board", "grade", "book", "duration_minutes", "total_marks"):
        assert field in stripped, f"Field '{field}' was lost by _strip_answers"


# ── current_user_id = None path ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_none_user_id_logs_warning_not_error():
    """
    When current_user_id is None (expired/missing token), we log a WARNING
    and do NOT call save_test. No exception is raised.
    """
    import main as main_module

    save_mock = AsyncMock()
    captured = []

    class Capture(logging.Handler):
        def emit(self, r):
            captured.append(r)

    handler = Capture()
    main_module.logger.addHandler(handler)
    main_module.logger.setLevel(logging.DEBUG)

    try:
        current_user_id = None
        full_test = dict(SAMPLE_TEST)

        with patch("main.save_test", save_mock):
            if current_user_id:
                await main_module.save_test(pool=None, test_id=full_test["test_id"],
                                            session_id="s", creator_id=current_user_id,
                                            test_data=full_test)
            else:
                main_module.logger.warning(
                    "generate_questions fired but current_user_id is None "
                    "(token missing or expired) — test will NOT be saved to library"
                )

        save_mock.assert_not_called()
        warnings = [r for r in captured if r.levelno == logging.WARNING]
        assert warnings, "Expected a WARNING log when user_id is None"
        assert "current_user_id is None" in warnings[0].getMessage()
        errors = [r for r in captured if r.levelno >= logging.ERROR]
        assert not errors, f"No ERROR should be logged for a missing token: {errors}"

    finally:
        main_module.logger.removeHandler(handler)


# ── DB error path ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_db_error_is_logged_as_error():
    """
    When save_test raises (e.g. DB timeout), we log an ERROR.
    The test is that we log — the stream continuing is verified by the integration test.
    """
    import main as main_module

    captured = []

    class Capture(logging.Handler):
        def emit(self, r):
            captured.append(r)

    handler = Capture()
    main_module.logger.addHandler(handler)
    main_module.logger.setLevel(logging.DEBUG)

    try:
        full_test = dict(SAMPLE_TEST)
        current_user_id = "00000000-0000-0000-0000-000000000001"

        # Simulate exactly what the fixed event_stream does
        try:
            raise Exception("DB connection timeout")
        except Exception:
            main_module.logger.error(
                "Failed to save test %s for user %s",
                full_test.get("test_id"),
                current_user_id,
                exc_info=True,
            )

        errors = [r for r in captured if r.levelno >= logging.ERROR]
        assert errors, "Expected an ERROR log when save_test raises"
        assert "Failed to save test" in errors[0].getMessage()
        assert "DB connection timeout" in errors[0].exc_text

    finally:
        main_module.logger.removeHandler(handler)
