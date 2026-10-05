'use client';

// 📱 Which app tabs students open (6 Oct 2026) — per tab, unique students and
// opens over 7 and 30 days, from GET /api/admin/portal-activity (`tabs`,
// lib/portal-activity.ts summariseTabViews over 'tab:view' rows). Opens = at
// most one per tab per device per 30 minutes. Read-only, fail-soft.
import { useEffect, useState } from 'react';
import type { TabSummaryRow } from '@/lib/portal-activity';

export default function TabsOpened() {
  const [rows, setRows] = useState<TabSummaryRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/admin/portal-activity')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { tabs?: TabSummaryRow[] }) => setRows(d.tabs ?? []))
      .catch(() => setFailed(true));
  }, []);

  return (
    <section id="tabs" className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-x-auto">
      <div className="px-4 py-3 text-sm font-medium text-neutral-800 border-b border-neutral-100">
        Tabs students open <span className="font-normal text-neutral-500">· real students only, not you or the demo student</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Tab</th>
            <th className="text-right px-3 py-2 font-medium">Students · 7 days</th>
            <th className="text-right px-3 py-2 font-medium">Opens · 7 days</th>
            <th className="text-right px-3 py-2 font-medium">Students · 30 days</th>
            <th className="text-right px-4 py-2 font-medium">Opens · 30 days</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.tab} className="border-t border-neutral-100">
              <td className="px-4 py-1.5 text-neutral-800">{r.label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.students7d}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{r.opens7d}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.students30d}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-neutral-500">{r.opens30d}</td>
            </tr>
          ))}
          {rows && rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-5 text-center text-neutral-400">No tab opened yet — rows appear as students use the app.</td></tr>
          )}
          {!rows && (
            <tr><td colSpan={5} className="px-4 py-5 text-center text-neutral-400">{failed ? 'Could not read the tabs.' : '…'}</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
