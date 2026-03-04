import { useNavigate } from 'react-router-dom';

export type TestSummary = {
  id: string;
  topic: string | null;
  board: string | null;
  grade: string | null;
  book: string | null;
  question_count: number | null;
  total_marks: number | null;
  duration_minutes: number | null;
  created_at: string;
};

export function TestCard({ test }: { test: TestSummary }) {
  const navigate = useNavigate();

  const date = new Date(test.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <button
      onClick={() => navigate(`/tests/${test.id}`)}
      className="text-left rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-brand-300 transition-all"
    >
      <p className="font-semibold text-gray-900 truncate">{test.topic ?? 'Untitled Test'}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {test.board && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{test.board}</span>
        )}
        {test.grade && (
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">Grade {test.grade}</span>
        )}
      </div>
      {test.book && (
        <p className="mt-2 text-xs text-gray-500 truncate">{test.book}</p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
        {test.question_count != null && (
          <span>{test.question_count} questions</span>
        )}
        {test.total_marks != null && (
          <span>{test.total_marks} marks</span>
        )}
        {test.duration_minutes != null && (
          <span>{test.duration_minutes} min</span>
        )}
        <span className="ml-auto">{date}</span>
      </div>
    </button>
  );
}
