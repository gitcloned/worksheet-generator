import { useRef, useState } from 'react';
import { evaluateSubjective } from '../../api/client';
import type { SubjectiveFeedback, SubjectiveQuestion as SubjectiveQuestionType } from '../../types';
import { QuestionFeedback } from './QuestionFeedback';

type Props = {
  question: SubjectiveQuestionType;
  index: number;
  testId: string;
  userId: string;
  sessionId: string;
};

export function SubjectiveQuestion({ question, index, testId, userId, sessionId }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SubjectiveFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreview(result);
      // Strip the data:image/...;base64, prefix
      setImageBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }

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

      {!feedback && (
        <>
          {/* Camera / file upload */}
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
              <CameraIcon />
              Take a photo of your working
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <img
                  src={preview}
                  alt="Your working"
                  className="w-full rounded-lg border border-gray-200 object-contain max-h-64"
                />
                {!feedback && (
                  <button
                    onClick={() => {
                      setPreview(null);
                      setImageBase64(null);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                    className="absolute top-2 right-2 rounded-full bg-white border border-gray-200 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-500 shadow-sm"
                  >
                    ✕
                  </button>
                )}
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

function CameraIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
