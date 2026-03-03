import { useCallback, useRef, useState } from 'react';
import { createSession, streamChat } from '../api/client';
import type { ChatMessage, SSEEvent } from '../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getOrCreateIdentity(): { userId: string; sessionId: string } {
  let userId = localStorage.getItem('userId');
  let sessionId = localStorage.getItem('sessionId');

  if (!userId) {
    userId = generateId();
    localStorage.setItem('userId', userId);
  }
  if (!sessionId) {
    sessionId = generateId();
    localStorage.setItem('sessionId', sessionId);
  }

  return { userId, sessionId };
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const identityRef = useRef(getOrCreateIdentity());
  const abortRef = useRef<AbortController | null>(null);

  const initSession = useCallback(async () => {
    const { userId, sessionId } = identityRef.current;
    try {
      await createSession(userId, sessionId);
      setSessionReady(true);
    } catch {
      console.error('Failed to init session');
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isLoading) return;

      const { userId, sessionId } = identityRef.current;

      const userMsg: ChatMessage = { id: generateId(), role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const assistantId = generateId();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      abortRef.current = streamChat(userId, sessionId, text, (event: SSEEvent) => {
        if (event.type === 'text_delta') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + event.content } : m,
            ),
          );
        } else if (event.type === 'research') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, research: event.data } : m)),
          );
        } else if (event.type === 'blueprint') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, blueprint: event.data } : m)),
          );
        } else if (event.type === 'artifact') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, artifact: event.test } : m)),
          );
        } else if (event.type === 'done') {
          setIsLoading(false);
        } else if (event.type === 'error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || 'Something went wrong. Please try again.' }
                : m,
            ),
          );
          setIsLoading(false);
        }
      });
    },
    [isLoading],
  );

  const { userId, sessionId } = identityRef.current;

  return { messages, isLoading, sessionReady, initSession, sendMessage, userId, sessionId };
}
