import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getAssignment,
  evaluateMCQForAssignment,
  evaluateSubjectiveForAssignment,
} from '../api/client';
import type { MCQFeedback, MCQQuestion, SubjectiveFeedback, SubjectiveQuestion, Question, PracticeTest } from '../types';
import { QuestionFeedback } from '../components/PracticeTest/QuestionFeedback';
import { useRef } from 'react';

type AssignmentData = {
  assignment_id: string;
  test: PracticeTest;
  status: string;
};

export function TakeTestPage() {
  const { token } = useParams<{ token: string }>();
  const [assignment, setAssignment] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, MCQFeedback | SubjectiveFeedback>>({});
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    getAssignment(token)
      .then(setAssignment)
      .catch(() => setError('This assignment link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  function onFeedback(questionId: string, feedback: MCQFeedback | SubjectiveFeedback) {
    setFeedbacks((prev) => {
      if (prev[questionId]) return prev; // already answered
      const updated = { ...prev, [questionId]: feedback };
      setCompletedCount(Object.keys(updated).length);
      return updated;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
          <p className="text-4xl mb-4">🔗</p>
          <h2 className="font-semibold text-gray-900 mb-2">Link not found</h2>
          <p className="text-sm text-gray-500">{error ?? 'This assignment link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const { test, assignment_id } = assignment;
  const totalQuestions = test.questions.length;
  const allDone = completedCount >= totalQuestions;

  if (allDone) {
    const mcqFeedbacks = Object.values(feedbacks).filter((f): f is MCQFeedback => 'correct' in f);
    const correctCount = mcqFeedbacks.filter((f) => f.correct).length;
    const subjectiveFeedbacks = Object.values(feedbacks).filter((f): f is SubjectiveFeedback => 'score' in f);
    const totalScore = subjectiveFeedbacks.reduce((acc, f) => acc + f.score, 0);
    const totalMaxScore = subjectiveFeedbacks.reduce((acc, f) => acc + f.max_score, 0);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
          <p className="text-5xl mb-4">🎉</p>
          <h2 className="font-bold text-gray-900 text-xl mb-2">Test Complete!</h2>
          <p className="text-gray-500 text-sm mb-6">{test.topic}</p>
          <div className="space-y-3">
            {mcqFeedbacks.length > 0 && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-600">MCQ Score</p>
                <p className="text-2xl font-bold text-gray-900">
                  {correctCount}/{mcqFeedbacks.length}
                </p>
              </div>
            )}
            {subjectiveFeedbacks.length > 0 && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-600">Written Score</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totalScore}/{totalMaxScore}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-800 text-sm">{test.topic}</p>
            <p className="text-xs text-gray-400">
              {test.board && `${test.board} · `}{test.grade && `Grade ${test.grade}`}
            </p>
          </div>
          <span className="text-xs text-gray-500">
            {completedCount}/{totalQuestions} answered
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {test.questions.map((q: Question, i: number) => {
          if (q.type === 'mcq') {
            return (
              <AssignmentMCQQuestion
                key={q.id}
                question={q}
                index={i}
                token={token!}
                assignmentId={assignment_id}
                testId={test.test_id}
                onFeedback={(fb) => onFeedback(q.id, fb)}
                initialFeedback={feedbacks[q.id] as MCQFeedback | undefined}
              />
            );
          }
          return (
            <AssignmentSubjectiveQuestion
              key={q.id}
              question={q}
              index={i}
              token={token!}
              assignmentId={assignment_id}
              testId={test.test_id}
              onFeedback={(fb) => onFeedback(q.id, fb)}
              initialFeedback={feedbacks[q.id] as SubjectiveFeedback | undefined}
            />
          );
        })}
      </main>
    </div>
  );
}

// ── Assignment-specific MCQ component ─────────────────────────────────────

function AssignmentMCQQuestion({
  question,
  index,
  token,
  assignmentId,
  testId,
  onFeedback,
  initialFeedback,
}: {
  question: MCQQuestion;
  index: number;
  token: string;
  assignmentId: string;
  testId: string;
  onFeedback: (fb: MCQFeedback) => void;
  initialFeedback?: MCQFeedback;
}) {
  const [selected, setSelected] = useState<string | null>(initialFeedback?.selected_option ?? null);
  const [feedback, setFeedback] = useState<MCQFeedback | null>(initialFeedback ?? null);
  const [loading, setLoading] = useState(false);

  async function handleSelect(optionId: string) {
    if (feedback || loading) return;
    setSelected(optionId);
    setLoading(true);
    try {
      const result = await evaluateMCQForAssignment(token, assignmentId, testId, question.id, optionId);
      setFeedback(result);
      onFeedback(result);
    } catch {
      // keep loading off so user can retry
    } finally {
      setLoading(false);
    }
  }

  function optionStyle(optionId: string): string {
    const base = 'flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors';
    if (!feedback) {
      if (selected === optionId) return `${base} border-brand-500 bg-brand-50 text-brand-700`;
      return `${base} border-gray-200 hover:border-brand-300 hover:bg-gray-50 cursor-pointer`;
    }
    if (optionId === feedback.correct_option) return `${base} border-green-400 bg-green-50 text-green-800`;
    if (optionId === selected && !feedback.correct) return `${base} border-red-400 bg-red-50 text-red-800`;
    return `${base} border-gray-100 text-gray-400`;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · MCQ
      </p>
      <p className="mb-4 font-medium text-gray-800">{question.text}</p>
      <div className="space-y-2">
        {question.options.map((opt) => (
          <button
            key={opt.id}
            className={optionStyle(opt.id)}
            onClick={() => handleSelect(opt.id)}
            disabled={!!feedback || loading}
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
              {opt.id}
            </span>
            <span>{opt.text}</span>
          </button>
        ))}
      </div>
      {loading && <p className="mt-3 text-xs text-gray-400 animate-pulse">Checking your answer…</p>}
      {feedback && <QuestionFeedback feedback={feedback} />}
    </div>
  );
}

// ── Assignment-specific Subjective component ───────────────────────────────

function AssignmentSubjectiveQuestion({
  question,
  index,
  token,
  assignmentId,
  testId,
  onFeedback,
  initialFeedback,
}: {
  question: SubjectiveQuestion;
  index: number;
  token: string;
  assignmentId: string;
  testId: string;
  onFeedback: (fb: SubjectiveFeedback) => void;
  initialFeedback?: SubjectiveFeedback;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SubjectiveFeedback | null>(initialFeedback ?? null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreview(result);
      setImageBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!imageBase64 || loading || feedback) return;
    setLoading(true);
    try {
      const result = await evaluateSubjectiveForAssignment(token, assignmentId, testId, question.id, imageBase64);
      setFeedback(result);
      onFeedback(result);
    } catch {
      // surface via re-enable
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · {question.type === 'short_answer' ? 'Short Answer' : question.type === 'long_answer' ? 'Long Answer' : 'Written'} ({question.marks} marks)
      </p>
      <p className="mb-4 font-medium text-gray-800">{question.text}</p>

      {!feedback && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          {!preview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-5 py-4 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center"
            >
              Take a photo of your working
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <img src={preview} alt="Your working" className="w-full rounded-lg border border-gray-200 object-contain max-h-64" />
                <button
                  onClick={() => { setPreview(null); setImageBase64(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="absolute top-2 right-2 rounded-full bg-white border border-gray-200 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-500 shadow-sm"
                >
                  ✕
                </button>
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Grading your work…' : 'Submit for Grading'}
              </button>
            </div>
          )}
        </>
      )}

      {feedback && (
        <>
          {preview && <img src={preview} alt="Your working" className="w-full rounded-lg border border-gray-200 object-contain max-h-48 mb-3" />}
          <QuestionFeedback feedback={feedback} />
        </>
      )}
    </div>
  );
}
