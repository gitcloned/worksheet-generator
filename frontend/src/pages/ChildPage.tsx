import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getChildren, getChildAssignments, getUnassignedTests, createAssignment } from '../api/client';
import { DataGrid } from '../components/DataGrid';
import type { AssignmentSummary, TestMode } from '../types';

type TestSummary = {
  id: string;
  topic: string;
  board?: string;
  grade?: string;
  book?: string;
  total_marks?: number;
  duration_minutes?: number;
  question_count?: number;
  created_at: string;
};

type Child = {
  id: string;
  child_email: string;
  child_id: string | null;
  display_name: string | null;
};

export function ChildPage() {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();

  const [child, setChild] = useState<Child | null>(null);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [unassigned, setUnassigned] = useState<TestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign modal state
  const [assignTestId, setAssignTestId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<TestMode>('practice');
  const [timeMultiplier, setTimeMultiplier] = useState<1.0 | 1.5 | 2.0>(1.0);
  const [assigning, setAssigning] = useState(false);
  const [assignmentLink, setAssignmentLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Copy-link toast state (for Resend)
  const [resendCopied, setResendCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    Promise.all([getChildren(), getChildAssignments(childId), getUnassignedTests(childId)])
      .then(([children, asgns, tests]) => {
        const c = children.find((ch: Child) => ch.id === childId);
        setChild(c ?? null);
        setAssignments(asgns);
        setUnassigned(tests);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [childId]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTestId || !child || !childId) return;
    setAssigning(true);
    try {
      const result = await createAssignment(assignTestId, child.child_email, assignMode, timeMultiplier);
      setAssignmentLink(result.link);
      const [asgns, tests] = await Promise.all([getChildAssignments(childId), getUnassignedTests(childId)]);
      setAssignments(asgns);
      setUnassigned(tests);
    } catch {
      // keep modal open
    } finally {
      setAssigning(false);
    }
  }

  function copyAssignmentLink() {
    if (!assignmentLink) return;
    navigator.clipboard.writeText(assignmentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resendLink(token: string) {
    const link = `${window.location.origin}/take-test/${token}`;
    navigator.clipboard.writeText(link);
    setResendCopied(token);
    setTimeout(() => setResendCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!child) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-3">
          <p className="text-gray-500">Child not found.</p>
          <button onClick={() => navigate('/tests')} className="text-sm text-brand-600 hover:underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const childName = child.display_name ?? child.child_email;
  const assignTestDetails = unassigned.find((t) => t.id === assignTestId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate('/tests')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          ← My Children
        </button>
        <span className="text-gray-300">|</span>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xs">
            {childName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-gray-800">{childName}</span>
          {child.display_name && (
            <span className="text-xs text-gray-400">{child.child_email}</span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Assigned tests */}
        <section>
          <h2 className="font-semibold text-gray-900 mb-3">Assigned Tests</h2>
          <DataGrid<AssignmentSummary>
            data={assignments}
            emptyMessage="No tests assigned yet. Assign one from the list below."
            columns={[
              {
                header: 'Test',
                render: (row) => (
                  <div>
                    <p className="font-medium text-gray-800 line-clamp-1">{row.topic}</p>
                    <p className="text-xs text-gray-400">
                      {[row.board, row.grade && `Grade ${row.grade}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ),
              },
              {
                header: 'Mode',
                render: (row) => (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${row.mode === 'exam' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                    {row.mode}
                  </span>
                ),
              },
              {
                header: 'Status',
                render: (row) => (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    row.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                    row.status === 'started' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {row.status}
                  </span>
                ),
              },
              {
                header: 'Score',
                render: (row) => row.score ? (
                  <span className="font-semibold text-gray-800">{row.score.earned_marks}/{row.score.total_marks || row.total_marks || '?'}</span>
                ) : <span className="text-gray-400">—</span>,
              },
              {
                header: 'Date',
                render: (row) => (
                  <span className="text-xs text-gray-400">{new Date(row.created_at).toLocaleDateString()}</span>
                ),
              },
              {
                header: 'Actions',
                render: (row) => (
                  <div className="flex items-center gap-3">
                    {row.score && (
                      <button
                        onClick={() => navigate(`/assignment/${row.token}/review`)}
                        className="text-xs text-brand-600 font-medium hover:underline"
                      >
                        View Results
                      </button>
                    )}
                    <button
                      onClick={() => resendLink(row.token)}
                      className="text-xs text-gray-500 hover:text-gray-800 font-medium"
                    >
                      {resendCopied === row.token ? 'Copied!' : 'Resend Link'}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </section>

        {/* Unassigned tests */}
        <section>
          <h2 className="font-semibold text-gray-900 mb-3">Available to Assign</h2>
          <DataGrid<TestSummary>
            data={unassigned}
            emptyMessage="All your tests have been assigned to this child."
            columns={[
              {
                header: 'Test',
                render: (row) => (
                  <div>
                    <p className="font-medium text-gray-800 line-clamp-1">{row.topic}</p>
                    <p className="text-xs text-gray-400">
                      {[row.board, row.grade && `Grade ${row.grade}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ),
              },
              {
                header: 'Questions',
                render: (row) => <span className="text-gray-700">{row.question_count ?? '—'}</span>,
              },
              {
                header: 'Marks',
                render: (row) => <span className="text-gray-700">{row.total_marks ?? '—'}</span>,
              },
              {
                header: 'Created',
                render: (row) => (
                  <span className="text-xs text-gray-400">{new Date(row.created_at).toLocaleDateString()}</span>
                ),
              },
              {
                header: '',
                render: (row) => (
                  <button
                    onClick={() => {
                      setAssignTestId(row.id);
                      setAssignMode('practice');
                      setTimeMultiplier(1.0);
                      setAssignmentLink(null);
                    }}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    Assign
                  </button>
                ),
              },
            ]}
          />
        </section>
      </main>

      {/* Assign modal */}
      {assignTestId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            {!assignmentLink ? (
              <>
                <h3 className="font-semibold text-gray-900 mb-1">Assign to {childName}</h3>
                {assignTestDetails && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-1">{assignTestDetails.topic}</p>
                )}
                <form onSubmit={handleAssign} className="space-y-4">
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
                      {assignMode === 'practice' ? 'Instant feedback after each question' : 'Timed · feedback shown only after submitting'}
                    </p>
                  </div>

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
                      {assignTestDetails?.duration_minutes && (
                        <p className="mt-1 text-xs text-gray-400">
                          Effective duration: {Math.round(assignTestDetails.duration_minutes * timeMultiplier)} min
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={assigning}
                      className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                    >
                      {assigning ? 'Creating link…' : 'Create Assignment Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignTestId(null)}
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
                <p className="text-sm text-gray-500 mb-4">Share this link with {childName}. It expires in 30 days.</p>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                  <span className="flex-1 text-xs text-gray-700 font-mono truncate">{assignmentLink}</span>
                  <button
                    onClick={copyAssignmentLink}
                    className="flex-shrink-0 text-xs text-brand-600 font-semibold hover:text-brand-700"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={() => setAssignTestId(null)}
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
