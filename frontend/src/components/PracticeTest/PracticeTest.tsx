import type { PracticeTest as PracticeTestType } from '../../types';
import { MCQQuestion } from './MCQQuestion';
import { SubjectiveQuestion } from './SubjectiveQuestion';

type Props = {
  test: PracticeTestType;
  userId: string;
  sessionId: string;
};

export function PracticeTest({ test, userId, sessionId }: Props) {
  return (
    <div className="mt-2 w-full max-w-xl">
      {/* Header */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-5 py-4 mb-4">
        <h2 className="font-bold text-brand-700 text-base">{test.topic}</h2>
        <p className="text-xs text-brand-600 mt-0.5">
          {test.board} · {test.grade} · {test.book}
        </p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <p className="text-xs text-gray-500">{test.questions.length} questions</p>
          {test.total_marks && (
            <p className="text-xs text-gray-500">{test.total_marks} marks</p>
          )}
          {test.duration_minutes && (
            <p className="text-xs text-gray-500">{test.duration_minutes} min</p>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {test.questions.map((q, i) =>
          q.type === 'mcq' ? (
            <MCQQuestion
              key={q.id}
              question={q}
              index={i}
              testId={test.test_id}
              userId={userId}
              sessionId={sessionId}
            />
          ) : (
            <SubjectiveQuestion
              key={q.id}
              question={q}
              index={i}
              testId={test.test_id}
              userId={userId}
              sessionId={sessionId}
            />
          ),
        )}
      </div>
    </div>
  );
}
