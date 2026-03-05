# AI Practice MVP

An AI-powered practice test platform for school students. Parents (or teachers) create topic-specific tests using an AI assistant, assign them to children, and track results. Students take tests in practice or exam mode and get instant AI-powered feedback.

## User Journeys

### Parent
1. Sign in with Google → select role **Parent** on first login
2. **Create a test** — chat with the AI assistant: give it a topic, board, grade, and textbook. It researches the book, designs a test blueprint, and generates a mixed MCQ + written test. The full answer key is stored server-side; only stripped question data is sent to the browser.
3. **Assign** — open the test, click "Assign to Child". Choose practice or exam mode, set a time multiplier for accessibility (1×, 1.5×, 2×), and share the generated link.
4. **Track** — navigate to a child's page to see all assigned tests, completion status, scores, and review their full answers question by question.

### Child / Student
1. Open the assignment link (no login required)
2. Read the intro screen — test info, mode, and previous attempt score if it exists
3. **Practice mode** — one question at a time; instant feedback and explanation after each answer; "Next Question →" button guides flow
4. **Exam mode** — countdown timer; answers are stored locally without feedback; submit all at once for batch AI grading; results and explanations shown after
5. After submitting: score summary → "Review Answers →" carousel to revisit every question with correct answer and explanation highlighted

### Self-test (creator)
From the test viewer, click **"Take This Test"** to take your own test. Choose mode on the intro screen — the same practice/exam experience applies.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI + Python 3.11 |
| AI | Google ADK (`LlmAgent`) + Gemini 2.5 Flash |
| Auth | Supabase Google OAuth + JWT (python-jose) |
| Database | Supabase PostgreSQL (asyncpg) |
| Streaming | Server-Sent Events (SSE) |
| Deployment | Render (backend) + Vercel (frontend) |

---

## Project Structure

```
.
├── backend/
│   ├── main.py                  # FastAPI app — all routes
│   ├── models.py                # Pydantic request/response schemas
│   ├── auth.py                  # JWT validation (Supabase JWKS + HS256 fallback)
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   │   ├── orchestrator.py      # ADK LlmAgent + Runner, session management
│   │   ├── tools.py             # research_book, design_blueprint, generate_questions
│   │   └── prompts.py           # System prompts for all agent roles
│   └── db/
│       ├── database.py          # asyncpg pool + all DB functions
│       ├── schema.sql           # Run once in Supabase SQL editor to create tables
│       └── session_service.py   # PostgresSessionService (extends ADK InMemorySessionService)
│
├── frontend/
│   └── src/
│       ├── App.tsx                  # Route definitions
│       ├── api/client.ts            # All REST + SSE API calls
│       ├── types/index.ts           # Shared TypeScript types
│       ├── lib/supabase.ts          # Supabase client setup
│       ├── contexts/AuthContext.tsx # Auth state, profile, signInWithGoogle
│       ├── components/
│       │   ├── DataGrid.tsx         # Reusable paginated table
│       │   └── PracticeTest/        # Question cards, feedback display
│       └── pages/
│           ├── LoginPage.tsx
│           ├── OnboardingPage.tsx
│           ├── TestsPage.tsx        # Parent: test library + children; Student: assignments
│           ├── CreateTestPage.tsx   # AI chat interface for test creation
│           ├── TestViewerPage.tsx   # Read-only test view + assign modal
│           ├── TakeTestPage.tsx     # Link-based test taking (no auth, full exam/practice)
│           ├── SelfTakeTestPage.tsx # Authenticated self-test (creator takes own test)
│           ├── ChildPage.tsx        # Parent child-wise view: assignments + unassigned tests
│           └── AssignmentReviewPage.tsx  # Parent reviews child's answers
│
├── render.yaml      # Render deploy config (backend)
└── vercel.json      # Vercel deploy config (frontend)
```

---

## Local Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is fine)
- A [Google AI Studio](https://aistudio.google.com/) API key

### 1. Supabase Setup (one-time)

1. Create a new Supabase project
2. Go to **SQL Editor** and run the contents of `backend/db/schema.sql`
3. Go to **Authentication → Providers → Google** and enable Google OAuth (you'll need a Google Cloud OAuth client)
4. Note down from **Settings → API**:
   - Project URL → `VITE_SUPABASE_URL` / (not needed for backend)
   - `anon` key → `VITE_SUPABASE_ANON_KEY`
   - JWT Secret → `SUPABASE_JWT_SECRET`
5. Note down from **Settings → Database → Connection string** (URI format) → `DATABASE_URL`

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in all values in .env (see Environment Variables below)

.venv/bin/uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install

cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# VITE_API_BASE_URL can stay empty for local dev (proxied to :8000 by Vite)

npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Google AI Studio API key for Gemini |
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection string (URI format with SSL) |
| `SUPABASE_JWT_SECRET` | Yes | From Supabase → Settings → API → JWT Secret. Used to validate user tokens. |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed CORS origins. Defaults to `localhost:5173`. |
| `FRONTEND_BASE_URL` | No | Used when generating assignment share links. Defaults to `http://localhost:5173`. |
| `GOOGLE_GENAI_USE_VERTEXAI` | No | Set `true` to use Vertex AI instead of AI Studio. |
| `APP_NAME` | No | ADK app namespace. Defaults to `ai-practice-mvp`. |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL (e.g. `https://xyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase `anon` public key — safe to expose in the browser |
| `VITE_API_BASE_URL` | No | Backend base URL. Leave empty in local dev (Vite proxies to :8000). Set to backend URL in production. |

---

## API Reference

### Auth & Profile
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/profile` | Required | Create/update profile with role after first login |
| `GET` | `/api/profile` | Required | Get current user's profile |

### Test Library
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/tests` | Required | List tests created by the current user |
| `GET` | `/api/tests/:test_id` | Required | Get full test (creator only) |

### AI Test Creation
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/session/create` | Optional | Create an ADK chat session |
| `POST` | `/api/chat` | Optional | Send a message; streams SSE events back |

### Assignments — Parent
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/parent/children` | Required | Add a child link by email |
| `GET` | `/api/parent/children` | Required | List parent's children |
| `GET` | `/api/parent/children/:child_id/assignments` | Required | Child's assignments with scores |
| `GET` | `/api/parent/children/:child_id/unassigned-tests` | Required | Parent's tests not yet assigned to this child |
| `POST` | `/api/assignments` | Required | Create an assignment; returns shareable token link |
| `GET` | `/api/assignment/:token/review` | Required | Full assignment with child's answers (assigner only) |

### Assignments — Student / Link-based (no auth)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/assignment/:token` | None | Validate token, return stripped test + mode |
| `GET` | `/api/assignment/:token/last-attempt` | None | Score from most recent attempt |
| `POST` | `/api/assignment/:token/complete` | None | Mark assignment completed |
| `POST` | `/api/assignment/:token/evaluate/mcq` | None | Grade an MCQ answer |
| `POST` | `/api/assignment/:token/evaluate/subjective` | None | Grade handwritten work (Base64 image) |
| `GET` | `/api/student/assignments` | Required | All assignments for the logged-in student |

### Self-test (creator takes own test)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/tests/:test_id/evaluate/mcq` | Required | Grade MCQ (creator only) |
| `POST` | `/api/tests/:test_id/evaluate/subjective` | Required | Grade handwritten work (creator only) |

### SSE Event Types (from `/api/chat`)

```json
{ "type": "text_delta",  "content": "..." }
{ "type": "research",    "data": { "topics": [...], "key_concepts": [...], ... } }
{ "type": "blueprint",   "data": { "sections": [...], "total_marks": 20, ... } }
{ "type": "artifact",    "test": { "test_id": "...", "questions": [...] } }
{ "type": "done" }
{ "type": "error",       "message": "..." }
```

---

## Deployment

### Backend → Render
A `render.yaml` is included. In Render:
1. Connect the repo and select **Web Service**
2. Set all environment variables from `backend/.env.example` in the Render dashboard
3. The build command is `pip install -r requirements.txt`; start command is `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Frontend → Vercel
A `vercel.json` is included (rewrites `/*` to `index.html` for SPA routing).
1. Connect the repo in Vercel, set root directory to `frontend/`
2. Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (your Render backend URL)
3. Add the Vercel deployment URL to `ALLOWED_ORIGINS` in your Render backend env vars

> After deploying, also add the Vercel URL as an allowed redirect URL in Supabase → Authentication → URL Configuration.

---

## Database Schema

Six tables in Supabase PostgreSQL — run `backend/db/schema.sql` once to create them:

| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users` with `role` (parent/student) and `display_name` |
| `parent_child` | Links a parent profile to a child email; `child_id` is null until the child signs up |
| `sessions` | ADK agent session state (chat history + `current_test`) |
| `tests` | Persisted tests including full answer keys (never sent to frontend directly) |
| `test_assignments` | Assignment records with token, expiry, mode, time multiplier, and status |
| `test_answers` | Every submitted answer with AI feedback, linked to assignment and/or session |

See `backend/db/schema.sql` for full column definitions and constraints.
