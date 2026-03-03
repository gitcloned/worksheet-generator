import { useState } from 'react';
import type { PaperBlueprint } from '../../types';

type Props = {
  blueprint: PaperBlueprint;
  sendMessage: (text: string) => void;
  isLoading: boolean;
};

const LEVEL_COLORS: Record<string, string> = {
  LOTS: 'bg-green-100 text-green-700',
  MOTS: 'bg-yellow-100 text-yellow-700',
  HOTS: 'bg-red-100 text-red-700',
};

const TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  short_answer: 'Short Answer',
  long_answer: 'Long Answer',
};

export function BlueprintCard({ blueprint, sendMessage, isLoading }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  function handleConfirm() {
    if (isLoading) return;
    setConfirmed(true);
    sendMessage('The blueprint looks good, please generate my test.');
  }

  if (confirmed) {
    return (
      <div className="mt-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
        <span className="text-base">✓</span>
        <span>Blueprint confirmed · Generating your test…</span>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 bg-brand-50 px-5 py-3">
        <p className="font-semibold text-brand-700 text-sm">📋 Paper Blueprint</p>
        <p className="text-xs text-brand-500 mt-0.5">
          {blueprint.duration_minutes} min · {blueprint.total_marks} marks · <span className="capitalize">{blueprint.difficulty}</span>
        </p>
      </div>

      {/* Sections table */}
      <div className="px-5 py-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="text-xs font-semibold uppercase tracking-wide text-gray-400 pb-2 font-normal">Section</th>
              <th className="text-xs font-semibold uppercase tracking-wide text-gray-400 pb-2 font-normal text-right">Qs</th>
              <th className="text-xs font-semibold uppercase tracking-wide text-gray-400 pb-2 font-normal text-right">Marks</th>
              <th className="text-xs font-semibold uppercase tracking-wide text-gray-400 pb-2 font-normal text-right">Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {blueprint.sections.map((section, i) => (
              <tr key={i} className="text-gray-700">
                <td className="py-2 font-medium">{TYPE_LABELS[section.type] ?? section.type}</td>
                <td className="py-2 text-right text-gray-500">{section.count}</td>
                <td className="py-2 text-right text-gray-500">{section.count * section.marks_each}</td>
                <td className="py-2 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_COLORS[section.cognitive_level] ?? 'bg-gray-100 text-gray-600'}`}>
                    {section.cognitive_level}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="pt-2 font-semibold text-gray-800">Total</td>
              <td className="pt-2 text-right font-semibold text-gray-800">
                {blueprint.sections.reduce((s, sec) => s + sec.count, 0)}
              </td>
              <td className="pt-2 text-right font-semibold text-gray-800">{blueprint.total_marks}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Topics covered */}
      {blueprint.selected_topics && blueprint.selected_topics.length > 0 && (
        <>
          <div className="border-t border-gray-100 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Topics covered</p>
            <div className="flex flex-wrap gap-1.5">
              {blueprint.selected_topics.map((t) => (
                <span key={t} className="rounded-full bg-brand-50 border border-brand-100 px-2.5 py-0.5 text-xs text-brand-600">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Confirm */}
      <div className="border-t border-gray-100 px-5 py-4">
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          Generate My Test
          <span className="text-base">→</span>
        </button>
      </div>
    </div>
  );
}
