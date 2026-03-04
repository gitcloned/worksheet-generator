-- Extends Supabase's built-in auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('parent', 'student')),
  display_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Parent <-> child links (child_id null until child signs up via Google)
CREATE TABLE IF NOT EXISTS parent_child (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  child_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  child_email  TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (parent_id, child_email)
);

-- ADK session state (replaces SQLite sessions table)
CREATE TABLE IF NOT EXISTS sessions (
  app_name    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  state       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (app_name, user_id, session_id)
);

-- Persisted tests (saved on generate_questions, enables library/browsing)
CREATE TABLE IF NOT EXISTS tests (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL,
  creator_id       UUID NOT NULL REFERENCES profiles(id),
  topic            TEXT,
  board            TEXT,
  grade            TEXT,
  book             TEXT,
  total_marks      INTEGER,
  duration_minutes INTEGER,
  question_count   INTEGER,
  test_data        JSONB NOT NULL,  -- full test including answer keys
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Parent assigns test to child -> generates access token
CREATE TABLE IF NOT EXISTS test_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           TEXT NOT NULL REFERENCES tests(id),
  assigned_by       UUID NOT NULL REFERENCES profiles(id),
  assigned_to       UUID REFERENCES profiles(id),
  assigned_to_email TEXT NOT NULL,
  token             TEXT UNIQUE NOT NULL,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'started', 'completed')),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Test answers (answers + feedback for all question types)
CREATE TABLE IF NOT EXISTS test_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT NOT NULL,
  test_id         TEXT NOT NULL,
  assignment_id   UUID REFERENCES test_assignments(id),
  taker_id        UUID REFERENCES profiles(id),
  question_id     TEXT NOT NULL,
  question_type   TEXT NOT NULL,
  selected_option TEXT,
  feedback_json   JSONB,
  answered_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_answers_session_test ON test_answers (session_id, test_id);
