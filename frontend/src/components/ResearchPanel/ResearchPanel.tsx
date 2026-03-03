import { useState } from 'react';
import type { BookResearch } from '../../types';

type Difficulty = 'easy' | 'mixed' | 'hard';
type Duration = 15 | 30 | 60;

type Props = {
  research: BookResearch;
  sendMessage: (text: string) => void;
  isLoading: boolean;
};

export function ResearchPanel({ research, sendMessage, isLoading }: Props) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(
    new Set(research.topics.map((t) => t.name)),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [duration, setDuration] = useState<Duration>(30);
  const [submitted, setSubmitted] = useState(false);

  function toggleTopic(name: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (selectedTopics.size === 0 || isLoading) return;
    const topics = Array.from(selectedTopics).join(', ');
    const msg = `Topics: ${topics} | Difficulty: ${difficulty} | Duration: ${duration}`;
    setSubmitted(true);
    sendMessage(msg);
  }

  if (submitted) {
    return (
      <div className="mt-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
        <span className="text-base">✓</span>
        <span>
          <span className="font-semibold">{selectedTopics.size} topic{selectedTopics.size !== 1 ? 's' : ''}</span>
          {' · '}
          <span className="capitalize">{difficulty}</span>
          {' · '}
          {duration} min
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 bg-brand-50 px-5 py-3">
        <p className="font-semibold text-brand-700 text-sm">📚 Found in {research.book}</p>
        <p className="text-xs text-brand-500 mt-0.5">{research.grade} · {research.board}</p>
      </div>

      {/* Topics */}
      <div className="px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Select topics to include
        </p>
        <div className="space-y-2.5">
          {research.topics.map((topic) => {
            const checked = selectedTopics.has(topic.name);
            return (
              <label
                key={topic.id}
                className="flex items-start gap-3 cursor-pointer group"
              >
                <div className="mt-0.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTopic(topic.name)}
                    className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                  />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${checked ? 'text-gray-800' : 'text-gray-400'}`}>
                    {topic.name}
                  </p>
                  {topic.subtopics.length > 0 && (
                    <p className={`text-xs mt-0.5 leading-relaxed ${checked ? 'text-gray-500' : 'text-gray-300'}`}>
                      {topic.subtopics.slice(0, 4).join(' · ')}
                      {topic.subtopics.length > 4 && ` +${topic.subtopics.length - 4} more`}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Difficulty */}
      <div className="px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Difficulty
        </p>
        <div className="flex gap-2">
          {(['easy', 'mixed', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors border ${
                difficulty === d
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'
              }`}
            >
              {d === 'easy' ? '🟢 Easy' : d === 'mixed' ? '🟡 Mixed' : '🔴 Hard'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {difficulty === 'easy' && 'Mostly recall questions (60% LOTS · 30% MOTS · 10% HOTS)'}
          {difficulty === 'mixed' && 'Balanced across all levels (30% LOTS · 40% MOTS · 30% HOTS)'}
          {difficulty === 'hard' && 'Mostly application & analysis (10% LOTS · 30% MOTS · 60% HOTS)'}
        </p>
      </div>

      <div className="border-t border-gray-100" />

      {/* Duration */}
      <div className="px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Duration
        </p>
        <div className="flex gap-2">
          {([15, 30, 60] as Duration[]).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors border ${
                duration === d
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'
              }`}
            >
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="border-t border-gray-100 px-5 py-4">
        {selectedTopics.size === 0 && (
          <p className="text-xs text-red-500 mb-2">Select at least one topic to continue.</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={selectedTopics.size === 0 || isLoading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          Design My Paper
          <span className="text-base">→</span>
        </button>
      </div>
    </div>
  );
}
