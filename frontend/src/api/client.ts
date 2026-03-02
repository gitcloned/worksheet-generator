import type { MCQFeedback, SubjectiveFeedback, SSEEvent } from '../types';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api';

// ── Session ───────────────────────────────────────────────────────────────

export async function createSession(userId: string, sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
): AbortController {
  const ctrl = new AbortController();

  (async () => {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`${BASE}/evaluate/mcq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`${BASE}/evaluate/subjective`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
