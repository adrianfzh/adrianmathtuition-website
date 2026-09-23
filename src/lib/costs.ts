// /admin/costs — what the marking pipeline spends, per run and per day
// (9 Sep 2026, Adrian: "I need real cost breakdown on usage via API").
//
// `cost_usd` on a run is the bot's own pricing of the tokens it used
// (ai/paper-marker.js finalizeUsage: sync at list price, the 🌙 batch buckets
// at 50 %, cache reads at 10 %) — $0 for the pages the Mac read on the plan.
// Since 24 Sep 2026 it is Claude + Gemini (placement, priced per call on the
// model that answered — bot ai/vision-cost.js), with the two kept apart as
// `usage.claudeCostUsd` / `usage.visionCostUsd` and `vision_usage.costUsd`.
// Before that it was Claude only, so a run with no `claudeCostUsd` is all
// Claude and its Gemini is unpriced (null here, never a guess). The Claude
// part is what compares with the Anthropic invoice. Since 9 Sep 2026 evening
// a run also carries `result_json.usage.buckets` and `result_json.vision_usage`
// tokens; older runs show the total only. Pure — the route feeds rows, the
// page renders.
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
    usage?: { batched?: boolean; external?: boolean; externalReads?: number; buckets?: Record<string, number>; claudeCostUsd?: number; visionCostUsd?: number } | null;
    vision_usage?: { inputTokens?: number; outputTokens?: number; pages?: number; calls?: number; costUsd?: number; byModel?: Record<string, { calls?: number; costUsd?: number }> } | null;
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
  /** The run's whole cost — Claude + Gemini since 24 Sep 2026, Claude only before. */
  cost: number;
  /** The Claude part (what the Anthropic invoice bills). */
  claudeCost: number;
  /** The Gemini part; null on runs from before Gemini was priced. */
  geminiCost: number | null;
  /** Claude cents per page the API read (Gemini runs on every page, Mac-read ones too). */
  centsPerPage: number | null;
  tokensIn: number;
  tokensOut: number;
  model: string | null;
  /** Pages read on the Mac plan (from the stored usage, else the whole paper for a plan run). */
  macPages: number;
  batched: boolean | null;
  buckets: Record<string, number> | null;
  gemini: { inputTokens: number; outputTokens: number; pages: number; cost: number | null; models: string[] } | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v));
const r4 = (n: number) => Math.round(n * 10000) / 10000;

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
      const geminiCost = usage && has(usage.visionCostUsd) ? num(usage.visionCostUsd) : vu && has(vu.costUsd) ? num(vu.costUsd) : null;
      const claudeCost = usage && has(usage.claudeCostUsd) ? num(usage.claudeCostUsd) : Math.max(0, cost - (geminiCost ?? 0));
      return {
        id: r.id, at: r.created_at, day: sgtDateISO(new Date(r.created_at)),
        student: r.student_name || null, paper: r.paper_name || 'Paper', pages, path,
        handin: isHandin(r as Parameters<typeof isHandin>[0]),
        cost: r4(cost), claudeCost: r4(claudeCost), geminiCost: geminiCost == null ? null : r4(geminiCost),
        centsPerPage: apiPages > 0 ? Math.round((claudeCost / apiPages) * 100) : null,
        tokensIn: num(r.input_tokens), tokensOut: num(r.output_tokens), model: r.model || null,
        macPages, batched: usage ? !!usage.batched : null,
        buckets: usage && usage.buckets ? usage.buckets : null,
        gemini: vu ? { inputTokens: num(vu.inputTokens), outputTokens: num(vu.outputTokens), pages: num(vu.pages), cost: geminiCost, models: vu.byModel ? Object.keys(vu.byModel) : [] } : null,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** `geminiCost` sums the runs that carry a price; `geminiUnpriced` counts the ones that don't (older runs). */
export type DayTotal = { day: string; runs: number; pages: number; macPages: number; cost: number; claudeCost: number; geminiCost: number; geminiUnpriced: number; geminiTokens: number };

export function costByDay(entries: CostEntry[]): DayTotal[] {
  const m = new Map<string, DayTotal>();
  for (const e of entries) {
    const d = m.get(e.day) ?? { day: e.day, runs: 0, pages: 0, macPages: 0, cost: 0, claudeCost: 0, geminiCost: 0, geminiUnpriced: 0, geminiTokens: 0 };
    d.runs += 1; d.pages += e.pages; d.macPages += e.macPages; d.cost += e.cost; d.claudeCost += e.claudeCost;
    if (e.geminiCost != null) d.geminiCost += e.geminiCost; else if (e.gemini) d.geminiUnpriced += 1;
    d.geminiTokens += e.gemini ? e.gemini.inputTokens + e.gemini.outputTokens : 0;
    m.set(e.day, d);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...m.values()].map(d => ({ ...d, cost: r2(d.cost), claudeCost: r2(d.claudeCost), geminiCost: r2(d.geminiCost) })).sort((a, b) => b.day.localeCompare(a.day));
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

/** The Anthropic Admin API's cost report, folded to one line per day. `amount` arrives in CENTS as a
 *  decimal string ("123.45" = $1.23) — divided here, so every number on the page is dollars. */
export type BillDay = { day: string; amount: number; currency: string; lines: number };
export type BillLine = { description: string; model: string | null; tier: string | null; tokenType: string | null; amount: number };
type CostReport = { data?: Array<{ starting_at?: string; results?: Array<{ amount?: string | number; currency?: string; description?: string | null; model?: string | null; service_tier?: string | null; token_type?: string | null }> }> } | null | undefined;

export function foldCostReport(report: CostReport): BillDay[] {
  const out = new Map<string, BillDay>();
  for (const bucket of (report && Array.isArray(report.data) ? report.data : [])) {
    const day = String(bucket.starting_at || '').slice(0, 10);
    if (!day) continue;
    const d = out.get(day) ?? { day, amount: 0, currency: 'USD', lines: 0 };
    for (const r of (bucket.results || [])) { d.amount += num(r.amount) / 100; d.lines += 1; if (r.currency) d.currency = String(r.currency); }
    out.set(day, d);
  }
  return [...out.values()].map(d => ({ ...d, amount: Math.round(d.amount * 100) / 100 })).sort((a, b) => b.day.localeCompare(a.day));
}

/** The same report folded by line item (model × tier × token type) across the whole window, largest first. */
export function foldCostLines(report: CostReport): BillLine[] {
  const out = new Map<string, BillLine>();
  for (const bucket of (report && Array.isArray(report.data) ? report.data : [])) {
    for (const r of (bucket.results || [])) {
      const key = `${r.model ?? ''}|${r.service_tier ?? ''}|${r.token_type ?? ''}|${r.description ?? ''}`;
      const l = out.get(key) ?? { description: String(r.description ?? 'Usage'), model: r.model ?? null, tier: r.service_tier ?? null, tokenType: r.token_type ?? null, amount: 0 };
      l.amount += num(r.amount) / 100;
      out.set(key, l);
    }
  }
  return [...out.values()].map(l => ({ ...l, amount: Math.round(l.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}

// ── The bot's per-feature ledger (Airtable CostLog), folded into parts ─────────
// Mirrors the bot's lib/cost-buckets.js BUCKETS so the Telegram /costs report and
// this page name the same parts. Marking joined the ledger on 9 Sep 2026 evening;
// before that its cost lives only on the run rows above. Its Gemini calls joined
// on 24 Sep 2026 (marking_vision / _split / _preflight / _overlay → ✏️ marking).
export type LedgerRow = { date: string; feature: string; model: string; cost: number; calls: number };
export type Part = 'marking' | 'science' | 'web' | 'practice' | 'checks' | 'telegram' | 'other';
const PARTS: Array<{ key: Part; test: RegExp }> = [
  { key: 'marking',  test: /^marking|^annotate|^paper|^overlay|^reannotate/ },
  { key: 'science',  test: /^science_/ },
  { key: 'web',      test: /^web_/ },
  { key: 'practice', test: /^practice|^generation|^similar|^revise|^question_gen|^genPractice|^topup|^gate|^portal_generate/ },
  { key: 'checks',   test: /^verification|^prompt_improvement|^strip_self_correction|^image_nonmath|^correction|^subject|^classif|^evaluator|^explain|^jstat|^router|^intent|^prompt_lint/ },
  { key: 'telegram', test: /^student_answer|^edge_route|^opus_|^answer|^followup|^image_followup|^text_answer|^callback_|^teach/ },
];
export const PART_LABEL: Record<Part, string> = {
  marking: '✏️ Marking (paper reads, second look, checks)', science: '🧪 Science solver', web: '🌐 Web solver (app Ask + /chat)',
  practice: '🎯 Practice (gates, generation)', checks: '🩺 Checks (verifiers, classifiers)', telegram: '📱 Telegram solver', other: '🗂 Other',
};
export function partOf(feature: string): Part {
  const f = String(feature || '');
  return (PARTS.find(p => p.test.test(f)) || { key: 'other' as Part }).key;
}
export type PartTotal = { part: Part; label: string; cost: number; calls: number; models: Record<string, number>; features: Array<{ feature: string; cost: number }> };
export function costByPart(rows: LedgerRow[]): PartTotal[] {
  const m = new Map<Part, PartTotal>();
  const feat = new Map<string, number>();
  for (const r of rows || []) {
    const key = partOf(r.feature);
    const t = m.get(key) ?? { part: key, label: PART_LABEL[key], cost: 0, calls: 0, models: {}, features: [] };
    t.cost += num(r.cost); t.calls += num(r.calls);
    t.models[r.model || 'unknown'] = (t.models[r.model || 'unknown'] || 0) + num(r.cost);
    feat.set(`${key}|${r.feature}`, (feat.get(`${key}|${r.feature}`) || 0) + num(r.cost));
    m.set(key, t);
  }
  for (const [k, v] of feat) { const [part, feature] = k.split('|'); m.get(part as Part)!.features.push({ feature, cost: Math.round(v * 100) / 100 }); }
  return [...m.values()].map(t => ({
    ...t, cost: Math.round(t.cost * 100) / 100,
    models: Object.fromEntries(Object.entries(t.models).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    features: t.features.sort((a, b) => b.cost - a.cost),
  })).sort((a, b) => b.cost - a.cost);
}
