import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAssignmentReview } from '../api/client';
import { QuestionFeedback } from '../components/PracticeTest/QuestionFeedback';
import type { AssignmentReview, MCQQuestion, SubjectiveQuestion, MCQFeedback, SubjectiveFeedback } from '../types';

export function AssignmentReviewPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AssignmentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!token) return;
    getAssignmentReview(token)
      .then(setData)
      .catch(() => setError('Assignment not found or you are not authorized to view it.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-3">
          <p className="text-gray-500">{error || 'Not found.'}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-brand-600 hover:underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const questions = data.test.questions;

  function renderCard(i: number) {
    const q = questions[i];
    const answer = data!.answers[q.id];
    const fb = answer?.feedback_json ?? null;

    if (q.type === 'mcq') {
      const mcqFb = fb as MCQFeedback | null;
      const selected = answer?.selected_option ?? null;

      function optStyle(optId: string) {
        const base = 'flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left text-sm cursor-default';
        if (!mcqFb) {
          if (optId === selected) return `${base} border-brand-400 bg-brand-50 text-brand-700`;
          return `${base} border-gray-100 text-gray-400`;
        }
        if (optId === mcqFb.correct_option) return `${base} border-green-400 bg-green-50 text-green-800`;
        if (optId === selected && !mcqFb.correct) return `${base} border-red-400 bg-red-50 text-red-800`;
        return `${base} border-gray-100 text-gray-300`;
      }

      const mcqQ = q as MCQQuestion;
      return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Question {i + 1} · MCQ
          </p>
          <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{mcqQ.text}</p>
          <div className="space-y-2.5">
            {mcqQ.options.map((opt) => (
              <div key={opt.id} className={optStyle(opt.id)}>
                <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
                  {opt.id}
                </span>
                <span>{opt.text}</span>
              </div>
            ))}
          </div>
          {mcqFb && <QuestionFeedback feedback={mcqFb} />}
          {!mcqFb && !selected && <p className="mt-3 text-xs text-gray-400">This question was skipped.</p>}
        </div>
      );
    }

    const subjQ = q as SubjectiveQuestion;
    const subjFb = fb as SubjectiveFeedback | null;
    const typeLabel =
      q.type === 'short_answer' ? 'Short Answer' : q.type === 'long_answer' ? 'Long Answer' : 'Written';

    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Question {i + 1} · {typeLabel} ({subjQ.marks} marks)
        </p>
        <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{subjQ.text}</p>
        {subjFb ? (
          <QuestionFeedback feedback={subjFb} />
        ) : (
          <p className="text-sm text-gray-400">This question was skipped or not graded.</p>
        )}
      </div>
    );
  }

  const answeredCount = Object.keys(data.answers).length;
  const totalMarks = data.test.total_marks;
  const earnedMarks = Object.values(data.answers).reduce((acc, a) => {
    const fb = a.feedback_json;
    if (!fb) return acc;
    if ('correct' in fb) return acc + (fb.correct ? 1 : 0);
    if ('score' in fb) return acc + fb.score;
    return acc;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          ← Back
        </button>
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">{data.test.topic}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{data.assigned_to_email}</span>
          {totalMarks && (
            <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              {earnedMarks}/{totalMarks} marks
            </span>
          )}
          <span className="text-xs text-gray-400">Q {currentIndex + 1}/{questions.length}</span>
        </div>
      </header>

      {/* Score summary bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex flex-wrap gap-3 text-xs text-gray-500">
        <span>Status: <span className={`font-semibold ${data.status === 'completed' ? 'text-blue-600' : 'text-yellow-600'}`}>{data.status}</span></span>
        <span>Answered: <span className="font-semibold text-gray-700">{answeredCount}/{questions.length}</span></span>
        <span className={`px-2 py-0.5 rounded-full capitalize font-semibold ${data.mode === 'exam' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
          {data.mode}
        </span>
      </div>

      <div className="flex-1 pb-24 overflow-hidden">
        <div className="overflow-hidden w-full">
          <div
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {questions.map((_, i) => (
              <div key={i} className="w-full flex-shrink-0 min-w-full px-4 py-5">
                {renderCard(i)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between shadow-lg">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all active:scale-[0.98]"
        >
          ← Prev
        </button>
        <div className="flex gap-1.5 items-center">
          {questions.map((q, i) => {
            const isAnswered = !!data.answers[q.id];
            const isCurrent = i === currentIndex;
            return (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`rounded-full transition-all ${
                  isCurrent ? 'w-2.5 h-2.5 bg-brand-600' :
                  isAnswered ? 'w-2 h-2 bg-brand-400' :
                  'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                }`}
              />
            );
          })}
        </div>
        <button
          onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
          disabled={currentIndex === questions.length - 1}
          className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all active:scale-[0.98]"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
