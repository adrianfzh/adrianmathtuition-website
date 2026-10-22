'use client';

// 🎯 Fix one — is it working? (SPEC-STUDENT-FIRST.md §Fix one, 22 Oct 2026).
// Last 14 days from GET /api/admin/fix-one-stats. Read-only, fail-soft.
import { useEffect, useState } from 'react';
import type { FixOneStats } from '@/lib/fix-one-stats';

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

export default function FixOneCard() {
  const [s, setS] = useState<FixOneStats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/admin/fix-one-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setS)
      .catch(() => setFailed(true));
  }, []);

  const rows: [string, number, string][] = s ? [
    ['Maths papers released', s.released, ''],
    ['Opened within 24 h', s.opened, pct(s.opened, s.released)],
    ['Fix one shown', s.shown, pct(s.shown, s.released)],
    ['Fix one answered', s.answered, pct(s.answered, s.shown)],
    ['Fix one right', s.correct, pct(s.correct, s.answered)],
    ['Practice Again asked within 24 h', s.requested, pct(s.requested, s.released)],
  ] : [];

  return (
    <section id="fix-one" className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-x-auto">
      <div className="px-4 py-3 text-sm font-medium text-neutral-800 border-b border-neutral-100">
        🎯 Fix one · last 14 days <span className="font-normal text-neutral-500">· real students only</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, n, p]) => (
            <tr key={label} className="border-t border-neutral-100 first:border-t-0">
              <td className="px-4 py-1.5 text-neutral-800">{label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{n}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-neutral-500">{p}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {failed && <p className="px-4 py-2 text-xs text-rose-700">Could not load.</p>}
      {!s && !failed && <p className="px-4 py-2 text-xs text-neutral-400">Loading…</p>}
      <p className="px-4 py-2 text-xs text-neutral-500 border-t border-neutral-100">
        Before Fix one: 6% of released papers got a Practice Again request within 24 h; 11% opened the Practice tab.
        Answered % is of shown; right % is of answered.
      </p>
    </section>
  );
}
