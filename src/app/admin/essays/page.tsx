'use client';
// /admin/essays — every essay the marker has read (SPEC-ESSAY-MARKING.md, 12 Sep
// 2026): status, student, kind, the band range, the habits, and — for a HELD
// essay — why the reads disagreed. Each row opens the student's own report page
// (Adrian's cookie may open any). Read-only in E1.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

type Row = {
  id: string; created_at: string; student_name: string | null; airtable_student_id: string; subject: string; essay_kind: string;
  question: string | null; word_count: number | null; status: string; marked_at: string | null;
  bands: { total?: { min: number; max: number; out_of: number }; content?: { band: number }; language?: { band: number }; task_fulfilment?: { band: number } } | null;
  code_counts: Record<string, number> | null; held_reason: string | null; source: string;
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(mins)) return '—';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const TONE: Record<string, string> = {
  marked: 'bg-emerald-50 text-emerald-800',
  held: 'bg-amber-50 text-amber-800',
  failed: 'bg-rose-50 text-rose-700',
  marking: 'bg-sky-50 text-sky-800',
  queued: 'bg-gray-100 text-gray-700',
};

export default function AdminEssaysPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/essays?limit=200');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRows(j.essays ?? []);
      setErr('');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <form className="bg-white rounded-2xl shadow p-6 w-full max-w-sm space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <h1 className="font-bold text-navy">Essays</h1>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password" className="w-full border rounded-xl px-3 py-2" />
          <button className="w-full bg-navy text-white rounded-xl py-2 font-semibold">Enter</button>
        </form>
      </div>
    );
  }

  const held = (rows ?? []).filter(r => r.status === 'held');
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold text-navy">✍️ Essays</h1>
          <div className="text-sm text-gray-500">{rows ? `${rows.length} read` : '…'}{held.length ? ` · ${held.length} held` : ''} · <button onClick={load} className="underline">refresh</button></div>
        </div>
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <p className="text-[12px] text-gray-500">
          A band is a range, never a number. HELD = the reads disagreed by more than a band; open it, read both, and tell
          the student yourself for now (an Agree/Override door comes with E2).
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Essay</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Bands</th><th className="px-3 py-2">Habits</th></tr>
            </thead>
            <tbody>
              {(rows ?? []).map(r => {
                const b = r.bands;
                const bandTxt = b?.total ? `${b.total.min}–${b.total.max}/${b.total.out_of} · C${b.content?.band ?? b.task_fulfilment?.band ?? '?'} L${b.language?.band ?? '?'}` : '';
                const habits = r.code_counts ? Object.entries(r.code_counts).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ×${n}`).join(', ') : '';
                return (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{ago(r.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.source === 'calibration' ? <span className="text-violet-700">calib · {r.student_name ?? r.airtable_student_id}</span> : (r.student_name ?? r.airtable_student_id)}</td>
                    <td className="px-3 py-2 max-w-[22rem]">
                      <Link href={`/app/languages/${r.id}`} className="text-navy font-semibold hover:underline">{(r.question ?? r.essay_kind.replace(/_/g, ' ')).slice(0, 80)}</Link>
                      <div className="text-[11px] text-gray-400">{r.essay_kind.replace(/_/g, ' ')} · {r.word_count ?? '—'} words</div>
                      {r.status === 'held' && r.held_reason && <div className="text-[12px] text-amber-800 mt-0.5">{r.held_reason}</div>}
                    </td>
                    <td className="px-3 py-2"><span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${TONE[r.status] ?? ''}`}>{r.status}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[12px]">{bandTxt}</td>
                    <td className="px-3 py-2 text-[12px] text-gray-600">{habits}</td>
                  </tr>
                );
              })}
              {rows && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No essays yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
