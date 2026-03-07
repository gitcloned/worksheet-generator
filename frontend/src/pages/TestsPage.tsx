import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTests, getChildren, addChild, getStudentAssignments } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { DataGrid } from '../components/DataGrid';
import type { TestSummary } from '../components/TestCard';
import type { StudentAssignment } from '../types';

type Child = {
  id: string;
  child_email: string;
  child_id: string | null;
  display_name: string | null;
  created_at: string;
};

export function TestsPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [tests, setTests] = useState<TestSummary[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignment[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [childEmail, setChildEmail] = useState('');
  const [addingChild, setAddingChild] = useState(false);
  const [testSearch, setTestSearch] = useState('');

  const filteredTests = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) =>
      [t.topic, t.board, t.grade, t.book].some((v) => v?.toLowerCase().includes(q))
    );
  }, [tests, testSearch]);

  const isParent = profile?.role === 'parent';
  const isStudent = profile?.role === 'student';

  useEffect(() => {
    if (isParent) {
      Promise.all([getTests(), getChildren()])
        .then(([t, c]) => { setTests(t); setChildren(c); })
        .catch(console.error)
        .finally(() => setLoadingTests(false));
    } else if (isStudent) {
      getStudentAssignments()
        .then(setStudentAssignments)
        .catch(console.error)
        .finally(() => setLoadingTests(false));
    } else {
      getTests()
        .then(setTests)
        .catch(console.error)
        .finally(() => setLoadingTests(false));
    }
  }, [isParent, isStudent]);

  async function handleAddChild(e: React.FormEvent) {
    e.preventDefault();
    if (!childEmail.trim()) return;
    setAddingChild(true);
    try {
      await addChild(childEmail.trim());
      const updated = await getChildren();
      setChildren(updated);
      setChildEmail('');
      setShowAddChild(false);
    } catch {
      // keep form open on error
    } finally {
      setAddingChild(false);
    }
  }

  const displayName = profile?.display_name ?? user?.email ?? 'User';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">
          AI
        </div>
        <span className="font-semibold text-gray-800 text-sm flex-1">AI Practice</span>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
            {initials}
          </div>
          <button
            onClick={signOut}
            className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {loadingTests ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
          </div>
        ) : isStudent ? (
          /* Student view — My Assignments */
          <section>
            <h2 className="font-semibold text-gray-900 mb-4">My Assignments</h2>
            <DataGrid<StudentAssignment>
              data={studentAssignments}
              emptyMessage="No assignments yet. Ask your teacher to assign you a test."
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
                  header: 'From',
                  render: (row) => (
                    <span className="text-sm text-gray-600">{row.assigned_by_name ?? '—'}</span>
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
                  header: 'Score',
                  render: (row) => row.score ? (
                    <span className="font-medium text-gray-800">{row.score.earned_marks}/{row.score.total_marks || row.total_marks || '?'}</span>
                  ) : <span className="text-gray-400">—</span>,
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
                  header: '',
                  render: (row) => (
                    <a
                      href={`/take-test/${row.token}`}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                    >
                      {row.status === 'completed' ? 'Retake' : 'Start'}
                    </a>
                  ),
                },
              ]}
            />
          </section>
        ) : (
          <>
            {/* Tests section (parent / no-role) */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                  <input
                    type="text"
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    placeholder="Search by topic, board, grade, or book…"
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <button
                  onClick={() => navigate('/tests/new')}
                  className="flex-shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm"
                >
                  + Create New Test
                </button>
              </div>

              {tests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                  <p className="text-3xl mb-2">📄</p>
                  <p className="font-medium text-gray-700">No tests yet</p>
                  <p className="text-sm text-gray-500 mt-1">Create your first test to get started!</p>
                </div>
              ) : (
                <DataGrid<TestSummary>
                  data={filteredTests}
                  emptyMessage={testSearch ? `No tests match "${testSearch}"` : 'No tests yet.'}
                  columns={[
                    {
                      header: 'Topic',
                      render: (t) => (
                        <div>
                          <p className="font-medium text-gray-800 line-clamp-1">{t.topic ?? 'Untitled'}</p>
                          {t.book && <p className="text-xs text-gray-400 line-clamp-1">{t.book}</p>}
                        </div>
                      ),
                    },
                    {
                      header: 'Board / Grade',
                      render: (t) => (
                        <div className="flex flex-wrap gap-1">
                          {t.board && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{t.board}</span>
                          )}
                          {t.grade && (
                            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">Gr {t.grade}</span>
                          )}
                        </div>
                      ),
                    },
                    {
                      header: 'Questions',
                      render: (t) => (
                        <span className="text-sm text-gray-600">
                          {t.question_count != null ? `${t.question_count}Q` : '—'}
                          {t.duration_minutes != null ? ` · ${t.duration_minutes}m` : ''}
                        </span>
                      ),
                    },
                    {
                      header: 'Created',
                      render: (t) => (
                        <span className="text-sm text-gray-400">{relativeDate(t.created_at)}</span>
                      ),
                    },
                    {
                      header: '',
                      render: (t) => (
                        <button
                          onClick={() => navigate(`/tests/${t.id}`)}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                        >
                          View →
                        </button>
                      ),
                    },
                  ]}
                />
              )}
            </section>

            {/* Children section (parents only) */}
            {isParent && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">My Children</h2>
                  <button
                    onClick={() => setShowAddChild(true)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    + Add Child
                  </button>
                </div>

                {showAddChild && (
                  <form
                    onSubmit={handleAddChild}
                    className="mb-4 rounded-xl border border-gray-200 bg-white p-4 flex gap-2"
                  >
                    <input
                      type="email"
                      value={childEmail}
                      onChange={(e) => setChildEmail(e.target.value)}
                      placeholder="Child's email address"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={addingChild || !childEmail.trim()}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                    >
                      {addingChild ? 'Adding…' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddChild(false)}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </form>
                )}

                {children.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">No children added yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => navigate(`/children/${child.id}`)}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-brand-400 hover:shadow-md transition-all text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">
                          {(child.display_name ?? child.child_email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {child.display_name ?? child.child_email}
                          </p>
                          {child.display_name && (
                            <p className="text-xs text-gray-400 truncate">{child.child_email}</p>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${child.child_id ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                            {child.child_id ? 'Joined' : 'Pending'}
                          </span>
                        </div>
                        <span className="text-gray-300 text-sm">→</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
