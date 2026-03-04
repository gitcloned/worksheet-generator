import type { MCQFeedback, SubjectiveFeedback, SSEEvent } from '../types';
import { supabase } from '../lib/supabase';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

// ── Session ───────────────────────────────────────────────────────────────

export async function createSession(userId: string, sessionId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/session/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: userId, session_id: sessionId }),
  });
  if (!res.ok) throw new Error('Failed to create session');
}

// ── Chat (SSE streaming) ──────────────────────────────────────────────────

export function streamChat(
  userId: string,
  sessionId: string,
  message: string,
  onEvent: (event: SSEEvent) => void,
  accessToken?: string,
): AbortController {
  const ctrl = new AbortController();

  (async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: userId, session_id: sessionId, message }),
      signal: ctrl.signal,
    });

    if (!res.ok || !res.body) {
      onEvent({ type: 'error', message: 'Failed to connect to chat' });
      onEvent({ type: 'done' });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const chunk of lines) {
        const line = chunk.trim();
        if (!line.startsWith('data: ')) continue;
        try {
          const event: SSEEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // skip malformed event
        }
      }
    }
  })().catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent({ type: 'error', message: String(err) });
      onEvent({ type: 'done' });
    }
  });

  return ctrl;
}

// ── Evaluation ────────────────────────────────────────────────────────────

export async function evaluateMCQ(
  userId: string,
  sessionId: string,
  testId: string,
  questionId: string,
  selectedOption: string,
): Promise<MCQFeedback> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/evaluate/mcq`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
      test_id: testId,
      question_id: questionId,
      selected_option: selectedOption,
    }),
  });
  if (!res.ok) throw new Error('MCQ evaluation failed');
  return res.json();
}

export async function evaluateSubjective(
  userId: string,
  sessionId: string,
  testId: string,
  questionId: string,
  imageBase64: string,
): Promise<SubjectiveFeedback> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/evaluate/subjective`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      session_id: sessionId,
      test_id: testId,
      question_id: questionId,
      image_base64: imageBase64,
    }),
  });
  if (!res.ok) throw new Error('Subjective evaluation failed');
  return res.json();
}

// ── Test library ──────────────────────────────────────────────────────────

export async function getTests() {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/tests`, { headers });
  if (!res.ok) throw new Error('Failed to fetch tests');
  return res.json();
}

export async function getTest(testId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/tests/${testId}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch test');
  return res.json();
}

// ── Children ──────────────────────────────────────────────────────────────

export async function getChildren() {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/parent/children`, { headers });
  if (!res.ok) throw new Error('Failed to fetch children');
  return res.json();
}

export async function addChild(childEmail: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/parent/children`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ child_email: childEmail }),
  });
  if (!res.ok) throw new Error('Failed to add child');
  return res.json();
}

// ── Assignments ───────────────────────────────────────────────────────────

export async function createAssignment(testId: string, childEmail: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/assignments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ test_id: testId, child_email: childEmail }),
  });
  if (!res.ok) throw new Error('Failed to create assignment');
  return res.json();
}

export async function getAssignment(token: string) {
  const res = await fetch(`${BASE}/assignment/${token}`);
  if (!res.ok) throw new Error('Assignment not found or expired');
  return res.json();
}

export async function evaluateMCQForAssignment(
  token: string,
  assignmentId: string,
  testId: string,
  questionId: string,
  selectedOption: string,
): Promise<MCQFeedback> {
  const res = await fetch(`${BASE}/assignment/${token}/evaluate/mcq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assignment_id: assignmentId,
      test_id: testId,
      question_id: questionId,
      selected_option: selectedOption,
    }),
  });
  if (!res.ok) throw new Error('MCQ evaluation failed');
  return res.json();
}

export async function evaluateSubjectiveForAssignment(
  token: string,
  assignmentId: string,
  testId: string,
  questionId: string,
  imageBase64: string,
): Promise<SubjectiveFeedback> {
  const res = await fetch(`${BASE}/assignment/${token}/evaluate/subjective`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assignment_id: assignmentId,
      test_id: testId,
      question_id: questionId,
      image_base64: imageBase64,
    }),
  });
  if (!res.ok) throw new Error('Subjective evaluation failed');
  return res.json();
}
