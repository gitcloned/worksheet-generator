import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageBubble } from './MessageBubble';

export function Chat() {
  const { messages, isLoading, sessionReady, initSession, sendMessage, userId, sessionId } =
    useChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initSession();
  }, [initSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || !sessionReady || isLoading) return;
    setInput('');
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Show typing indicator when loading and the last assistant message is still empty
  const lastMsg = messages[messages.length - 1];
  const showTyping =
    isLoading &&
    (!lastMsg ||
      lastMsg.role === 'user' ||
      (lastMsg.role === 'assistant' &&
        !lastMsg.content &&
        !lastMsg.artifact &&
        !lastMsg.research &&
        !lastMsg.blueprint));

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">
          AI
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-sm">AI Practice Tutor</p>
          <p className="text-xs text-green-500">Online</p>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-2">
            <p className="text-4xl">📚</p>
            <p className="font-medium text-gray-600">Ready to practice!</p>
            <p className="text-sm max-w-xs">
              Tell me what you'd like to study — subject, board, grade, and book.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            userId={userId}
            sessionId={sessionId}
            sendMessage={sendMessage}
            isLoading={isLoading}
          />
        ))}

        {showTyping && <TypingIndicator />}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Grade 7 CBSE, Simple Equations, NCERT Maths…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            disabled={!sessionReady}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !sessionReady || isLoading}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 transition-colors shadow-sm"
          >
            <SendIcon />
          </button>
        </div>
      </footer>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold">
        AI
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center">
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}
