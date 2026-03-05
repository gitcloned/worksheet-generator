# Architecture

This document explains the non-obvious design decisions and internal flows. Read the README first for setup and API reference.

---

## The Three-Step AI Pipeline

Test creation happens in a single chat session. The orchestrator agent (Gemini 2.5 Flash) drives three sequential tool calls:

```
User message ("Grade 5 Maths, CBSE, chapter 3")
        │
        ▼
1. research_book()
   └── Searches the web for the textbook chapter
   └── Extracts: topics, key concepts, question formats
   └── Saves raw research to ADK session state as current_research
   └── Emits SSE event: { type: "research", data: {...} }
        │
        ▼
2. design_blueprint()
   └── Reads current_research from session state
   └── Decides: how many MCQs, short-answer, long-answer questions
   └── Assigns marks, difficulty, cognitive levels (LOTS/MOTS/HOTS)
   └── Saves blueprint to session state as current_blueprint
   └── Emits SSE event: { type: "blueprint", data: {...} }
        │
        ▼
3. generate_questions()
   └── Reads blueprint + research from session state
   └── Generates full test JSON: questions, options, answer keys, explanations
   └── Saves test to PostgreSQL (tests table) — includes answer keys
   └── Emits SSE event: { type: "artifact", test: <stripped_test> }
        │
        ▼
Frontend receives the test with answer keys stripped out
```

**Why three steps instead of one?**
- Each step is independently inspectable — the frontend renders a research card and blueprint card as they arrive, so the user sees progress rather than a long wait
- Separating research from generation improves accuracy; the generator has focused, curated input rather than raw search results
- The blueprint step enforces distribution constraints (e.g. at least one HOTS question) that are hard to guarantee in a single pass

**Session state threading:**
The ADK session persists across tool calls. `research_book` writes to `current_research`, `design_blueprint` reads it and writes `current_blueprint`, `generate_questions` reads both. This allows the orchestrator to call these tools in sequence across multiple LLM turns without re-passing large payloads.

---

## SSE Event Flow

The `/api/chat` endpoint returns a streaming response. The frontend reads it as a text stream split on double-newlines (`\n\n`).

```
Backend                                     Frontend
──────                                     ────────
runner.run_async(...)                       fetch('/api/chat', { signal })
  │                                           │
  ├── part.function_response (research_book)  │
  │     └── yield "data: {...research...}\n\n" ──► onEvent({ type:'research', data })
  │                                           │     └── renders ResearchCard
  ├── part.function_response (design_blueprint)
  │     └── yield "data: {...blueprint...}\n\n" ──► onEvent({ type:'blueprint', data })
  │                                           │     └── renders BlueprintCard
  ├── part.function_response (generate_questions)
  │     └── yield "data: {...artifact...}\n\n"  ──► onEvent({ type:'artifact', test })
  │                                           │     └── renders test inline in chat
  ├── part.text (LLM text response)
  │     └── yield "data: {...text_delta...}\n\n" ──► onEvent({ type:'text_delta', content })
  │                                           │     └── appends to current message
  └── yield "data: {type:'done'}\n\n"         ──► onEvent({ type:'done' })
                                              │     └── marks message complete
```

The `AbortController` returned by `streamChat()` cancels the fetch if the user navigates away.

---

## Three Evaluation Paths

There are three ways to evaluate a question answer, depending on who is taking the test. They share the same underlying grading logic but differ in how they authenticate, where they get the answer key, and how they save the result.

### Path 1 — Session-based (legacy, `/api/evaluate/mcq`)
Used when a user is taking a test that was just generated in the same chat session. The answer key is fetched from ADK session state (`current_test`). Used by `useChat.ts` in the original flow.

**Auth:** Optional (Supabase JWT if logged in)
**Answer key source:** ADK session state
**Result saved with:** `session_id` only (no `assignment_id`)

### Path 2 — Assignment token-based (`/api/assignment/:token/evaluate/mcq`)
Used when a child opens an assignment link. No login required — the token is the credential. The answer key is fetched from the `tests` table via the assignment record.

**Auth:** None (token in URL path)
**Answer key source:** `tests.test_data` via `test_assignments.test_id`
**Result saved with:** `session_id = "assignment:{token}"`, `assignment_id`

### Path 3 — Self-test (`/api/tests/:test_id/evaluate/mcq`)
Used when the test creator clicks "Take This Test". Requires authentication and ownership check — only the creator can evaluate against their own test.

**Auth:** Required (Supabase JWT), creator check enforced
**Answer key source:** `tests.test_data` (auth-gated by `creator_id`)
**Result saved with:** `session_id` (random UUID per visit), `taker_id = user_id`

**Why not just one path?**
- Path 1 predates the database-backed test library; it depends on ephemeral session state and can't be used without an active chat session
- Path 2 must work without any user account — sharing a link with a child is the core UX
- Path 3 needs an ownership check to prevent one user from evaluating another user's private test

---

## Assignment Token Lifecycle

```
Parent clicks "Assign to Child"
        │
        ▼
POST /api/assignments
  └── Generates a cryptographically random URL-safe token (32 bytes)
  └── Stores in test_assignments: token, expires_at (+30 days), mode, time_multiplier
  └── Looks up child by email — sets assigned_to if child has a profile already
  └── Returns: { link: "https://app.com/take-test/{token}" }
        │
        ▼
Child opens link → GET /api/assignment/{token}
  └── Validates token exists and has not expired
  └── Returns stripped test (no answer keys) + mode + time_multiplier
  └── Sets status = 'started' if previously 'pending'
        │
        ▼
Child takes test (practice: per-question; exam: all at once on submit)
  └── Each answered question → POST /api/assignment/{token}/evaluate/mcq|subjective
  └── Answer + feedback saved to test_answers with assignment_id
        │
        ▼
Child submits → POST /api/assignment/{token}/complete
  └── Sets status = 'completed'
        │
        ▼
Parent views results → GET /api/assignment/{token}/review
  └── Auth required: only the assigner (assigned_by) can view
  └── Returns full test (with answer keys) + all child answers + feedbacks
```

**Token expiry:** Tokens expire after 30 days. An expired token returns 404 from `get_assignment_by_token`. There is no refresh mechanism — a new assignment must be created.

**Status values:**
- `pending` — created but child hasn't opened the link yet
- `started` — child opened the link (set on first `GET /api/assignment/{token}`)
- `completed` — child submitted (set on `POST /api/assignment/{token}/complete`)

---

## Answer Key Security

The answer key (correct MCQ option, solution steps, expected answer, explanation) is stored only in `tests.test_data` in PostgreSQL. It is never sent to the frontend directly.

**Two stripping points:**

1. **Test creation** — When `generate_questions` fires in the SSE stream, `_strip_answers()` removes `correct_option` and `explanation` from MCQs and `solution_steps` and `expected_answer` from subjective questions before the `artifact` event is emitted.

2. **Assignment** — `GET /api/assignment/{token}` calls `_strip_answers()` again before returning the test to the (unauthenticated) student.

The `/api/tests/:test_id` endpoint (creator-only, auth-gated) returns the full unstripped test data — that's intentional; the creator needs to see answers when building or reviewing tests.

Evaluation endpoints look up the answer key server-side at grading time and never include it in the response — only the feedback (correct/incorrect, explanation) is returned to the client.

---

## Parent-Child Linking

The `parent_child` table links a parent account to a child by email. The `child_id` column is nullable:

```
parent_child
  parent_id    → profiles.id (parent's account)
  child_email  → email the parent typed
  child_id     → profiles.id (child's account, or NULL if child hasn't signed up)
```

**Why email instead of ID?**
A parent typically adds their child before the child has a Google account. The link is established by email, and `child_id` is populated later either when:
- The child signs up (Supabase auth trigger would handle this in a production system), or
- The parent adds them when `child_email` matches an existing `auth.users` row (the `add_child` DB function does this lookup on insert)

For assignments, `test_assignments.assigned_to` has the same nullable pattern — `assigned_to_email` is the authoritative field for student dashboard lookups:

```sql
WHERE a.assigned_to = $1
   OR a.assigned_to_email = (SELECT email FROM auth.users WHERE id = $1)
```

---

## Exam Mode — Local Pending Answers

In exam mode, the frontend does not call any evaluation endpoint while the student is answering. Answers are stored in React state (`pendingAnswers`) as:

```typescript
type PendingMCQAnswer       = { type: 'mcq'; selectedOption: string }
type PendingSubjectiveAnswer = { type: 'subjective'; imageBase64: string; previewUrl: string }
```

On submit, all pending answers are evaluated in parallel via `Promise.allSettled`. This means:
- The order of grading is non-deterministic (subjective questions take longer)
- A failed evaluation for one question does not block others
- The `gradedCount` state increments as each resolves, driving the evaluating spinner

`completeAssignment()` is called after all evals finish, not before, so the `completed` status accurately reflects that answers have been saved.

**Stale closure fix:**
The `handleSubmit` function is assigned to `submitRef.current` on every render. The `TimeUpModal` auto-submit countdown reads from `submitRef.current`, not from a direct closure, so it always calls the latest version of `handleSubmit` with current state. Without this pattern, the auto-submit would fire with stale `pendingAnswers` captured at the time the timer was set up.

---

## Database — Key Query Patterns

**Score computation** (`get_last_attempt_score`):
Scores are not stored as a column — they're computed from `test_answers` on demand. MCQ correct = 1 mark, MCQ wrong = 0. Subjective score comes from `feedback_json.score` (set by Gemini Vision during evaluation).

**Unassigned tests** (`get_unassigned_tests`):
Uses a `NOT IN (SELECT test_id FROM test_assignments WHERE ...)` subquery. Works correctly for small datasets; for large libraries a LEFT JOIN + IS NULL pattern would be more efficient.

**Student assignments** (`get_student_assignments`):
Uses a union-style OR condition to match both `assigned_to = user_id` and `assigned_to_email = user's email` — handles the case where the assignment was created before the student had an account.
