// /admin/costs — what the marking pipeline spends, per run and per day
// (9 Sep 2026, Adrian: "I need real cost breakdown on usage via API").
//
// `cost_usd` on a run is the bot's own pricing of the Claude tokens it used
// (ai/paper-marker.js finalizeUsage: sync at list price, the 🌙 batch buckets
// at 50 %, cache reads at 10 %) — the same token counts Anthropic bills, so it
// tracks the invoice to the cent when the price table is current. It never
// includes Gemini (placement — Google bills it) and it is $0 for the pages the
// Mac read on the plan. Since 9 Sep 2026 evening a run also carries
// `result_json.usage.buckets` and `result_json.vision_usage`; older runs show
// the total only. Pure — the route feeds rows, the page renders.
import { markingPath, isHandin, type MarkingPath } from './marking-path';
import { sgtDateISO } from './sgt';

export type CostRunRow = {
  id: string;
  created_at: string;
  student_name?: string | null;
  paper_name?: string | null;
  num_photos?: number | null;
  cost_usd?: number | string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  model?: string | null;
  total_max?: number | null;
  result_json: {
    queue?: { queued_at?: string; mark_now?: boolean; external_claim?: { by?: string; at?: string; delivered_at?: string; released_at?: string } | null } | null;
    portal_submission?: unknown;
    telegram_handin?: unknown;
    usage?: { batched?: boolean; external?: boolean; externalReads?: number; buckets?: Record<string, number> } | null;
    vision_usage?: { inputTokens?: number; outputTokens?: number; pages?: number } | null;
  } | null;
};

export type CostEntry = {
  id: string;
  at: string;
  day: string;
  student: string | null;
  paper: string;
  pages: number;
  path: MarkingPath;
  handin: boolean;
  cost: number;
  centsPerPage: number | null;
  tokensIn: number;
  tokensOut: number;
  model: string | null;
  /** Pages read on the Mac plan (from the stored usage, else the whole paper for a plan run). */
  macPages: number;
  batched: boolean | null;
  buckets: Record<string, number> | null;
  gemini: { inputTokens: number; outputTokens: number; pages: number } | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function costEntries(rows: CostRunRow[]): CostEntry[] {
  return (rows || [])
    .filter(r => r && r.created_at && (r.total_max != null || r.cost_usd != null))
    .map(r => {
      const rj = r.result_json || {};
      const pages = num(r.num_photos);
      const path = markingPath(r as Parameters<typeof markingPath>[0]);
      const usage = rj.usage || null;
      const macPages = usage && usage.external ? num(usage.externalReads) : path === 'plan' ? pages : 0;
      const apiPages = Math.max(0, pages - macPages);
      const cost = num(r.cost_usd);
      const vu = rj.vision_usage || null;
      return {
        id: r.id, at: r.created_at, day: sgtDateISO(new Date(r.created_at)),
        student: r.student_name || null, paper: r.paper_name || 'Paper', pages, path,
        handin: isHandin(r as Parameters<typeof isHandin>[0]),
        cost: Math.round(cost * 10000) / 10000,
        centsPerPage: apiPages > 0 ? Math.round((cost / apiPages) * 100) : null,
        tokensIn: num(r.input_tokens), tokensOut: num(r.output_tokens), model: r.model || null,
        macPages, batched: usage ? !!usage.batched : null,
        buckets: usage && usage.buckets ? usage.buckets : null,
        gemini: vu ? { inputTokens: num(vu.inputTokens), outputTokens: num(vu.outputTokens), pages: num(vu.pages) } : null,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export type DayTotal = { day: string; runs: number; pages: number; macPages: number; cost: number; geminiTokens: number };

export function costByDay(entries: CostEntry[]): DayTotal[] {
  const m = new Map<string, DayTotal>();
  for (const e of entries) {
    const d = m.get(e.day) ?? { day: e.day, runs: 0, pages: 0, macPages: 0, cost: 0, geminiTokens: 0 };
    d.runs += 1; d.pages += e.pages; d.macPages += e.macPages; d.cost += e.cost;
    d.geminiTokens += e.gemini ? e.gemini.inputTokens + e.gemini.outputTokens : 0;
    m.set(e.day, d);
  }
  return [...m.values()].map(d => ({ ...d, cost: Math.round(d.cost * 100) / 100 })).sort((a, b) => b.day.localeCompare(a.day));
}

export type PathTotal = { runs: number; pages: number; cost: number };

export function costByPath(entries: CostEntry[]): Record<MarkingPath, PathTotal> {
  const out: Record<MarkingPath, PathTotal> = {
    plan: { runs: 0, pages: 0, cost: 0 }, 'api-queue': { runs: 0, pages: 0, cost: 0 }, 'api-now': { runs: 0, pages: 0, cost: 0 }, 'api-sync': { runs: 0, pages: 0, cost: 0 },
  };
  for (const e of entries) { const t = out[e.path]; t.runs += 1; t.pages += e.pages; t.cost += e.cost; }
  for (const k of Object.keys(out) as MarkingPath[]) out[k].cost = Math.round(out[k].cost * 100) / 100;
  return out;
}

/** Sum over entries whose SGT day falls in the given month ("2026-09"). */
export function monthTotal(entries: CostEntry[], month: string): PathTotal {
  const t = { runs: 0, pages: 0, cost: 0 };
  for (const e of entries) if (e.day.startsWith(month)) { t.runs += 1; t.pages += e.pages; t.cost += e.cost; }
  return { ...t, cost: Math.round(t.cost * 100) / 100 };
}

/** The Anthropic Admin API's cost report, folded to one line per day. Amounts are passed through as reported. */
export type BillDay = { day: string; amount: number; currency: string; lines: number };
export function foldCostReport(report: { data?: Array<{ starting_at?: string; results?: Array<{ amount?: string | number; currency?: string }> }> } | null | undefined): BillDay[] {
  const out: BillDay[] = [];
  for (const bucket of (report && Array.isArray(report.data) ? report.data : [])) {
    const day = String(bucket.starting_at || '').slice(0, 10);
    if (!day) continue;
    let amount = 0, lines = 0, currency = 'USD';
    for (const r of (bucket.results || [])) { amount += num(r.amount); lines += 1; if (r.currency) currency = String(r.currency); }
    out.push({ day, amount: Math.round(amount * 100) / 100, currency, lines });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
