// 💰 lib/weekly-cost — the Monday cost check (5 Oct 2026, Adrian: "do page-trimming and
// weekly cost check and cheaper helper steps").
//
// ONE plain message a week: what a marked paper cost on average, split into its big
// parts (placing the red pen · reading the pages · extra checks) and by lane (plan /
// paid / half-price), the month so far, and — ONLY for the savings whose test has
// passed — one line each ending "say 'switch <name>' to turn it on". No model names,
// no jargon: "a cheaper reader", not a model id.
//
// Two sources, kept apart on purpose:
//   • the RUNS (paper_marking_runs.result_json.usage / vision_usage) — what each paper
//     cost and which lane read it; tests are never in a run's cost;
//   • the bot's LEDGER (Airtable CostLog, per day × feature) — the bill itself, which
//     is how the per-paper split is made and how the tests' own cost is shown apart.
// The lever verdicts come from `cost_lever_tests` (one row per lever: the A/B or trial
// that set its bar) plus the live shadows on the runs. Nothing here flips a switch.
//
// Pure — `lib/weekly-cost-store.ts` feeds it, `/api/cron/weekly-cost` sends it.

export type WeekRun = {
  id: string;
  created_at: string;
  paper_name?: string | null;
  cost_usd?: number | string | null;
  result_json?: {
    queue?: { queued_at?: string; mark_now?: boolean; external_claim?: { delivered_at?: string } | null } | null;
    usage?: { costUsd?: number; claudeCostUsd?: number; visionCostUsd?: number; external?: boolean; batched?: boolean; buckets?: Record<string, number> } | null;
    vision_usage?: { costUsd?: number; pages?: number; byKind?: Record<string, { calls?: number; costUsd?: number }> } | null;
    page_trim?: { indexed?: boolean; reads?: number; trimmed?: number; fellBack?: number } | null;
    helper_shadow?: Array<{ photo_index: number; kinds?: Record<string, HelperKindTotals> }> | null;
    classify_shadow?: { pages?: number; kindSame?: number; questionsSame?: number; graphSame?: number; paperTotalSame?: boolean; flashCostUsd?: number; deliveredBy?: string; error?: string } | null;
  } | null;
};
export type HelperKindTotals = { calls?: number; items?: number; same?: number; moved?: number; missed?: number; extra?: number; proCostUsd?: number; flashCostUsd?: number; flashFailed?: number };
export type LedgerRow = { date: string; feature: string; model: string; cost: number; calls: number };
export type LeverStatus = 'running' | 'passed' | 'failed' | 'on';
export type LeverTest = {
  name: string;
  status: LeverStatus;
  /** Free-form numbers the test produced (agreement, noise floor, costs). */
  measure?: Record<string, unknown> | null;
  saving_per_paper_usd?: number | null;
  measured_at?: string | null;
};
/** The cheaper-reader shadow's per-level verdicts (lib/shadow-read-report.ts), folded small. */
export type ReaderLevel = { level: string; papers: number; agreePct: number | null; passes: boolean };

export type WeeklyCostInput = {
  weekStart: string;       // SGT date, inclusive
  weekEnd: string;         // SGT date, inclusive
  monthStart: string;      // SGT date, the 1st
  today: string;           // SGT date the message is written (the day after weekEnd)
  runs: WeekRun[];         // this week's marked papers
  shadowRuns?: WeekRun[];  // the last few weeks' runs carrying a helper/classify shadow (for the verdicts)
  ledgerWeek: LedgerRow[];
  ledgerMonth: LedgerRow[];
  tests: LeverTest[];
  readerLevels?: ReaderLevel[];
  readerNoisePct?: number | null;
};

// ── which ledger feature is which part ─────────────────────────────────────────
// A TEST is never part of what a paper costs: the shadows, the A/Bs and dry runs.
const TEST = /shadow|_ab$|^pen_dryrun|^marking_read_ab|^marking_page_trim_ab|^vision_trial/;
const PEN = /^marking_vision$|^marking_preflight$|^marking_overlay$|^marking_split$|^annotate|^reannotate|^overlay/;
const READ = /^marking_read$|^marking_batch_read$|^marking$|^marking_rescue$|^marking_page_trim$|^marking_classify$/;
const EXTRA = /^marking_|^handin-read$|^paper_/;
export type CostPart = 'pen' | 'read' | 'extra' | 'test' | null;
export function costPartOf(feature: string): CostPart {
  const f = String(feature || '');
  if (TEST.test(f)) return /^marking|^pen_|^vision/.test(f) ? 'test' : null;
  if (PEN.test(f)) return 'pen';
  if (READ.test(f)) return 'read';
  if (EXTRA.test(f)) return 'extra';
  return null;
}
export function sumParts(rows: LedgerRow[]): Record<'pen' | 'read' | 'extra' | 'test', number> {
  const t = { pen: 0, read: 0, extra: 0, test: 0 };
  for (const r of rows || []) { const p = costPartOf(r.feature); if (p) t[p] += Number(r.cost) || 0; }
  return t;
}

// ── lanes ─────────────────────────────────────────────────────────────────────
export type Lane = 'plan' | 'api' | 'batch';
export function laneOf(run: WeekRun): Lane {
  const u = run.result_json?.usage;
  if (u?.external || run.result_json?.queue?.external_claim?.delivered_at) return 'plan';
  if (u?.batched) return 'batch';
  return 'api';
}
export const isTestPaper = (r: WeekRun) => /^BENCH\b/i.test(String(r.paper_name || ''));
const costOf = (r: WeekRun) => Number(r.result_json?.usage?.costUsd ?? r.cost_usd) || 0;

// ── the levers ────────────────────────────────────────────────────────────────
export const HELPER_MIN_PAGES = 50;
export const CLASSIFY_MIN_PAPERS = 20;
export const CLASSIFY_BAR = { kind: 97, questions: 95 };
const WEEKS_PER_MONTH = 30 / 7;
/** The marker's system prompt + tools, cached for every read (measured 5 Oct 2026). */
export const SYSTEM_PREFIX_TOKENS = 55_000;

export type Saving = { name: string; line: string; monthly: number };
export type Testing = { name: string; line: string };

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
const usd = (x: number) => (x >= 10 ? `US$${Math.round(x)}` : `US$${x.toFixed(2)}`);
const testOf = (tests: LeverTest[], name: string) => (tests || []).find(t => t.name === name) || null;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** The verdict + saving per lever. Pure. Only levers whose test has passed — and that are not on already — become a Saving. */
export function levers(inp: WeeklyCostInput): { savings: Saving[]; testing: Testing[] } {
  const savings: Saving[] = [], testing: Testing[] = [];
  const papers = inp.runs.filter(r => !isTestPaper(r));
  const apiPapers = papers.filter(r => laneOf(r) !== 'plan').length;

  // 1. Page trim — send the marker only the paper pages a student page needs.
  const trim = testOf(inp.tests, 'page-trim');
  if (trim && trim.status !== 'on') {
    const m = trim.measure || {};
    const perPaper = n(trim.saving_per_paper_usd) || 0;
    // Plan-lane papers still pay a 1-hour write of the whole paper when one page is
    // retried on the API; that write is what trimming removes. The ~55k-token system
    // prompt is written either way, so only what is above it counts (conservative).
    const retryWrites = papers.filter(r => laneOf(r) === 'plan')
      .reduce((s, r) => s + Math.max(0, (Number(r.result_json?.usage?.buckets?.cacheWrite) || 0) - SYSTEM_PREFIX_TOKENS) * 8 / 1e6, 0);
    const monthly = (apiPapers * perPaper + retryWrites) * WEEKS_PER_MONTH;
    const same = n(m.same), parts = n(m.parts), noise = n(m.noise_pct);
    const proof = parts ? `marks matched on ${same} of ${parts} parts (${pct(same || 0, parts)}%; the marker matches itself ${noise}%)` : 'its test passed';
    if (trim.status === 'passed' && monthly < 1) testing.push({ name: 'page-trim', line: 'Sending only the pages it needs: passed, but saves under US$1 a month at this week\'s papers.' });
    else if (trim.status === 'passed') savings.push({ name: 'page-trim', monthly, line: `Sending the marker only the pages it needs: ${proof}. Saves about ${usd(monthly)} a month at this week's papers${perPaper > 0 ? ` (${usd(perPaper)} on every paper read by the paid reader)` : ''}. Say "switch page-trim" to turn it on.` });
    else testing.push({ name: 'page-trim', line: `Sending only the pages it needs: ${trim.status === 'failed' ? 'did not pass' : 'being tested'}${parts ? ` (${pct(same || 0, parts)}% of marks matched; needs ${noise}%)` : ''}.` });
  }

  // 2. A cheaper helper for the red pen (the part boxes and the rings, never the ticks).
  const helper = testOf(inp.tests, 'helper-flash');
  if (helper && helper.status !== 'on') {
    const noise = n(helper.measure?.noise_pct);
    const live = helperRollUp(inp.shadowRuns || []);
    const kinds = Object.values(live.kinds);
    const items = kinds.reduce((s, k) => s + (k.items || 0), 0), same = kinds.reduce((s, k) => s + (k.same || 0), 0);
    const agree = pct(same, items);
    const savePerPage = live.pages ? kinds.reduce((s, k) => s + (k.proCostUsd || 0) - (k.flashCostUsd || 0), 0) / live.pages : 0;
    const penPagesWeek = papers.reduce((s, r) => s + (Number(r.result_json?.vision_usage?.pages) || 0), 0);
    const monthly = Math.max(0, savePerPage) * penPagesWeek * WEEKS_PER_MONTH;
    const passes = noise != null && agree != null && live.pages >= HELPER_MIN_PAGES && agree >= noise;
    if (passes) savings.push({ name: 'helper-flash', monthly, line: `A cheaper helper for the red pen (it finds each part's working; the ticks stay as they are): placed ${agree}% of boxes where today's does, on ${live.pages} pages (today's helper repeats itself ${noise}%). Saves about ${usd(monthly)} a month. Say "switch helper-flash" to turn it on.` });
    else testing.push({ name: 'helper-flash', line: `A cheaper helper for the red pen: ${live.pages} pages so far${agree != null ? `, ${agree}% the same` : ''} (needs ${HELPER_MIN_PAGES} pages${noise != null ? ` and ${noise}%` : ''}).` });
  }

  // 3. A cheaper page sorter (cover / printed questions / working / answer key).
  const cls = testOf(inp.tests, 'classify-flash');
  if (cls && cls.status !== 'on') {
    const list = (inp.shadowRuns || []).map(r => r.result_json?.classify_shadow).filter((c): c is NonNullable<typeof c> => !!c && !c.error && !!c.pages);
    const pages = list.reduce((s, c) => s + (c.pages || 0), 0);
    const kindPct = pct(list.reduce((s, c) => s + (c.kindSame || 0), 0), pages);
    const qPct = pct(list.reduce((s, c) => s + (c.questionsSame || 0), 0), pages);
    const passes = list.length >= CLASSIFY_MIN_PAPERS && (kindPct ?? 0) >= CLASSIFY_BAR.kind && (qPct ?? 0) >= CLASSIFY_BAR.questions;
    // The sorter is only PAID on a paper the paid reader marks (the plan sorts its own).
    const sorterWeek = (inp.ledgerWeek || []).filter(r => r.feature === 'marking_read' && /sonnet/i.test(r.model)).reduce((s, r) => s + (Number(r.cost) || 0), 0);
    const flashPerPaper = list.length ? list.reduce((s, c) => s + (c.flashCostUsd || 0), 0) / list.length : 0;
    const monthly = Math.max(0, sorterWeek - flashPerPaper * apiPapers) * WEEKS_PER_MONTH;
    if (passes && monthly >= 1) savings.push({ name: 'classify-flash', monthly, line: `A cheaper page sorter: sorted ${kindPct}% of pages the same way and read the same printed questions on ${qPct}%, over ${list.length} papers. Saves about ${usd(monthly)} a month. Say "switch classify-flash" to turn it on.` });
    else testing.push({ name: 'classify-flash', line: `A cheaper page sorter: ${list.length} papers so far${kindPct != null ? `, ${kindPct}% of pages sorted the same` : ''}${passes ? ' — passed, but saves under US$1 a month while papers are read on the plan' : ` (needs ${CLASSIFY_MIN_PAPERS} papers, ${CLASSIFY_BAR.kind}%)`}.` });
  }

  // 4. A cheaper reader, level by level (the 👻 shadow — lib/shadow-read-report.ts).
  for (const lv of inp.readerLevels || []) {
    if (!lv.passes) continue;
    const lvPapers = papers.filter(r => laneOf(r) !== 'plan' && levelGuess(r.paper_name) === lv.level);
    const claude = lvPapers.reduce((s, r) => s + (Number(r.result_json?.usage?.claudeCostUsd) || 0), 0);
    const monthly = claude * 0.5 * WEEKS_PER_MONTH;   // the cheaper reader is half the price a token
    const slug = lv.level.toLowerCase().replace(/\s+/g, '');
    savings.push({ name: `reader-${slug}`, monthly, line: `A cheaper reader for ${lv.level}: gave the same mark as the marker ${lv.agreePct}% of the time on ${lv.papers} papers (the marker matches itself ${inp.readerNoisePct}%). Saves about ${usd(monthly)} a month at this week's paid papers. Say "switch reader-${slug}" to turn it on.` });
  }
  const readers = inp.readerLevels || [];
  if (readers.length && !readers.some(l => l.passes)) testing.push({ name: 'reader', line: `A cheaper reader: no level has matched the marker often enough yet.` });
  return { savings: savings.sort((a, b) => b.monthly - a.monthly), testing };
}

/** The same roll-up as the bot's lib/helper-shadow.js rollUp (the twin; a drift fails the shared example in the test). */
export function helperRollUp(runs: WeekRun[]): { papers: number; pages: number; kinds: Record<string, Required<HelperKindTotals>> } {
  const kinds: Record<string, Required<HelperKindTotals>> = {};
  let papers = 0, pages = 0;
  for (const r of runs || []) {
    const hs = r.result_json?.helper_shadow;
    if (!Array.isArray(hs) || !hs.length) continue;
    papers++;
    for (const pg of hs) {
      pages++;
      for (const [k, s] of Object.entries(pg.kinds || {})) {
        const t = kinds[k] || (kinds[k] = { calls: 0, items: 0, same: 0, moved: 0, missed: 0, extra: 0, proCostUsd: 0, flashCostUsd: 0, flashFailed: 0 });
        for (const f of Object.keys(t) as (keyof HelperKindTotals)[]) t[f] += Number(s[f]) || 0;
      }
    }
  }
  return { papers, pages, kinds };
}

export function levelGuess(name: string | null | undefined): string {
  const s = String(name || '');
  if (/\bH2\b|\bJC\b|9758|9740/i.test(s)) return 'H2';
  if (/\bA\s*-?\s*MATH|\bAM\b|4049|ADD(ITIONAL)?\s*MATH/i.test(s)) return 'A Math';
  if (/\bE\s*-?\s*MATH|\bEM\b|4052|4048/i.test(s)) return 'E Math';
  return 'other';
}

// ── the summary + the message ─────────────────────────────────────────────────
export type WeeklyCost = {
  weekStart: string; weekEnd: string;
  papers: number; avg: number | null;
  split: { pen: number; read: number; extra: number } | null;
  lanes: Record<Lane, { papers: number; avg: number | null }>;
  testsWeek: number;
  month: { spent: number; tests: number; days: number; daysInMonth: number; projected: number | null; label: string };
  savings: Saving[]; testing: Testing[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function buildWeeklyCost(inp: WeeklyCostInput): WeeklyCost {
  const papers = inp.runs.filter(r => !isTestPaper(r));
  const total = papers.reduce((s, r) => s + costOf(r), 0);
  const parts = sumParts(inp.ledgerWeek);
  const ledgerPaperTotal = parts.pen + parts.read + parts.extra;
  const split = papers.length && ledgerPaperTotal > 0
    ? { pen: r2(parts.pen / papers.length), read: r2(parts.read / papers.length), extra: r2(parts.extra / papers.length) }
    : null;
  const lanes = { plan: { papers: 0, avg: null }, api: { papers: 0, avg: null }, batch: { papers: 0, avg: null } } as WeeklyCost['lanes'];
  for (const lane of ['plan', 'api', 'batch'] as Lane[]) {
    const rs = papers.filter(r => laneOf(r) === lane);
    lanes[lane] = { papers: rs.length, avg: rs.length ? r2(rs.reduce((s, r) => s + costOf(r), 0) / rs.length) : null };
  }
  const mParts = sumParts(inp.ledgerMonth);
  const monthSpent = mParts.pen + mParts.read + mParts.extra;
  const lastDay = new Date(Date.UTC(Number(inp.monthStart.slice(0, 4)), Number(inp.monthStart.slice(5, 7)), 0)).getUTCDate();
  // Days of the month the ledger covers: the 1st up to yesterday (the message is written in the morning).
  const days = Math.min(lastDay, Math.max(0, daysBetween(inp.monthStart, inp.today)));
  const { savings, testing } = levers(inp);
  return {
    weekStart: inp.weekStart, weekEnd: inp.weekEnd,
    // The average is the BILL over the papers (re-marks and redraws included), so the
    // three parts add up to it; the per-lane figures below are each paper's first marking.
    papers: papers.length, avg: papers.length ? r2((split ? ledgerPaperTotal : total) / papers.length) : null,
    split, lanes, testsWeek: r2(parts.test),
    month: {
      spent: r2(monthSpent), tests: r2(mParts.test), days, daysInMonth: lastDay,
      projected: days >= 3 ? Math.round((monthSpent / days) * lastDay) : null,
      label: `${MONTHS[Number(inp.monthStart.slice(5, 7)) - 1]}`,
    },
    savings, testing,
  };
}

const TEST_NAME: Record<string, string> = {
  reader: 'a cheaper reader', 'page-trim': 'sending only the pages needed', 'helper-flash': 'a cheaper helper for the red pen', 'classify-flash': 'a cheaper page sorter',
};

export function weeklyCostMessage(w: WeeklyCost): string {
  const L: string[] = [];
  L.push(`💰 Marking cost — ${dayLabel(w.weekStart)} to ${dayLabel(w.weekEnd)}`);
  L.push('');
  if (!w.papers) L.push('No papers were marked this week.');
  else {
    L.push(`${w.papers} paper${w.papers === 1 ? '' : 's'} marked. A paper cost ${usd(w.avg || 0)} on average:`);
    if (w.split) {
      L.push(`• placing the red pen: ${usd(w.split.pen)}`);
      const allPlan = w.lanes.plan.papers === w.papers;
      L.push(`• reading the pages: ${usd(w.split.read)}${allPlan ? ` (every paper was read on the plan, which is free; this is the few pages read again by the paid reader)` : w.lanes.plan.papers ? ` (${w.lanes.plan.papers} of ${w.papers} read on the plan, which is free)` : ''}`);
      L.push(`• extra checks: ${usd(w.split.extra)}`);
    }
    const lane = (k: Lane, label: string) => `${label} ${w.lanes[k].papers}${w.lanes[k].avg != null ? ` (${usd(w.lanes[k].avg!)} each)` : ''}`;
    L.push(`By lane (each paper's first marking): ${lane('plan', 'plan')} · ${lane('api', 'paid reader')} · ${lane('batch', 'half-price')}`);
  }
  L.push('');
  const proj = w.month.projected != null ? `; at this rate about ${usd(w.month.projected)} for ${w.month.label}` : '';
  L.push(w.month.days >= w.month.daysInMonth
    ? `${w.month.label} in full: ${usd(w.month.spent)} on marking.`
    : `${w.month.label} so far (${w.month.days} day${w.month.days === 1 ? '' : 's'}): ${usd(w.month.spent)} on marking${proj}.`);
  if (w.testsWeek >= 0.5) L.push(`Tests running cost ${usd(w.testsWeek)} this week (kept out of the paper price).`);
  L.push('');
  if (w.savings.length) {
    L.push('Ready to save (passed their test):');
    for (const s of w.savings) L.push(`• ${s.line}`);
  } else {
    L.push('No saving has passed its test yet.');
  }
  if (w.testing.length) L.push(`Still being tested: ${w.testing.map(t => TEST_NAME[t.name] || t.name).join(', ')}.`);
  return L.join('\n');
}
