'use client';
// /admin/costs — what the marking pipeline spends, and where (9 Sep 2026).
import { useEffect, useState } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';
import type { CostEntry, DayTotal, PathTotal, BillDay } from '@/lib/costs';

type Data = {
  days: number; month: string; monthToDate: PathTotal;
  byDay: DayTotal[]; byPath: Record<string, PathTotal>; runs: CostEntry[];
  bill: { available: boolean; days?: BillDay[]; note?: string };
  notes: string[];
};

const PATH_LABEL: Record<string, string> = { plan: '💻 Mac plan', 'api-queue': '☁️ batch', 'api-now': '⚡ mark now', 'api-sync': '▶ sync' };
const money = (n: number) => `$${n.toFixed(2)}`;

export default function CostsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        await ensureAdminSession();
        const res = await fetch(`/api/admin/costs?days=${days}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
        setData(await res.json());
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    })();
  }, [days]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-baseline gap-3 mb-4">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-700">‹</a>
          <h1 className="text-lg font-semibold">💵 Costs — the marking pipeline</h1>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="ml-auto text-sm border border-neutral-300 rounded-lg px-2 py-1 bg-white">
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>last {d} days</option>)}
          </select>
        </div>
        {error && <div className="text-red-700 text-sm mb-3">{error}</div>}
        {!data && !error && <div className="text-neutral-500 text-sm">Loading…</div>}
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card label={`${data.month} to date (bot pricing)`} value={money(data.monthToDate.cost)} sub={`${data.monthToDate.runs} papers · ${data.monthToDate.pages} pages`} />
              <Card label={`last ${data.days} days`} value={money(Object.values(data.byPath).reduce((a, p) => a + p.cost, 0))} sub={`${data.runs.length} papers`} />
              <Card label="on the Mac plan" value={`${data.byPath.plan?.runs ?? 0} papers`} sub={`${data.byPath.plan?.pages ?? 0} pages · ${money(data.byPath.plan?.cost ?? 0)} extras`} />
              <Card label="on the API" value={money((data.byPath['api-queue']?.cost ?? 0) + (data.byPath['api-now']?.cost ?? 0) + (data.byPath['api-sync']?.cost ?? 0))}
                sub={`batch ${data.byPath['api-queue']?.runs ?? 0} · now ${data.byPath['api-now']?.runs ?? 0} · sync ${data.byPath['api-sync']?.runs ?? 0}`} />
            </div>

            <section className="bg-white rounded-xl border border-neutral-200 p-4 mb-4">
              <div className="font-medium mb-1">The invoice (Anthropic)</div>
              {data.bill.available && data.bill.days ? (
                <table className="text-sm w-full"><tbody>
                  {data.bill.days.map(d => <tr key={d.day} className="border-t border-neutral-100"><td className="py-1">{d.day}</td><td className="py-1 text-right tabular-nums">{d.amount.toFixed(2)} {d.currency}</td><td className="py-1 text-right text-neutral-400 text-xs">{d.lines} line{d.lines === 1 ? '' : 's'}</td></tr>)}
                </tbody></table>
              ) : <div className="text-sm text-neutral-500">{data.bill.note}</div>}
            </section>

            <section className="bg-white rounded-xl border border-neutral-200 p-4 mb-4 overflow-x-auto">
              <div className="font-medium mb-2">By day</div>
              <table className="text-sm w-full min-w-[520px]">
                <thead><tr className="text-neutral-500 text-xs text-left"><th className="py-1">day</th><th>papers</th><th>pages</th><th>Mac pages</th><th className="text-right">Claude (bot pricing)</th><th className="text-right">Gemini tokens</th></tr></thead>
                <tbody>{data.byDay.map(d => (
                  <tr key={d.day} className="border-t border-neutral-100"><td className="py-1">{d.day}</td><td>{d.runs}</td><td>{d.pages}</td><td>{d.macPages}</td><td className="text-right tabular-nums">{money(d.cost)}</td><td className="text-right tabular-nums text-neutral-500">{d.geminiTokens ? d.geminiTokens.toLocaleString() : '—'}</td></tr>
                ))}</tbody>
              </table>
            </section>

            <section className="bg-white rounded-xl border border-neutral-200 p-4 mb-4 overflow-x-auto">
              <div className="font-medium mb-2">Every paper, newest first</div>
              <table className="text-sm w-full min-w-[720px]">
                <thead><tr className="text-neutral-500 text-xs text-left"><th className="py-1">when</th><th>student</th><th>paper</th><th>lane</th><th>pages</th><th className="text-right">cost</th><th className="text-right">¢ / API page</th><th className="text-right">tokens in / out</th></tr></thead>
                <tbody>{data.runs.map(r => (
                  <tr key={r.id} className="border-t border-neutral-100">
                    <td className="py-1 whitespace-nowrap">{new Date(r.at).toLocaleString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })}</td>
                    <td className="whitespace-nowrap">{r.student ?? '—'}{r.handin ? <span className="ml-1 text-[10px] text-teal-700">hand-in</span> : null}</td>
                    <td className="max-w-[240px] truncate" title={r.paper}><a href={`/admin/desk?run=${r.id}`} className="hover:underline">{r.paper}</a></td>
                    <td className="whitespace-nowrap">{PATH_LABEL[r.path] ?? r.path}{r.macPages && r.macPages < r.pages ? <span className="text-xs text-neutral-400"> · {r.macPages} Mac</span> : null}{r.batched === false && r.path === 'api-queue' ? <span className="text-xs text-amber-700"> · not batched</span> : null}</td>
                    <td>{r.pages}</td>
                    <td className="text-right tabular-nums">{money(r.cost)}</td>
                    <td className="text-right tabular-nums">{r.centsPerPage == null ? '—' : `${r.centsPerPage}¢`}</td>
                    <td className="text-right tabular-nums text-neutral-500 whitespace-nowrap">{r.tokensIn.toLocaleString()} / {r.tokensOut.toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </section>

            <div className="text-xs text-neutral-500 space-y-1">{data.notes.map((n, i) => <div key={i}>· {n}</div>)}</div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
