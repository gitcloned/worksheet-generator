import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getAssignment,
  getLastAttempt,
  evaluateMCQForAssignment,
  evaluateSubjectiveForAssignment,
  completeAssignment,
  retakeAssignment,
} from '../api/client';
import type {
  MCQFeedback,
  MCQQuestion,
  SubjectiveFeedback,
  SubjectiveQuestion,
  Question,
  PracticeTest,
  LastAttempt,
  PendingAnswer,
  PendingMCQAnswer,
  PendingSubjectiveAnswer,
  TestMode,
} from '../types';
import { QuestionFeedback } from '../components/PracticeTest/QuestionFeedback';

// ── Types ──────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'error' | 'intro' | 'taking' | 'evaluating' | 'submitted' | 'reviewing';

type AssignmentWithMode = {
  assignment_id: string;
  test: PracticeTest;
  status: string;
  mode: TestMode;
  time_multiplier: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ── Main page ──────────────────────────────────────────────────────────────

export function TakeTestPage() {
  const { token } = useParams<{ token: string }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [assignment, setAssignment] = useState<AssignmentWithMode | null>(null);
  const [lastAttempt, setLastAttempt] = useState<LastAttempt | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbacks, setFeedbacks] = useState<Record<string, MCQFeedback | SubjectiveFeedback>>({});
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, PendingAnswer>>({});

  // Timer
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dialogs
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);
  const [timeUpCountdown, setTimeUpCountdown] = useState(5);

  // Evaluating progress
  const [gradedCount, setGradedCount] = useState(0);

  // Ref so timer can call latest handleSubmit
  const submitRef = useRef<() => void>(() => {});

  // ── Load assignment ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await getAssignment(token);
        setAssignment(data as AssignmentWithMode);
        // Try to fetch last attempt
        try {
          const attempt = await getLastAttempt(token);
          if (attempt) setLastAttempt(attempt);
        } catch {
          // no previous attempt — fine
        }
        setPhase('intro');
      } catch {
        setErrorMsg('This assignment link is invalid or has expired.');
        setPhase('error');
      }
    })();
  }, [token]);

  // ── Retake ───────────────────────────────────────────────────────────────

  async function handleRetake() {
    if (!token) return;
    setPhase('loading');
    try {
      await retakeAssignment(token);
    } catch {
      setPhase('intro');
      return;
    }
    setLastAttempt(null);
    setFeedbacks({});
    setPendingAnswers({});
    setCurrentIndex(0);
    setGradedCount(0);
    setElapsedSeconds(0);
    setRemainingSeconds(null);
    setPhase('taking');
  }

  // ── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'taking' || !assignment) return;

    if (assignment.mode === 'exam') {
      const totalSecs = Math.floor((assignment.test.duration_minutes ?? 60) * assignment.time_multiplier * 60);
      setRemainingSeconds(totalSecs);
    }

    timerRef.current = setInterval(() => {
      if (assignment.mode === 'exam') {
        setRemainingSeconds((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setShowTimeUpModal(true);
            return 0;
          }
          return prev - 1;
        });
      } else {
        setElapsedSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TimeUpModal auto-submit countdown ────────────────────────────────────

  useEffect(() => {
    if (!showTimeUpModal) return;
    setTimeUpCountdown(5);
    const id = setInterval(() => {
      setTimeUpCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          submitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [showTimeUpModal]);

  // ── Submit handler ───────────────────────────────────────────────────────

  async function handleSubmit() {
    setShowSubmitConfirm(false);
    setShowTimeUpModal(false);
    if (timerRef.current) clearInterval(timerRef.current);

    if (!assignment) return;

    if (assignment.mode === 'exam') {
      setPhase('evaluating');
      setGradedCount(0);

      const questions = assignment.test.questions;
      const evalPromises = questions.map(async (q) => {
        const pending = pendingAnswers[q.id];
        if (!pending) {
          setGradedCount((prev) => prev + 1);
          return;
        }
        try {
          let feedback: MCQFeedback | SubjectiveFeedback;
          if (q.type === 'mcq' && pending.type === 'mcq') {
            feedback = await evaluateMCQForAssignment(
              token!,
              assignment.assignment_id,
              assignment.test.test_id,
              q.id,
              (pending as PendingMCQAnswer).selectedOption,
            );
          } else if (pending.type === 'subjective') {
            feedback = await evaluateSubjectiveForAssignment(
              token!,
              assignment.assignment_id,
              assignment.test.test_id,
              q.id,
              (pending as PendingSubjectiveAnswer).imageBase64,
            );
          } else {
            setGradedCount((prev) => prev + 1);
            return;
          }
          setFeedbacks((prev) => ({ ...prev, [q.id]: feedback }));
        } catch {
          // skip failed eval
        } finally {
          setGradedCount((prev) => prev + 1);
        }
      });

      await Promise.allSettled(evalPromises);
      await completeAssignment(token!).catch(() => {});
      setPhase('submitted');
    } else {
      setPhase('submitted');
    }
  }

  submitRef.current = handleSubmit;

  // ── Computed values ───────────────────────────────────────────────────────

  const questions = assignment?.test.questions ?? [];
  const answeredCount =
    assignment?.mode === 'exam'
      ? Object.keys(pendingAnswers).length
      : Object.keys(feedbacks).length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (phase === 'error' || !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
          <p className="text-4xl mb-4">🔗</p>
          <h2 className="font-semibold text-gray-900 mb-2">Link not found</h2>
          <p className="text-sm text-gray-500">{errorMsg || 'This assignment link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <IntroScreen
        assignment={assignment}
        lastAttempt={lastAttempt}
        onStart={() => setPhase('taking')}
        onRetake={assignment.status === 'completed' ? handleRetake : undefined}
      />
    );
  }

  if (phase === 'evaluating') {
    return <EvaluatingScreen gradedCount={gradedCount} total={questions.length} />;
  }

  if (phase === 'submitted') {
    return (
      <ResultsScreen
        test={assignment.test}
        feedbacks={feedbacks}
        onReview={() => setPhase('reviewing')}
      />
    );
  }

  if (phase === 'reviewing') {
    return (
      <ReviewScreen
        test={assignment.test}
        feedbacks={feedbacks}
        pendingAnswers={pendingAnswers}
        onBack={() => setPhase('submitted')}
      />
    );
  }

  // ── Taking phase ──────────────────────────────────────────────────────────

  const isExam = assignment.mode === 'exam';

  function renderCard(q: Question, i: number) {
    if (isExam) {
      if (q.type === 'mcq') {
        return (
          <ExamMCQCard
            question={q as MCQQuestion}
            index={i}
            selectedOption={(pendingAnswers[q.id] as PendingMCQAnswer | undefined)?.selectedOption ?? null}
            onSelect={(opt) =>
              setPendingAnswers((prev) => ({ ...prev, [q.id]: { type: 'mcq', selectedOption: opt } }))
            }
          />
        );
      }
      return (
        <ExamSubjectiveCard
          question={q as SubjectiveQuestion}
          index={i}
          pending={pendingAnswers[q.id] as PendingSubjectiveAnswer | undefined}
          onCapture={(base64, url) =>
            setPendingAnswers((prev) => ({
              ...prev,
              [q.id]: { type: 'subjective', imageBase64: base64, previewUrl: url },
            }))
          }
          onClear={() =>
            setPendingAnswers((prev) => {
              const next = { ...prev };
              delete next[q.id];
              return next;
            })
          }
        />
      );
    }

    // Practice mode
    const asgn = assignment!;
    const isLast = i === questions.length - 1;
    const onAdvance = isLast ? () => setShowSubmitConfirm(true) : () => setCurrentIndex(i + 1);
    if (q.type === 'mcq') {
      return (
        <PracticeMCQCard
          question={q as MCQQuestion}
          index={i}
          token={token!}
          assignmentId={asgn.assignment_id}
          testId={asgn.test.test_id}
          feedback={feedbacks[q.id] as MCQFeedback | undefined}
          onFeedback={(fb) => setFeedbacks((prev) => ({ ...prev, [q.id]: fb }))}
          onAdvance={onAdvance}
          isLastQuestion={isLast}
        />
      );
    }
    return (
      <PracticeSubjectiveCard
        question={q as SubjectiveQuestion}
        index={i}
        token={token!}
        assignmentId={asgn.assignment_id}
        testId={asgn.test.test_id}
        feedback={feedbacks[q.id] as SubjectiveFeedback | undefined}
        onFeedback={(fb) => setFeedbacks((prev) => ({ ...prev, [q.id]: fb }))}
        onAdvance={onAdvance}
        isLastQuestion={isLast}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TestHeader
        mode={assignment.mode}
        currentIndex={currentIndex}
        total={questions.length}
        remainingSeconds={isExam ? remainingSeconds ?? 0 : undefined}
        elapsedSeconds={!isExam ? elapsedSeconds : undefined}
      />

      <div className="flex-1 pb-36">
        <QuestionCarousel currentIndex={currentIndex}>
          {questions.map((q, i) => renderCard(q, i))}
        </QuestionCarousel>
      </div>

      <CarouselNav
        currentIndex={currentIndex}
        total={questions.length}
        questionIds={questions.map((q) => q.id)}
        answeredIds={isExam ? Object.keys(pendingAnswers) : Object.keys(feedbacks)}
        onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        onNext={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
      />

      <SubmitBar
        answeredCount={answeredCount}
        total={questions.length}
        mode={assignment.mode}
        onSubmit={() => setShowSubmitConfirm(true)}
      />

      {showSubmitConfirm && (
        <SubmitConfirmDialog
          unansweredCount={questions.length - answeredCount}
          onConfirm={handleSubmit}
          onCancel={() => setShowSubmitConfirm(false)}
          isExam={isExam}
        />
      )}

      {showTimeUpModal && (
        <TimeUpModal countdown={timeUpCountdown} />
      )}
    </div>
  );
}

// ── IntroScreen ────────────────────────────────────────────────────────────

function IntroScreen({
  assignment,
  lastAttempt,
  onStart,
  onRetake,
}: {
  assignment: AssignmentWithMode;
  lastAttempt: LastAttempt | null;
  onStart: () => void;
  onRetake?: () => void;
}) {
  const { test, mode, time_multiplier } = assignment;
  const effectiveDuration = test.duration_minutes
    ? Math.round(test.duration_minutes * time_multiplier)
    : null;
  const hasSubjective = test.questions.some((q) => q.type !== 'mcq');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6 space-y-5">
        {/* Topic */}
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{test.topic}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {[test.board, test.grade && `Grade ${test.grade}`].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {test.total_marks && (
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-400">Total Marks</p>
              <p className="font-semibold text-gray-800">{test.total_marks}</p>
            </div>
          )}
          {effectiveDuration && (
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-400">Duration</p>
              <p className="font-semibold text-gray-800">
                {effectiveDuration} min
                {time_multiplier !== 1.0 && (
                  <span className="ml-1 text-xs text-gray-400">({time_multiplier}×)</span>
                )}
              </p>
            </div>
          )}
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-400">Questions</p>
            <p className="font-semibold text-gray-800">{test.questions.length}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-400">Mode</p>
            <p className={`font-semibold capitalize ${mode === 'exam' ? 'text-orange-600' : 'text-green-600'}`}>
              {mode}
            </p>
          </div>
        </div>

        {/* Last attempt */}
        {lastAttempt && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <p className="text-xs text-blue-600 font-medium">Previous attempt</p>
            <p className="text-sm text-blue-800">
              {lastAttempt.earned_marks}/{lastAttempt.total_marks || '?'} marks · {lastAttempt.attempted} answered
            </p>
          </div>
        )}

        {/* Exam mode info */}
        {mode === 'exam' && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-700">
            Exam mode: you'll see feedback only after submitting.
            {effectiveDuration && ` Timer starts when you click Start.`}
          </div>
        )}

        {/* Subjective warning */}
        {hasSubjective && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-700">
            This test has written questions. You'll need to take a photo of your work.
          </div>
        )}

        {onRetake ? (
          <button
            onClick={onRetake}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.98] transition-all"
          >
            Retake {mode === 'exam' ? 'Exam' : 'Practice'}
          </button>
        ) : (
          <button
            onClick={onStart}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.98] transition-all"
          >
            Start {mode === 'exam' ? 'Exam' : 'Practice'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── TestHeader ─────────────────────────────────────────────────────────────

function TestHeader({
  mode,
  currentIndex,
  total,
  remainingSeconds,
  elapsedSeconds,
}: {
  mode: TestMode;
  currentIndex: number;
  total: number;
  remainingSeconds?: number;
  elapsedSeconds?: number;
}) {
  const isLow = mode === 'exam' && remainingSeconds !== undefined && remainingSeconds < 120;

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
      <span className="text-sm text-gray-500 font-medium">
        Q {currentIndex + 1} / {total}
      </span>

      {mode === 'exam' && remainingSeconds !== undefined && (
        <span
          className={`font-mono text-sm tabular-nums font-semibold ${
            isLow ? 'text-red-600 animate-pulse' : 'text-gray-700'
          }`}
        >
          {formatTime(remainingSeconds)}
        </span>
      )}

      {mode === 'practice' && elapsedSeconds !== undefined && (
        <span className="font-mono text-xs tabular-nums text-gray-400">
          {formatTime(elapsedSeconds)}
        </span>
      )}

      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
          mode === 'exam'
            ? 'bg-orange-100 text-orange-700'
            : 'bg-green-100 text-green-700'
        }`}
      >
        {mode}
      </span>
    </header>
  );
}

// ── QuestionCarousel ───────────────────────────────────────────────────────

function QuestionCarousel({
  currentIndex,
  children,
}: {
  currentIndex: number;
  children: React.ReactNode[];
}) {
  return (
    <div className="overflow-hidden w-full">
      <div
        className="flex transition-transform duration-300 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {children.map((child, i) => (
          <div key={i} className="w-full flex-shrink-0 min-w-full px-4 py-5">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ExamMCQCard ────────────────────────────────────────────────────────────

function ExamMCQCard({
  question,
  index,
  selectedOption,
  onSelect,
}: {
  question: MCQQuestion;
  index: number;
  selectedOption: string | null;
  onSelect: (opt: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · MCQ
      </p>
      <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{question.text}</p>
      <div className="space-y-2.5">
        {question.options.map((opt) => {
          const isSelected = selectedOption === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className={`flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors active:scale-[0.98] ${
                isSelected
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
              }`}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
                {opt.id}
              </span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── PracticeMCQCard ────────────────────────────────────────────────────────

function PracticeMCQCard({
  question,
  index,
  token,
  assignmentId,
  testId,
  feedback,
  onFeedback,
  onAdvance,
  isLastQuestion,
}: {
  question: MCQQuestion;
  index: number;
  token: string;
  assignmentId: string;
  testId: string;
  feedback?: MCQFeedback;
  onFeedback: (fb: MCQFeedback) => void;
  onAdvance: () => void;
  isLastQuestion: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(feedback?.selected_option ?? null);
  const [loading, setLoading] = useState(false);

  async function handleSelect(optId: string) {
    if (feedback || loading) return;
    setSelected(optId);
    setLoading(true);
    try {
      const result = await evaluateMCQForAssignment(token, assignmentId, testId, question.id, optId);
      onFeedback(result);
    } catch {
      // allow retry
    } finally {
      setLoading(false);
    }
  }

  function optStyle(optId: string) {
    const base = 'flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors active:scale-[0.98]';
    if (!feedback) {
      if (selected === optId) return `${base} border-brand-500 bg-brand-50 text-brand-700`;
      return `${base} border-gray-200 hover:border-brand-300 hover:bg-gray-50 cursor-pointer`;
    }
    if (optId === feedback.correct_option) return `${base} border-green-400 bg-green-50 text-green-800`;
    if (optId === selected && !feedback.correct) return `${base} border-red-400 bg-red-50 text-red-800`;
    return `${base} border-gray-100 text-gray-400`;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · MCQ
      </p>
      <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{question.text}</p>
      <div className="space-y-2.5">
        {question.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            disabled={!!feedback || loading}
            className={optStyle(opt.id)}
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
              {opt.id}
            </span>
            <span>{opt.text}</span>
          </button>
        ))}
      </div>
      {loading && <p className="mt-3 text-xs text-gray-400 animate-pulse">Checking your answer…</p>}
      {feedback && (
        <>
          <QuestionFeedback feedback={feedback} />
          <button
            onClick={onAdvance}
            className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.98] transition-all"
          >
            {isLastQuestion ? 'Finish →' : 'Next Question →'}
          </button>
        </>
      )}
    </div>
  );
}

// ── ExamSubjectiveCard ─────────────────────────────────────────────────────

function ExamSubjectiveCard({
  question,
  index,
  pending,
  onCapture,
  onClear,
}: {
  question: SubjectiveQuestion;
  index: number;
  pending?: PendingSubjectiveAnswer;
  onCapture: (base64: string, url: string) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      onCapture(result.split(',')[1], result);
    };
    reader.readAsDataURL(file);
  }

  const typeLabel = question.type === 'short_answer' ? 'Short Answer' : question.type === 'long_answer' ? 'Long Answer' : 'Written';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · {typeLabel} ({question.marks} marks)
      </p>
      <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{question.text}</p>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {!pending ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-5 py-5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center active:scale-[0.98]"
        >
          <span className="text-xl">📷</span> Take a photo of your working
        </button>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <img src={pending.previewUrl} alt="Your working" className="w-full rounded-lg border border-gray-200 object-contain max-h-64" />
            <button
              onClick={onClear}
              className="absolute top-2 right-2 rounded-full bg-white border border-gray-200 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-500 shadow-sm"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-center text-gray-400">Photo saved — will be graded on submit</p>
          <button
            onClick={() => { onClear(); if (fileRef.current) fileRef.current.value = ''; }}
            className="w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Retake photo
          </button>
        </div>
      )}
    </div>
  );
}

// ── PracticeSubjectiveCard ─────────────────────────────────────────────────

function PracticeSubjectiveCard({
  question,
  index,
  token,
  assignmentId,
  testId,
  feedback,
  onFeedback,
  onAdvance,
  isLastQuestion,
}: {
  question: SubjectiveQuestion;
  index: number;
  token: string;
  assignmentId: string;
  testId: string;
  feedback?: SubjectiveFeedback;
  onFeedback: (fb: SubjectiveFeedback) => void;
  onAdvance: () => void;
  isLastQuestion: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreview(result);
      setImageBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!imageBase64 || loading || feedback) return;
    setLoading(true);
    try {
      const result = await evaluateSubjectiveForAssignment(token, assignmentId, testId, question.id, imageBase64);
      onFeedback(result);
    } catch {
      // allow retry
    } finally {
      setLoading(false);
    }
  }

  const typeLabel = question.type === 'short_answer' ? 'Short Answer' : question.type === 'long_answer' ? 'Long Answer' : 'Written';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · {typeLabel} ({question.marks} marks)
      </p>
      <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{question.text}</p>

      {!feedback && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          {!preview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-5 py-5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center active:scale-[0.98]"
            >
              <span className="text-xl">📷</span> Take a photo of your working
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <img src={preview} alt="Your working" className="w-full rounded-lg border border-gray-200 object-contain max-h-64" />
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
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors active:scale-[0.98]"
              >
                {loading ? 'Grading your work…' : 'Submit for Grading'}
              </button>
            </div>
          )}
        </>
      )}

      {feedback && (
        <>
          {preview && <img src={preview} alt="Your working" className="w-full rounded-lg border border-gray-200 object-contain max-h-48 mb-3" />}
          <QuestionFeedback feedback={feedback} />
          <button
            onClick={onAdvance}
            className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.98] transition-all"
          >
            {isLastQuestion ? 'Finish →' : 'Next Question →'}
          </button>
        </>
      )}
    </div>
  );
}

// ── CarouselNav ────────────────────────────────────────────────────────────

function CarouselNav({
  currentIndex,
  total,
  questionIds,
  answeredIds,
  onPrev,
  onNext,
}: {
  currentIndex: number;
  total: number;
  questionIds: string[];
  answeredIds: string[];
  onPrev: () => void;
  onNext: () => void;
}) {
  const answeredSet = new Set(answeredIds);
  const maxDots = 9;
  const start = total > maxDots ? Math.max(0, Math.min(currentIndex - Math.floor(maxDots / 2), total - maxDots)) : 0;
  const visibleIds = questionIds.slice(start, start + maxDots);

  return (
    <div className="fixed bottom-20 left-0 right-0 flex items-center justify-between px-4 pointer-events-none">
      <button
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="pointer-events-auto bg-white border border-gray-200 shadow-md rounded-full w-11 h-11 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 active:scale-95 transition-all"
      >
        ←
      </button>
      <div className="flex gap-1.5 items-center">
        {visibleIds.map((qid, i) => {
          const absIndex = start + i;
          const isCurrent = absIndex === currentIndex;
          const isAnswered = answeredSet.has(qid);
          return (
            <div
              key={qid}
              className={`rounded-full transition-all ${
                isCurrent
                  ? 'w-2.5 h-2.5 bg-brand-600'
                  : isAnswered
                  ? 'w-2 h-2 bg-brand-400'
                  : 'w-2 h-2 bg-gray-200'
              }`}
            />
          );
        })}
      </div>
      <button
        onClick={onNext}
        disabled={currentIndex === total - 1}
        className="pointer-events-auto bg-white border border-gray-200 shadow-md rounded-full w-11 h-11 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 active:scale-95 transition-all"
      >
        →
      </button>
    </div>
  );
}

// ── SubmitBar ──────────────────────────────────────────────────────────────

function SubmitBar({
  answeredCount,
  total,
  mode,
  onSubmit,
}: {
  answeredCount: number;
  total: number;
  mode: TestMode;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between shadow-lg">
      <p className="text-sm text-gray-500">
        <span className="font-semibold text-gray-800">{answeredCount}</span> / {total} answered
      </p>
      <button
        onClick={onSubmit}
        className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition-colors active:scale-[0.98] ${
          mode === 'exam'
            ? 'bg-orange-500 hover:bg-orange-600'
            : 'bg-brand-600 hover:bg-brand-700'
        }`}
      >
        {mode === 'exam' ? 'Submit Exam' : 'Finish'}
      </button>
    </div>
  );
}

// ── SubmitConfirmDialog ────────────────────────────────────────────────────

function SubmitConfirmDialog({
  unansweredCount,
  onConfirm,
  onCancel,
  isExam,
}: {
  unansweredCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isExam: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">
          {isExam ? 'Submit exam?' : 'Finish practice?'}
        </h3>
        {unansweredCount > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} unanswered.
          </p>
        )}
        <p className="text-sm text-gray-500">
          {isExam
            ? "Your answers will be graded and you'll see results."
            : "You'll see a summary of your performance."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors ${
              isExam ? 'bg-orange-500 hover:bg-orange-600' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {isExam ? 'Submit Exam' : 'Finish Practice'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TimeUpModal ────────────────────────────────────────────────────────────

function TimeUpModal({ countdown }: { countdown: number }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-8 text-center space-y-3">
        <p className="text-4xl">⏰</p>
        <h3 className="font-bold text-gray-900 text-lg">Time's up!</h3>
        <p className="text-sm text-gray-500">Submitting your exam in</p>
        <p className="text-5xl font-bold text-orange-500 tabular-nums">{countdown}</p>
      </div>
    </div>
  );
}

// ── EvaluatingScreen ───────────────────────────────────────────────────────

function EvaluatingScreen({ gradedCount, total }: { gradedCount: number; total: number }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-brand-400 border-t-transparent animate-spin" />
      <p className="font-semibold text-gray-800">Grading your work…</p>
      <p className="text-sm text-gray-500">
        {gradedCount} / {total} questions
      </p>
    </div>
  );
}

// ── ResultsScreen ──────────────────────────────────────────────────────────

function ResultsScreen({
  test,
  feedbacks,
  onReview,
}: {
  test: PracticeTest;
  feedbacks: Record<string, MCQFeedback | SubjectiveFeedback>;
  onReview?: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const questions = test.questions;
  const mcqQs = questions.filter((q) => q.type === 'mcq');
  const subjQs = questions.filter((q) => q.type !== 'mcq') as SubjectiveQuestion[];

  const correctMCQs = mcqQs.filter((q) => (feedbacks[q.id] as MCQFeedback)?.correct).length;
  const earnedSubj = subjQs.reduce((acc, q) => acc + ((feedbacks[q.id] as SubjectiveFeedback)?.score ?? 0), 0);
  const maxSubj = subjQs.reduce((acc, q) => acc + ((feedbacks[q.id] as SubjectiveFeedback)?.max_score ?? q.marks ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="text-center py-4">
          <p className="text-4xl mb-2">🎉</p>
          <h2 className="font-bold text-gray-900 text-xl">Test Complete!</h2>
          <p className="text-gray-500 text-sm mt-1">{test.topic}</p>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-2 gap-3">
          {mcqQs.length > 0 && (
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">MCQ Score</p>
              <p className="text-3xl font-bold text-gray-900">{correctMCQs}<span className="text-lg text-gray-400">/{mcqQs.length}</span></p>
              <p className="text-xs text-gray-400 mt-0.5">correct</p>
            </div>
          )}
          {subjQs.length > 0 && (
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Written Score</p>
              <p className="text-3xl font-bold text-gray-900">{earnedSubj}<span className="text-lg text-gray-400">/{maxSubj}</span></p>
              <p className="text-xs text-gray-400 mt-0.5">marks</p>
            </div>
          )}
        </div>

        {onReview && (
          <button
            onClick={onReview}
            className="w-full rounded-xl border border-brand-600 py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 active:scale-[0.98] transition-all"
          >
            Review Answers →
          </button>
        )}

        {/* Per-question breakdown */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Question breakdown</p>
          {questions.map((q, i) => {
            const fb = feedbacks[q.id];
            const isExpanded = expandedId === q.id;
            const isMCQ = q.type === 'mcq';
            const mcqFb = fb as MCQFeedback | undefined;
            const subjFb = fb as SubjectiveFeedback | undefined;

            return (
              <div
                key={q.id}
                className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : q.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-xs text-gray-400 font-medium w-6 flex-shrink-0">Q{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-700 line-clamp-1">{q.text}</span>
                  {!fb ? (
                    <span className="text-xs text-gray-400 flex-shrink-0">Skipped</span>
                  ) : isMCQ ? (
                    <span className={`text-xs font-semibold flex-shrink-0 ${mcqFb?.correct ? 'text-green-600' : 'text-red-500'}`}>
                      {mcqFb?.correct ? '✓' : '✗'}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-blue-600 flex-shrink-0">
                      {subjFb?.score}/{subjFb?.max_score}
                    </span>
                  )}
                  <span className="text-gray-300 text-xs flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </button>
                {isExpanded && fb && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <QuestionFeedback feedback={fb} />
                  </div>
                )}
                {isExpanded && !fb && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <p className="text-sm text-gray-400 py-2">This question was not answered.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── ReviewScreen ────────────────────────────────────────────────────────────

function ReviewScreen({
  test,
  feedbacks,
  pendingAnswers,
  onBack,
}: {
  test: PracticeTest;
  feedbacks: Record<string, MCQFeedback | SubjectiveFeedback>;
  pendingAnswers: Record<string, PendingAnswer>;
  onBack: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const questions = test.questions;

  function renderReviewCard(q: Question, i: number) {
    const fb = feedbacks[q.id];
    if (q.type === 'mcq') {
      const mcqFb = fb as MCQFeedback | undefined;
      return (
        <ReviewMCQCard
          question={q as MCQQuestion}
          index={i}
          selectedOption={mcqFb?.selected_option ?? (pendingAnswers[q.id] as PendingMCQAnswer | undefined)?.selectedOption ?? null}
          feedback={mcqFb}
        />
      );
    }
    return (
      <ReviewSubjectiveCard
        question={q as SubjectiveQuestion}
        index={i}
        previewUrl={(pendingAnswers[q.id] as PendingSubjectiveAnswer | undefined)?.previewUrl}
        feedback={fb as SubjectiveFeedback | undefined}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1">
          ← Results
        </button>
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">{test.topic}</span>
        <span className="text-xs text-gray-400">Q {currentIndex + 1}/{questions.length}</span>
      </header>

      <div className="flex-1 pb-24">
        <QuestionCarousel currentIndex={currentIndex}>
          {questions.map((q, i) => renderReviewCard(q, i))}
        </QuestionCarousel>
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
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`rounded-full transition-all ${i === currentIndex ? 'w-2.5 h-2.5 bg-brand-600' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'}`}
            />
          ))}
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

// ── ReviewMCQCard ───────────────────────────────────────────────────────────

function ReviewMCQCard({
  question,
  index,
  selectedOption,
  feedback,
}: {
  question: MCQQuestion;
  index: number;
  selectedOption: string | null;
  feedback?: MCQFeedback;
}) {
  function optStyle(optId: string) {
    const base = 'flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left text-sm cursor-default';
    if (!feedback) {
      if (optId === selectedOption) return `${base} border-brand-400 bg-brand-50 text-brand-700`;
      return `${base} border-gray-100 text-gray-400`;
    }
    if (optId === feedback.correct_option) return `${base} border-green-400 bg-green-50 text-green-800`;
    if (optId === selectedOption && !feedback.correct) return `${base} border-red-400 bg-red-50 text-red-800`;
    return `${base} border-gray-100 text-gray-300`;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · MCQ · Review
      </p>
      <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{question.text}</p>
      <div className="space-y-2.5">
        {question.options.map((opt) => (
          <div key={opt.id} className={optStyle(opt.id)}>
            <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
              {opt.id}
            </span>
            <span>{opt.text}</span>
          </div>
        ))}
      </div>
      {feedback && <QuestionFeedback feedback={feedback} />}
      {!feedback && !selectedOption && (
        <p className="mt-3 text-xs text-gray-400">This question was skipped.</p>
      )}
    </div>
  );
}

// ── ReviewSubjectiveCard ────────────────────────────────────────────────────

function ReviewSubjectiveCard({
  question,
  index,
  previewUrl,
  feedback,
}: {
  question: SubjectiveQuestion;
  index: number;
  previewUrl?: string;
  feedback?: SubjectiveFeedback;
}) {
  const typeLabel =
    question.type === 'short_answer' ? 'Short Answer' : question.type === 'long_answer' ? 'Long Answer' : 'Written';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm min-h-[280px]">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Question {index + 1} · {typeLabel} · Review ({question.marks} marks)
      </p>
      <p className="mb-5 font-medium text-gray-800 text-base leading-relaxed">{question.text}</p>
      {previewUrl && (
        <img src={previewUrl} alt="Your working" className="w-full rounded-lg border border-gray-200 object-contain max-h-48 mb-3" />
      )}
      {feedback ? (
        <QuestionFeedback feedback={feedback} />
      ) : (
        <p className="text-sm text-gray-400">
          {previewUrl ? 'Answer was not graded.' : 'This question was skipped.'}
        </p>
      )}
    </div>
  );
}
