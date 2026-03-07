import { useState } from 'react';
import { evaluateSubjective } from '../../api/client';
import type { SubjectiveFeedback, SubjectiveQuestion as SubjectiveQuestionType } from '../../types';
import { QuestionFeedback } from './QuestionFeedback';
import { CameraCapture } from './CameraCapture';

type Props = {
  question: SubjectiveQuestionType;
  index: number;
  testId: string;
  userId: string;
  sessionId: string;
  readOnly?: boolean;
  initialFeedback?: SubjectiveFeedback;
};

export function SubjectiveQuestion({ question, index, testId, userId, sessionId, readOnly, initialFeedback }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SubjectiveFeedback | null>(initialFeedback ?? null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!imageBase64 || loading || feedback) return;

    setLoading(true);
    try {
      const result = await evaluateSubjective(userId, sessionId, testId, question.id, imageBase64);
      setFeedback(result);
    } catch {
      // surface error via re-enable
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Question {index + 1} · {question.type === 'short_answer' ? 'Short Answer' : question.type === 'long_answer' ? 'Long Answer' : 'Written'} ({question.marks} marks)
          {question.cognitive_level && (
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              question.cognitive_level === 'LOTS' ? 'bg-green-100 text-green-700' :
              question.cognitive_level === 'MOTS' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>{question.cognitive_level}</span>
          )}
        </p>
      </div>
      <p className="mb-4 font-medium text-gray-800">{question.text}</p>

      {readOnly && !feedback && (
        <p className="text-xs text-gray-400 italic">Not answered</p>
      )}

      {!readOnly && !feedback && (
        <>
          <CameraCapture
            previewUrl={preview}
            onCapture={(base64, url) => { setImageBase64(base64); setPreview(url); }}
            onClear={() => { setPreview(null); setImageBase64(null); }}
          />
          {preview && (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="mt-3 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Grading your work…' : 'Submit for Grading'}
            </button>
          )}
        </>
      )}

      {feedback && (
        <>
          {preview && (
            <img
              src={preview}
              alt="Your working"
              className="w-full rounded-lg border border-gray-200 object-contain max-h-48 mb-3"
            />
          )}
          <QuestionFeedback feedback={feedback} />
        </>
      )}
    </div>
  );
}
