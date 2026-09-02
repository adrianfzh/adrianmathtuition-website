'use client';
// /admin/schemes — the mark schemes Adrian attached at upload, kept so the next
// hand-in of the same paper is grounded on them without re-attaching
// (bot lib/scheme-store.js, table paper_schemes). Adrian, 2 Sep 2026: "add them"
// — until now a stored scheme was visible nowhere but a server log. Read-mostly:
// the one write is Delete, because a badly extracted scheme would otherwise
// ground every future run of that paper. Cookie session like /admin/calibration.
import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import SubjectChip from '@/components/SubjectChip';

type Row = {
  id: string; createdAt: string; updatedAt: string; subject: string;
  paperKey: string; paperName: string | null;
  questions: number; parts: number; marks: number; fingerprinted: number;
  sourceKind: string | null; originRunId: string | null; uses: number; lastUsedAt: string | null;
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function SchemesPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/admin/schemes');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows(d.rows);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function remove(row: Row) {
    if (!confirm(`Delete the stored scheme for "${row.paperName || row.paperKey}"?\n\nFuture hand-ins of this paper will fall back to the question bank or the rules alone.`)) return;
    setBusy(row.id);
    try {
      const r = await fetch(`/api/admin/schemes?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRows(prev => (prev || []).filter(x => x.id !== row.id));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">📘 Mark schemes</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">📘 Mark schemes</h1>
          <button onClick={load} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800" disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </header>

        <p className="text-sm text-neutral-600 px-1">
          A scheme you attach on <a href="/admin/mark-paper" className="underline">mark-paper</a> is read once and kept here. Every later hand-in of the
          same paper — from any student, whatever they typed as its name — is marked against it: matched first by the paper&apos;s name
          (your student&apos;s name stripped), then by the printed questions themselves. The 📘 chip on a triage or library row says which
          scheme a marking used. Delete a scheme if its extraction is wrong — it would otherwise ground every future run of that paper.
        </p>

        {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{err}</div>}

        {rows && rows.length === 0 && (
          <section className="bg-white rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            <div className="font-medium text-neutral-700">No schemes stored yet</div>
            <div className="mt-1">Attach one on mark-paper (the <b>Scheme:</b> picker beside Subject) and it will appear here after marking.</div>
          </section>
        )}

        {rows && rows.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2">Paper</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2 text-right">Questions</th>
                  <th className="px-3 py-2 text-right">Parts</th>
                  <th className="px-3 py-2 text-right">Marks</th>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">Matchable by</th>
                  <th className="px-3 py-2 text-right">Reused</th>
                  <th className="px-3 py-2">Stored</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-neutral-100 last:border-0 align-top">
                    <td className="px-4 py-2">
                      <div className="font-medium text-neutral-800">{r.paperName || r.paperKey}</div>
                      <div className="text-[11px] text-neutral-400">key: {r.paperKey}{r.originRunId ? <> · <a className="underline" href={`/admin/papers?run=${r.originRunId}`}>origin run</a></> : null}</div>
                    </td>
                    <td className="px-3 py-2"><SubjectChip subject={r.subject} showMath /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.questions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.parts}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.marks || '—'}</td>
                    <td className="px-3 py-2 text-neutral-600">{r.sourceKind || '—'}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      name{r.fingerprinted ? ` · ${r.fingerprinted} printed question${r.fingerprinted === 1 ? '' : 's'}` : ''}
                      {!r.fingerprinted && <span className="text-[11px] text-amber-700 block">no fingerprint yet — a differently-named hand-in will not match</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.uses}{r.lastUsedAt ? <div className="text-[11px] text-neutral-400">{when(r.lastUsedAt)}</div> : null}</td>
                    <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">{when(r.updatedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remove(r)} disabled={busy === r.id}
                        className="text-xs text-red-700 hover:text-red-900 disabled:opacity-40">{busy === r.id ? '…' : 'Delete'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
