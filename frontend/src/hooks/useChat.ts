import { useCallback, useEffect, useRef, useState } from 'react';
import { createSession, streamChat } from '../api/client';
import { supabase } from '../lib/supabase';
import type { ChatMessage, SSEEvent } from '../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useChat(externalUserId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [lastTestId, setLastTestId] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(generateId());
  const abortRef = useRef<AbortController | null>(null);

  // Use provided userId (from auth) or fall back to a local random one
  const userIdRef = useRef<string>(externalUserId ?? generateId());
  useEffect(() => {
    if (externalUserId) {
      userIdRef.current = externalUserId;
    }
  }, [externalUserId]);

  const initSession = useCallback(async () => {
    const userId = userIdRef.current;
    const sessionId = sessionIdRef.current;
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

      const userId = userIdRef.current;
      const sessionId = sessionIdRef.current;

      // Get current access token for auth header
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

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
          setLastTestId(event.test.test_id);
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
      }, accessToken);
    },
    [isLoading],
  );

  return {
    messages,
    isLoading,
    sessionReady,
    initSession,
    sendMessage,
    userId: userIdRef.current,
    sessionId: sessionIdRef.current,
    lastTestId,
  };
}
