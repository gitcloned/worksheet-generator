import { useState } from 'react';
import { evaluateMCQ } from '../../api/client';
import type { MCQFeedback, MCQQuestion as MCQQuestionType } from '../../types';
import { QuestionFeedback } from './QuestionFeedback';

type Props = {
  question: MCQQuestionType;
  index: number;
  testId: string;
  userId: string;
  sessionId: string;
};

export function MCQQuestion({ question, index, testId, userId, sessionId }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MCQFeedback | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSelect(optionId: string) {
    if (feedback || loading) return; // already answered

    setSelected(optionId);
    setLoading(true);

    try {
      const result = await evaluateMCQ(userId, sessionId, testId, question.id, optionId);
      setFeedback(result);
    } catch {
      // leave loading state — user can retry
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

    // Post-feedback coloring
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

      {loading && (
        <p className="mt-3 text-xs text-gray-400 animate-pulse">Checking your answer…</p>
      )}

      {feedback && <QuestionFeedback feedback={feedback} />}
    </div>
  );
}
