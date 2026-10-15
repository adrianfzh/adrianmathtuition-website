'use client';

// /admin/rulebook — 📏 the staff rulebook (15 Oct 2026, Adrian: "help me create an employees
// rulebook — rules of engagement for employees … allow me to access in admin hub and allow me
// to add/change/edit"). One list, grouped; each rule can be changed, moved, marked Important or
// removed. Rows in Supabase `staff_rules`, through /api/admin/rulebook; arithmetic in lib/staff-rules.ts.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { DEFAULT_SECTION, groupRules, type StaffRule } from '@/lib/staff-rules';

type Draft = { id: string | null; section: string; body: string; important: boolean };

function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
}

export default function RulebookPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [rules, setRules] = useState<StaffRule[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const call = useCallback(async (method: string, url: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRules(d.rules as StaffRule[]);
      setErr('');
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) call('GET', '/api/admin/rulebook'); }, [authed, call]);

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">📏 Staff rulebook</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border rounded-lg px-3 py-2" autoFocus />
          <button className="w-full bg-neutral-800 text-white rounded-lg py-2">Open</button>
        </form>
      </main>
    );
  }

  const groups = groupRules(rules ?? []);
  const sections = groups.map(g => g.section);
  const lastChanged = (rules ?? []).reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), '');
  let n = 0;

  async function save() {
    if (!draft) return;
    if (!draft.body.trim()) { setErr('Write the rule first.'); return; }
    const ok = draft.id
      ? await call('PATCH', '/api/admin/rulebook', { id: draft.id, section: draft.section, body: draft.body, important: draft.important })
      : await call('POST', '/api/admin/rulebook', { section: draft.section, body: draft.body, important: draft.important });
    if (ok) setDraft(null);
  }
  async function remove(r: StaffRule) {
    if (!window.confirm(`Remove this rule?\n\n${r.body}`)) return;
    await call('DELETE', `/api/admin/rulebook?id=${encodeURIComponent(r.id)}`);
    if (draft?.id === r.id) setDraft(null);
  }

  const editor = (
    <div className="mt-3 rounded-lg border border-dashed border-neutral-400 bg-white p-3 space-y-2">
      <div className="text-xs text-neutral-500">{draft?.id ? 'Change this rule' : 'New rule'}</div>
      <textarea value={draft?.body ?? ''} onChange={e => setDraft(d => d && { ...d, body: e.target.value })}
        rows={2} autoFocus placeholder="Always be encouraging."
        className="w-full border rounded-lg px-3 py-2 text-[15px]" />
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
        <label className="flex items-center gap-1.5">Group
          <input list="rulebook-sections" value={draft?.section ?? ''} onChange={e => setDraft(d => d && { ...d, section: e.target.value })}
            placeholder={DEFAULT_SECTION} className="border rounded-md px-2 py-1 w-48" />
        </label>
        <datalist id="rulebook-sections">{sections.map(s => <option key={s} value={s} />)}</datalist>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!draft?.important} onChange={e => setDraft(d => d && { ...d, important: e.target.checked })} /> Important
        </label>
        <span className="flex-1" />
        <button onClick={() => { setDraft(null); setErr(''); }} className="px-3 py-1.5 rounded-md border">Cancel</button>
        <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded-md bg-neutral-800 text-white disabled:opacity-50">Save</button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-neutral-200 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Link href="/admin" className="text-sm text-neutral-500">← Admin hub</Link>
          <button onClick={() => { setErr(''); setDraft({ id: null, section: sections[0] ?? DEFAULT_SECTION, body: '', important: false }); }}
            className="text-sm px-3 py-1.5 rounded-md border border-neutral-300">＋ Add a rule</button>
        </div>
        <h1 className="text-2xl font-semibold text-neutral-900 mt-2">📏 Staff rulebook</h1>
        <p className="text-sm text-neutral-500 mt-0.5">How we work with every student.{lastChanged ? ` Last changed ${fmtDate(lastChanged)}.` : ''}</p>

        {err && <div className="mt-3 text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{err}</div>}
        {draft && !draft.id && editor}
        {rules === null && <div className="mt-6 text-sm text-neutral-500">Loading…</div>}
        {rules !== null && !rules.length && !draft && <div className="mt-6 text-sm text-neutral-500">No rules yet. Tap ＋ Add a rule.</div>}

        {groups.map(g => (
          <section key={g.section} className="mt-5">
            <div className="text-xs text-neutral-500 mb-1.5">{g.section}</div>
            <div className="rounded-lg border border-neutral-200 divide-y divide-neutral-200">
              {g.rules.map((r, i) => {
                n += 1;
                return (
                  <div key={r.id} className={r.important ? 'bg-amber-50' : ''}>
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      <span className={`w-5 text-sm pt-0.5 ${r.important ? 'text-amber-800' : 'text-neutral-400'}`}>{n}</span>
                      <span className={`flex-1 text-[15px] ${r.important ? 'text-amber-900' : 'text-neutral-900'}`}>
                        {r.body}
                        {r.important && <span className="ml-2 text-xs border border-amber-400 rounded px-1.5 py-px align-middle">Important</span>}
                      </span>
                      <span className="flex items-center gap-1 text-neutral-500 text-sm shrink-0">
                        <button aria-label="Move up" disabled={busy || i === 0} onClick={() => call('PATCH', '/api/admin/rulebook', { id: r.id, move: 'up' })} className="px-1 disabled:opacity-25">↑</button>
                        <button aria-label="Move down" disabled={busy || i === g.rules.length - 1} onClick={() => call('PATCH', '/api/admin/rulebook', { id: r.id, move: 'down' })} className="px-1 disabled:opacity-25">↓</button>
                        <button aria-label="Change" onClick={() => { setErr(''); setDraft({ id: r.id, section: r.section, body: r.body, important: r.important }); }} className="px-1">✏️</button>
                        <button aria-label="Remove" disabled={busy} onClick={() => remove(r)} className="px-1">🗑</button>
                      </span>
                    </div>
                    {draft?.id === r.id && <div className="px-3 pb-3">{editor}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
