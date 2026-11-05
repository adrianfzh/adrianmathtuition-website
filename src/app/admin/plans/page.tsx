'use client';

// /admin/plans — 💳 self-serve plans (lib/plans.ts, SPEC-PLANS.md, 5 Nov 2026). The
// plans with their money at full use, then every self-serve account: its plan, papers
// used, and buttons to change it by hand. Tuition students are not here — they are never
// limited. Prices and limits are edited in lib/plans.ts, not on this page.

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';

type PlanRow = { key: string; label: string; priceSgd: number; papersPerPeriod: number; dailyCap: number | null; costSgd: number; feeSgd: number; marginSgd: number; marginPct: number; perPaperSgd: number };
type AcctRow = { id: string; name: string | null; email: string | null; level: string | null; joined: string | null; exStudent: boolean; kind: 'free' | 'plan'; label: string; plan: string | null; used: number; allowance: number; left: number; endsAt: string | null; bonus: number | null };
type Data = { plansOn: boolean; testSite: boolean; costPerPaperSgd: number; freePapers: number; referredExtraFreePapers: number; periodDays: number; plans: PlanRow[]; accounts: AcctRow[] };

const money = (n: number) => `S$${n.toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }) : '');
const CARD = 'bg-white rounded-2xl border border-gray-200 p-4';

export default function AdminPlansPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch('/api/admin/plans');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    (async () => {
      if (await ensureAdminSession()) load();
      else setError('Log in to the admin first.');
    })();
  }, [load]);

  async function act(accountId: string, body: Record<string, unknown>) {
    setBusy(accountId);
    try {
      const r = await fetch('/api/admin/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const shown = (data?.accounts ?? []).filter(a => !q || `${a.name ?? ''} ${a.email ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">💳 Plans</h1>
        <p className="text-sm text-gray-600 mt-1">Self-serve students only. Tuition students are never limited and are not listed.</p>
        {data && (
          <p className={`text-sm mt-2 rounded-xl px-3 py-2 ${data.plansOn ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-100 text-gray-700'}`}>
            {data.plansOn
              ? (data.testSite ? 'On — test site. Choosing a plan here takes no money.' : 'On — main site. Plans take real payments.')
              : 'Off on this site — self-serve students still see the old S$29 pass.'}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{error}</p>}

      {data && (
        <div className={CARD}>
          <p className="font-bold text-navy mb-1">The plans (if every paper is used)</p>
          <p className="text-xs text-gray-500 mb-3">
            Free: practice + {data.freePapers} marked paper{data.freePapers === 1 ? '' : 's'} (+{data.referredExtraFreePapers} when invited).
            Marking costs about {money(data.costPerPaperSgd)} a paper. Prices are set in lib/plans.ts.
          </p>
          <div className="space-y-2">
            {data.plans.map(p => (
              <div key={p.key} className="rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <div className="flex justify-between font-semibold text-navy">
                  <span>{p.label} — {p.papersPerPeriod} papers / {data.periodDays} days</span>
                  <span>S${p.priceSgd}</span>
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  Marking {money(p.costSgd)} · card fee {money(p.feeSgd)} · <span className="font-semibold text-emerald-700">we keep {money(p.marginSgd)} ({p.marginPct}%)</span> · {money(p.perPaperSgd)} a paper to the student
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="font-bold text-navy flex-1">Accounts ({data.accounts.length})</p>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email" className="border border-gray-300 rounded-xl px-3 py-1.5 text-sm w-48" />
          </div>
          {shown.map(a => (
            <div key={a.id} className={CARD}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="font-semibold text-navy">{a.name || '(no name)'}</p>
                <p className="text-xs text-gray-500 break-all">{a.email}</p>
                {a.level && <p className="text-xs text-gray-500">{a.level}</p>}
                {a.exStudent && <p className="text-xs text-amber-700">ex-student</p>}
              </div>
              <p className="text-sm mt-1">
                <span className="font-semibold">{a.label}</span>
                {' · '}{a.used} of {a.allowance} papers used
                {a.endsAt ? ` · ends ${day(a.endsAt)}` : ''}
                {a.bonus ? ` · ${a.bonus} bonus` : ''}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {data.plans.map(p => (
                  <button key={p.key} disabled={busy === a.id || a.plan === p.key} onClick={() => act(a.id, { action: 'set_plan', plan: p.key })}
                    className="text-xs font-semibold rounded-lg px-2.5 py-1.5 bg-navy text-white disabled:opacity-40">
                    {a.plan === p.key ? `On ${p.label}` : `→ ${p.label}`}
                  </button>
                ))}
                {a.kind === 'plan' && (
                  <>
                    <button disabled={busy === a.id} onClick={() => act(a.id, { action: 'reset_used' })} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 bg-gray-100 text-gray-800">Reset papers used</button>
                    <button disabled={busy === a.id} onClick={() => { if (confirm('End this plan now? They go back to free.')) act(a.id, { action: 'free' }); }} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 bg-gray-100 text-rose-700">→ Free</button>
                  </>
                )}
                {a.kind === 'free' && (
                  <button disabled={busy === a.id} onClick={() => act(a.id, { action: 'bonus', papers: 1 })} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 bg-gray-100 text-gray-800">+1 free paper</button>
                )}
              </div>
            </div>
          ))}
          {shown.length === 0 && <p className="text-sm text-gray-500">No self-serve accounts{q ? ' match' : ' yet'}.</p>}
        </div>
      )}
    </div>
  );
}
