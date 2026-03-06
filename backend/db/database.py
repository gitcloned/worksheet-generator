import json
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any

import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL", "")

_pool: asyncpg.Pool | None = None


async def init_db() -> asyncpg.Pool:
    """Create and return the asyncpg connection pool."""
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10, ssl='require')
    return _pool


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db() first.")
    return _pool


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

async def get_or_create_profile(pool: asyncpg.Pool, user_id: str, display_name: str | None = None) -> dict | None:
    """Return existing profile or None (profile is created explicitly via set_profile_role)."""
    row = await pool.fetchrow(
        "SELECT id::text, role, display_name, created_at FROM profiles WHERE id = $1",
        user_id,
    )
    if row is None:
        return None
    return dict(row)


async def set_profile_role(pool: asyncpg.Pool, user_id: str, role: str, display_name: str | None = None) -> dict:
    """Upsert profile with the given role."""
    row = await pool.fetchrow(
        """
        INSERT INTO profiles (id, role, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = COALESCE(EXCLUDED.display_name, profiles.display_name)
        RETURNING id::text, role, display_name, created_at
        """,
        user_id,
        role,
        display_name,
    )
    return dict(row)


# ---------------------------------------------------------------------------
# Parent-child
# ---------------------------------------------------------------------------

async def add_child(pool: asyncpg.Pool, parent_id: str, child_email: str) -> dict:
    """Add a child link for a parent."""
    # Check if child already has a profile
    child_row = await pool.fetchrow(
        """
        SELECT p.id::text, p.role FROM profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE u.email = $1
        """,
        child_email,
    )
    child_id = child_row["id"] if child_row else None

    row = await pool.fetchrow(
        """
        INSERT INTO parent_child (parent_id, child_id, child_email)
        VALUES ($1, $2, $3)
        ON CONFLICT (parent_id, child_email) DO UPDATE SET child_id = EXCLUDED.child_id
        RETURNING id::text, parent_id::text, child_id::text, child_email, created_at
        """,
        parent_id,
        child_id,
        child_email,
    )
    return dict(row)


async def get_children(pool: asyncpg.Pool, parent_id: str) -> list[dict]:
    """List all children for a parent."""
    rows = await pool.fetch(
        """
        SELECT pc.id::text, pc.child_email,
               pc.child_id::text,
               p.display_name,
               pc.created_at
        FROM parent_child pc
        LEFT JOIN profiles p ON p.id = pc.child_id
        WHERE pc.parent_id = $1
        ORDER BY pc.created_at DESC
        """,
        parent_id,
    )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def save_test(
    pool: asyncpg.Pool,
    test_id: str,
    session_id: str,
    creator_id: str,
    test_data: dict,
) -> None:
    """Persist a generated test (with answer keys) to the database."""
    await pool.execute(
        """
        INSERT INTO tests (id, session_id, creator_id, topic, board, grade, book,
                           total_marks, duration_minutes, question_count, test_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
        """,
        test_id,
        session_id,
        creator_id,
        test_data.get("topic"),
        test_data.get("board"),
        test_data.get("grade"),
        test_data.get("book"),
        test_data.get("total_marks"),
        test_data.get("duration_minutes"),
        len(test_data.get("questions", [])),
        json.dumps(test_data),
    )


async def get_tests_for_user(pool: asyncpg.Pool, user_id: str) -> list[dict]:
    """Return test summaries for a user (no answer keys)."""
    rows = await pool.fetch(
        """
        SELECT id, topic, board, grade, book, total_marks, duration_minutes,
               question_count, created_at
        FROM tests
        WHERE creator_id = $1
        ORDER BY created_at DESC
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def get_test_by_id(pool: asyncpg.Pool, test_id: str, requester_id: str) -> dict | None:
    """Return full test data if requester is the creator."""
    row = await pool.fetchrow(
        "SELECT test_data, creator_id::text FROM tests WHERE id = $1",
        test_id,
    )
    if row is None:
        return None
    if row["creator_id"] != requester_id:
        return None
    test_data = json.loads(row["test_data"]) if isinstance(row["test_data"], str) else row["test_data"]
    return test_data


async def get_test_by_id_for_assignment(pool: asyncpg.Pool, test_id: str) -> dict | None:
    """Return full test data for use in assignment evaluation (no auth check)."""
    row = await pool.fetchrow("SELECT test_data FROM tests WHERE id = $1", test_id)
    if row is None:
        return None
    test_data = json.loads(row["test_data"]) if isinstance(row["test_data"], str) else row["test_data"]
    return test_data


# ---------------------------------------------------------------------------
# Test answers
# ---------------------------------------------------------------------------

async def save_answer(
    pool: asyncpg.Pool,
    session_id: str,
    test_id: str,
    question_id: str,
    question_type: str,
    selected_option: str | None,
    feedback_json: str,
    assignment_id: str | None = None,
    taker_id: str | None = None,
    attempt_number: int = 1,
) -> None:
    """Persist a submitted answer and its feedback."""
    await pool.execute(
        """
        INSERT INTO test_answers
            (session_id, test_id, assignment_id, taker_id, question_id, question_type,
             selected_option, feedback_json, attempt_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
        session_id,
        test_id,
        assignment_id,
        taker_id,
        question_id,
        question_type,
        selected_option,
        feedback_json if isinstance(feedback_json, str) else json.dumps(feedback_json),
        attempt_number,
    )


async def get_answers_for_test(pool: asyncpg.Pool, session_id: str, test_id: str) -> list[dict]:
    """Return all answers for a session+test."""
    rows = await pool.fetch(
        """
        SELECT question_id, question_type, selected_option, feedback_json, answered_at
        FROM test_answers
        WHERE session_id = $1 AND test_id = $2
        ORDER BY answered_at ASC
        """,
        session_id,
        test_id,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("feedback_json") and isinstance(d["feedback_json"], str):
            d["feedback_json"] = json.loads(d["feedback_json"])
        result.append(d)
    return result


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

async def create_assignment(
    pool: asyncpg.Pool,
    test_id: str,
    assigned_by: str,
    assigned_to_email: str,
    mode: str = "practice",
    time_multiplier: float = 1.0,
    token_expires_days: int = 30,
) -> dict:
    """Create a test assignment and return the assignment row with token."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=token_expires_days)

    # Look up if child already has profile
    child_row = await pool.fetchrow(
        """
        SELECT p.id::text FROM profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE u.email = $1
        """,
        assigned_to_email,
    )
    assigned_to = child_row["id"] if child_row else None

    row = await pool.fetchrow(
        """
        INSERT INTO test_assignments
            (test_id, assigned_by, assigned_to, assigned_to_email, token, token_expires_at, mode, time_multiplier)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id::text, test_id, token, token_expires_at, status, created_at, mode, time_multiplier
        """,
        test_id,
        assigned_by,
        assigned_to,
        assigned_to_email,
        token,
        expires_at,
        mode,
        time_multiplier,
    )
    return dict(row)


async def get_assignment_by_token(pool: asyncpg.Pool, token: str) -> dict | None:
    """Validate token and return assignment + test data."""
    row = await pool.fetchrow(
        """
        SELECT a.id::text AS assignment_id, a.test_id, a.status,
               a.token_expires_at, a.assigned_to_email,
               a.mode, a.time_multiplier, a.current_attempt,
               t.test_data
        FROM test_assignments a
        JOIN tests t ON t.id = a.test_id
        WHERE a.token = $1
        """,
        token,
    )
    if row is None:
        return None
    d = dict(row)
    if d["token_expires_at"] < datetime.now(timezone.utc):
        return None  # expired
    if isinstance(d["test_data"], str):
        d["test_data"] = json.loads(d["test_data"])
    d["time_multiplier"] = float(d["time_multiplier"])
    return d


async def get_last_attempt_score(
    pool: asyncpg.Pool,
    assignment_id: str,
    test_id: str,
    attempt_number: int = 1,
) -> dict | None:
    """Compute score for a specific attempt on an assignment."""
    rows = await pool.fetch(
        """
        SELECT question_type, feedback_json, answered_at
        FROM test_answers
        WHERE assignment_id = $1 AND test_id = $2 AND attempt_number = $3
        ORDER BY answered_at ASC
        """,
        assignment_id,
        test_id,
        attempt_number,
    )
    if not rows:
        return None

    attempted = len(rows)
    earned_marks = 0
    completed_at = None

    for r in rows:
        fb = r["feedback_json"]
        if isinstance(fb, str):
            fb = json.loads(fb)
        if r["question_type"] == "mcq":
            if fb.get("correct"):
                earned_marks += 1
        else:
            earned_marks += fb.get("score", 0)
        if completed_at is None or r["answered_at"] > completed_at:
            completed_at = r["answered_at"]

    test_row = await pool.fetchrow("SELECT total_marks FROM tests WHERE id = $1", test_id)
    total_marks = test_row["total_marks"] if test_row else 0

    return {
        "attempted": attempted,
        "earned_marks": earned_marks,
        "total_marks": total_marks,
        "completed_at": completed_at,
    }


async def update_assignment_status(pool: asyncpg.Pool, assignment_id: str, status: str) -> None:
    """Update assignment status (started/completed)."""
    await pool.execute(
        "UPDATE test_assignments SET status = $1 WHERE id = $2",
        status,
        assignment_id,
    )


async def start_new_attempt(pool: asyncpg.Pool, token: str) -> int:
    """Increment current_attempt and reset status to 'started'. Returns the new attempt number.

    Old answers are kept intact (tagged with their original attempt_number), so history
    is fully preserved. get_last_attempt_score uses the new attempt_number, which has no
    answers yet, so score returns None until the student submits answers.
    """
    row = await pool.fetchrow(
        """
        UPDATE test_assignments
        SET current_attempt = current_attempt + 1, status = 'started'
        WHERE token = $1
        RETURNING current_attempt
        """,
        token,
    )
    return row["current_attempt"]


# ---------------------------------------------------------------------------
# Parent child-wise views
# ---------------------------------------------------------------------------

async def get_child_assignments(
    pool: asyncpg.Pool,
    parent_id: str,
    child_email: str,
) -> list[dict]:
    """Return all assignments made by parent to a specific child email, with last-attempt scores."""
    rows = await pool.fetch(
        """
        SELECT a.id::text AS assignment_id, a.test_id, a.token, a.status,
               a.mode, a.time_multiplier, a.created_at, a.current_attempt,
               t.topic, t.board, t.grade, t.total_marks, t.duration_minutes, t.question_count
        FROM test_assignments a
        JOIN tests t ON t.id = a.test_id
        WHERE a.assigned_by = $1 AND a.assigned_to_email = $2
        ORDER BY a.created_at DESC
        """,
        parent_id,
        child_email,
    )
    result = []
    for r in rows:
        d = dict(r)
        d["time_multiplier"] = float(d["time_multiplier"])
        score = await get_last_attempt_score(pool, d["assignment_id"], d["test_id"], d["current_attempt"])
        d["score"] = score
        result.append(d)
    return result


async def get_unassigned_tests(
    pool: asyncpg.Pool,
    parent_id: str,
    child_email: str,
) -> list[dict]:
    """Return tests created by parent not yet assigned to this child email."""
    rows = await pool.fetch(
        """
        SELECT id, topic, board, grade, book, total_marks, duration_minutes,
               question_count, created_at
        FROM tests
        WHERE creator_id = $1
          AND id NOT IN (
              SELECT test_id FROM test_assignments
              WHERE assigned_by = $1 AND assigned_to_email = $2
          )
        ORDER BY created_at DESC
        """,
        parent_id,
        child_email,
    )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Student dashboard
# ---------------------------------------------------------------------------

async def get_student_assignments(
    pool: asyncpg.Pool,
    student_id: str,
) -> list[dict]:
    """Return all assignments for a student (matched by user ID or email), with scores."""
    rows = await pool.fetch(
        """
        SELECT a.id::text AS assignment_id, a.test_id, a.token, a.status,
               a.mode, a.time_multiplier, a.created_at, a.current_attempt, a.assigned_to_email,
               t.topic, t.board, t.grade, t.total_marks, t.duration_minutes, t.question_count,
               p.display_name AS assigned_by_name
        FROM test_assignments a
        JOIN tests t ON t.id = a.test_id
        LEFT JOIN profiles p ON p.id = a.assigned_by
        WHERE a.assigned_to = $1
           OR a.assigned_to_email = (
               SELECT u.email FROM auth.users u WHERE u.id = $1
           )
        ORDER BY a.created_at DESC
        """,
        student_id,
    )
    result = []
    for r in rows:
        d = dict(r)
        d["time_multiplier"] = float(d["time_multiplier"])
        score = await get_last_attempt_score(pool, d["assignment_id"], d["test_id"], d["current_attempt"])
        d["score"] = score
        result.append(d)
    return result


async def get_assignment_review(
    pool: asyncpg.Pool,
    token: str,
    requester_id: str,
) -> dict | None:
    """Return full assignment with child's answers for parent review. Requester must be assigner."""
    row = await pool.fetchrow(
        """
        SELECT a.id::text AS assignment_id, a.test_id, a.status,
               a.assigned_to_email, a.assigned_by::text,
               a.mode, a.time_multiplier, a.current_attempt,
               t.test_data
        FROM test_assignments a
        JOIN tests t ON t.id = a.test_id
        WHERE a.token = $1
        """,
        token,
    )
    if row is None:
        return None
    d = dict(row)
    if d["assigned_by"] != requester_id:
        return None  # not authorized

    test_data = json.loads(d["test_data"]) if isinstance(d["test_data"], str) else d["test_data"]
    d["time_multiplier"] = float(d["time_multiplier"])

    answer_rows = await pool.fetch(
        """
        SELECT question_id, question_type, selected_option, feedback_json, answered_at
        FROM test_answers
        WHERE assignment_id = $1 AND test_id = $2 AND attempt_number = $3
        ORDER BY answered_at ASC
        """,
        d["assignment_id"],
        d["test_id"],
        d["current_attempt"],
    )

    answers_by_qid: dict[str, Any] = {}
    for ar in answer_rows:
        ad = dict(ar)
        if isinstance(ad["feedback_json"], str):
            ad["feedback_json"] = json.loads(ad["feedback_json"])
        answers_by_qid[ad["question_id"]] = ad

    d["test"] = test_data
    d["answers"] = answers_by_qid
    # current_attempt is already in d; remove internal fields
    del d["test_data"]
    del d["assigned_by"]
    return d
