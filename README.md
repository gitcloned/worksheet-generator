# Worksheet Generator

An AI-powered practice test generator for school students. Students chat with an AI tutor to generate topic-specific tests, answer MCQs in-place, and submit handwritten work via photo for instant grading.

## How it works

1. Student tells the AI their **topic, board, grade, and textbook**
2. AI generates a mixed test — 3 MCQs + 2 subjective questions — inline in the chat
3. **MCQs** are graded instantly on tap with an explanation
4. **Subjective questions** are graded by uploading a photo of handwritten work; Gemini Vision scores each step and gives targeted feedback

The answer key never leaves the server — only stripped question data is sent to the frontend.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI + Python |
| AI | Google ADK (`LlmAgent`) + Gemini 2.5 Flash |
| Session storage | SQLite (custom ADK session service) |
| Streaming | Server-Sent Events (SSE) |

## Project structure

```
.
├── backend/
│   ├── main.py              # FastAPI app — chat, session, evaluation endpoints
│   ├── models.py            # Pydantic request/response schemas
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   │   ├── orchestrator.py  # ADK LlmAgent + Runner setup
│   │   ├── tools.py         # generate_test tool (calls Gemini, stores answer key)
│   │   └── prompts.py       # System prompts for orchestrator, generator, evaluator
│   └── db/
│       ├── database.py      # SQLite schema + answer persistence
│       └── session_service.py  # SQLiteSessionService extending ADK InMemorySessionService
└── frontend/
    └── src/
        ├── api/client.ts        # REST + SSE API calls
        ├── hooks/useChat.ts     # Chat state, SSE event handling
        ├── types/index.ts       # Shared TypeScript types
        └── components/
            ├── Chat/            # Chat UI + message bubbles
            └── PracticeTest/    # Test renderer, MCQ/subjective question cards, feedback
```

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key (Gemini access required)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Add your GOOGLE_API_KEY to .env

mkdir -p data
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend proxies `/api/*` to the backend on port 8000.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/session/create` | Create or resume an ADK session |
| POST | `/api/chat` | Send message; streams SSE events back |
| POST | `/api/evaluate/mcq` | Grade a single MCQ answer |
| POST | `/api/evaluate/subjective` | Grade handwritten work from a Base64 image |

### SSE event types

```json
{ "type": "text_delta", "content": "..." }
{ "type": "artifact", "test": { ... } }
{ "type": "done" }
{ "type": "error", "message": "..." }
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_API_KEY` | — | Required. Google AI Studio API key |
| `GOOGLE_GENAI_USE_VERTEXAI` | `false` | Set to `true` to use Vertex AI instead |
| `APP_NAME` | `ai-practice-mvp` | ADK app name |
| `DB_PATH` | `data/sessions.db` | Path to SQLite database |
