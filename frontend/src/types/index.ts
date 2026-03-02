// ── Test data structures (answer-key fields stripped by backend) ──────────

export type MCQOption = {
  id: string; // "A" | "B" | "C" | "D"
  text: string;
};

export type MCQQuestion = {
  id: string;
  type: 'mcq';
  text: string;
  options: MCQOption[];
};

export type SubjectiveQuestion = {
  id: string;
  type: 'subjective';
  text: string;
  marks: number;
};

export type Question = MCQQuestion | SubjectiveQuestion;

export type PracticeTest = {
  test_id: string;
  topic: string;
  board: string;
  grade: string;
  book: string;
  questions: Question[];
};

// ── Feedback returned by evaluation endpoints ─────────────────────────────

export type MCQFeedback = {
  question_id: string;
  correct: boolean;
  selected_option: string;
  correct_option: string;
  explanation: string;
};

export type SubjectiveFeedback = {
  question_id: string;
  score: number;
  max_score: number;
  explanation: string;
  step_feedback: string[];
  next_step_hint: string;
};

export type QuestionFeedback = MCQFeedback | SubjectiveFeedback;

// ── Chat message types ────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifact?: PracticeTest; // rendered inline when present
};

// ── SSE event envelope from backend ──────────────────────────────────────

export type SSEEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'artifact'; test: PracticeTest }
  | { type: 'done' }
  | { type: 'error'; message: string };
