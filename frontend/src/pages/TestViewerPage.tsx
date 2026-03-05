import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTest, createAssignment, getChildren } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { MCQQuestion } from '../components/PracticeTest/MCQQuestion';
import { SubjectiveQuestion } from '../components/PracticeTest/SubjectiveQuestion';
import type { PracticeTest, Question, TestMode } from '../types';

type Child = {
  id: string;
  child_email: string;
  child_id: string | null;
  display_name: string | null;
};

export function TestViewerPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const [test, setTest] = useState<PracticeTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assignment modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignmentLink, setAssignmentLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [assignMode, setAssignMode] = useState<TestMode>('practice');
  const [timeMultiplier, setTimeMultiplier] = useState<1.0 | 1.5 | 2.0>(1.0);

  useEffect(() => {
    if (!testId) return;
    getTest(testId)
      .then((t) => setTest(t as PracticeTest))
      .catch(() => setError('Test not found.'))
      .finally(() => setLoading(false));
  }, [testId]);

  async function openAssignModal() {
    setShowAssignModal(true);
    setAssignmentLink(null);
    setAssignMode('practice');
    setTimeMultiplier(1.0);
    if (profile?.role === 'parent') {
      try {
        const kids = await getChildren();
        setChildren(kids);
      } catch {
        setChildren([]);
      }
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    const email = selectedEmail || customEmail.trim();
    if (!email || !testId) return;

    setAssigning(true);
    try {
      const result = await createAssignment(testId, email, assignMode, timeMultiplier);
      setAssignmentLink(result.link);
    } catch {
      // keep modal open
    } finally {
      setAssigning(false);
    }
  }

  async function copyLink() {
    if (!assignmentLink) return;
    await navigator.clipboard.writeText(assignmentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const userId = user?.id ?? '';
  // For read-only viewer we use a stable session placeholder
  const sessionId = `viewer:${testId}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">{error ?? 'Test not found.'}</p>
          <button
            onClick={() => navigate('/tests')}
            className="mt-4 text-sm text-brand-600 hover:underline"
          >
            Back to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate('/tests')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          <span>←</span> My Tests
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-sm font-medium text-gray-700 flex-1 truncate">{test.topic}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/tests/${testId}/take`)}
            className="rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
          >
            Take This Test
          </button>
          <button
            onClick={openAssignModal}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Assign to Child
          </button>
        </div>
      </header>

      {/* Test info bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex flex-wrap gap-3">
        {test.board && (
          <span className="text-xs text-gray-500">Board: <span className="font-medium text-gray-700">{test.board}</span></span>
        )}
        {test.grade && (
          <span className="text-xs text-gray-500">Grade: <span className="font-medium text-gray-700">{test.grade}</span></span>
        )}
        {test.book && (
          <span className="text-xs text-gray-500">Book: <span className="font-medium text-gray-700">{test.book}</span></span>
        )}
        {test.total_marks && (
          <span className="text-xs text-gray-500">Total Marks: <span className="font-medium text-gray-700">{test.total_marks}</span></span>
        )}
        {test.duration_minutes && (
          <span className="text-xs text-gray-500">Duration: <span className="font-medium text-gray-700">{test.duration_minutes} min</span></span>
        )}
      </div>

      {/* Questions — read-only */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide">
          {test.questions.length} questions · Read-only view
        </p>
        {test.questions.map((q: Question, i: number) => {
          if (q.type === 'mcq') {
            return (
              <MCQQuestion
                key={q.id}
                question={q}
                index={i}
                testId={test.test_id}
                userId={userId}
                sessionId={sessionId}
                readOnly
              />
            );
          }
          return (
            <SubjectiveQuestion
              key={q.id}
              question={q}
              index={i}
              testId={test.test_id}
              userId={userId}
              sessionId={sessionId}
              readOnly
            />
          );
        })}
      </main>

      {/* Assignment modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            {!assignmentLink ? (
              <>
                <h3 className="font-semibold text-gray-900 mb-4">Assign Test</h3>
                <form onSubmit={handleAssign} className="space-y-4">
                  {children.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">Select a child</p>
                      {children.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmail(c.child_email);
                            setCustomEmail('');
                          }}
                          className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                            selectedEmail === c.child_email
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {c.display_name ?? c.child_email}
                          {c.display_name && (
                            <span className="ml-1 text-xs text-gray-400">({c.child_email})</span>
                          )}
                        </button>
                      ))}
                      <p className="text-xs text-gray-400 text-center">or enter an email</p>
                    </div>
                  )}
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => {
                      setCustomEmail(e.target.value);
                      setSelectedEmail('');
                    }}
                    placeholder={children.length > 0 ? 'Or enter email directly' : "Child's email address"}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />

                  {/* Mode toggle */}
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-2">Test mode</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['practice', 'exam'] as TestMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setAssignMode(m)}
                          className={`rounded-lg border py-2 text-sm font-medium transition-colors capitalize ${
                            assignMode === m
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {m === 'practice' ? 'Practice' : 'Exam'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {assignMode === 'practice' ? 'Instant feedback after each question' : 'Timed, feedback shown only after submitting'}
                    </p>
                  </div>

                  {/* Time multiplier (exam only) */}
                  {assignMode === 'exam' && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-2">Time accommodation</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([1.0, 1.5, 2.0] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setTimeMultiplier(m)}
                            className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                              timeMultiplier === m
                                ? 'border-brand-500 bg-brand-50 text-brand-700'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {m}×
                          </button>
                        ))}
                      </div>
                      {test.duration_minutes && (
                        <p className="mt-1 text-xs text-gray-400">
                          Effective duration: {Math.round(test.duration_minutes * timeMultiplier)} min
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={assigning || (!selectedEmail && !customEmail.trim())}
                      className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                    >
                      {assigning ? 'Creating link…' : 'Create Assignment Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAssignModal(false)}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-gray-900 mb-2">Assignment Created</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Share this link with the student. It expires in 30 days.
                </p>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                  <span className="flex-1 text-xs text-gray-700 font-mono truncate">{assignmentLink}</span>
                  <button
                    onClick={copyLink}
                    className="flex-shrink-0 text-xs text-brand-600 font-semibold hover:text-brand-700"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
