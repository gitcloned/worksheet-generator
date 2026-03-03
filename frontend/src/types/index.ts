// ── Book research ─────────────────────────────────────────────────────────

export type BookTopic = {
  id: string;
  name: string;
  subtopics: string[];
};

export type BookResearch = {
  topics: BookTopic[];
  question_formats: string[];
  key_concepts: string[];
  book: string;
  board: string;
  grade: string;
};

// ── Paper blueprint ───────────────────────────────────────────────────────

export type CognitiveLevel = 'LOTS' | 'MOTS' | 'HOTS';

export type PaperSection = {
  type: 'mcq' | 'short_answer' | 'long_answer';
  cognitive_level: CognitiveLevel;
  count: number;
  marks_each: number;
  topics: string[];
};

export type PaperBlueprint = {
  duration_minutes: number;
  total_marks: number;
  difficulty: string;
  sections: PaperSection[];
  selected_topics: string[];
};

// ── Test data structures (answer-key fields stripped by backend) ──────────

export type MCQOption = {
  id: string; // "A" | "B" | "C" | "D"
  text: string;
};

export type MCQQuestion = {
  id: string;
  type: 'mcq';
  cognitive_level?: CognitiveLevel;
  text: string;
  options: MCQOption[];
};

export type SubjectiveQuestion = {
  id: string;
  type: 'subjective' | 'short_answer' | 'long_answer';
  cognitive_level?: CognitiveLevel;
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
  duration_minutes?: number;
  total_marks?: number;
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
  artifact?: PracticeTest;
  research?: BookResearch;
  blueprint?: PaperBlueprint;
};

// ── SSE event envelope from backend ──────────────────────────────────────

export type SSEEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'research'; data: BookResearch }
  | { type: 'blueprint'; data: PaperBlueprint }
  | { type: 'artifact'; test: PracticeTest }
  | { type: 'done' }
  | { type: 'error'; message: string };
