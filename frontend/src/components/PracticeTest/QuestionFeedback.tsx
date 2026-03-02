import type { MCQFeedback, SubjectiveFeedback } from '../../types';

type Props = {
  feedback: MCQFeedback | SubjectiveFeedback;
};

function isMCQ(f: MCQFeedback | SubjectiveFeedback): f is MCQFeedback {
  return 'correct' in f;
}

export function QuestionFeedback({ feedback }: Props) {
  if (isMCQ(feedback)) {
    return (
      <div
        className={`mt-3 rounded-lg p-3 text-sm ${
          feedback.correct
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}
      >
        <p className="font-semibold">
          {feedback.correct ? '✓ Correct!' : `✗ Incorrect — correct answer: ${feedback.correct_option}`}
        </p>
        {feedback.explanation && (
          <p className="mt-1 text-xs opacity-90">{feedback.explanation}</p>
        )}
      </div>
    );
  }

  // Subjective feedback
  const pct = feedback.max_score > 0 ? (feedback.score / feedback.max_score) * 100 : 0;
  const color = pct >= 75 ? 'green' : pct >= 40 ? 'yellow' : 'red';
  const colorMap = {
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className={`mt-3 rounded-lg p-3 text-sm border ${colorMap[color]}`}>
      <p className="font-semibold">
        Score: {feedback.score} / {feedback.max_score}
      </p>
      <p className="mt-1">{feedback.explanation}</p>

      {feedback.step_feedback.length > 0 && (
        <ul className="mt-2 space-y-1 list-disc list-inside text-xs opacity-90">
          {feedback.step_feedback.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      )}

      {feedback.next_step_hint && (
        <p className="mt-2 text-xs font-medium italic">{feedback.next_step_hint}</p>
      )}
    </div>
  );
}
