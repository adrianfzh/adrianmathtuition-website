// 💰 The one loader for the Monday cost check (lib/weekly-cost.ts): this week's
// marked papers, the last four weeks' cheaper-helper shadows, the bot's ledger
// (Airtable CostLog) for the week and the month, the lever tests' bars
// (Supabase cost_lever_tests) and the cheaper-reader shadow's per-level verdicts.
import { getSupabaseAdmin } from './supabase';
import { airtableRequestAll } from './airtable';
import { sgtTodayISO, addDaysISO, sgtDayStart } from './sgt';
import { loadShadowSummary } from './shadow-read-store';
import type { WeekRun, LedgerRow, LeverTest, ReaderLevel, WeeklyCostInput } from './weekly-cost';

const RUN_COLS = 'id, created_at, paper_name, cost_usd, result_json->queue, result_json->usage, result_json->vision_usage, result_json->page_trim';
const SHADOW_COLS = 'id, created_at, paper_name, result_json->helper_shadow, result_json->classify_shadow';

function fold(rows: Record<string, unknown>[]): WeekRun[] {
  return rows.map((r) => ({
    id: String(r.id), created_at: String(r.created_at), paper_name: (r.paper_name as string) ?? null, cost_usd: (r.cost_usd as number) ?? null,
    result_json: {
      queue: (r.queue as never) ?? null,
      usage: (r.usage as never) ?? null, vision_usage: (r.vision_usage as never) ?? null, page_trim: (r.page_trim as never) ?? null,
      helper_shadow: (r.helper_shadow as never) ?? null, classify_shadow: (r.classify_shadow as never) ?? null,
    },
  }));
}

async function ledger(sinceDay: string): Promise<LedgerRow[]> {
  const qs = `?filterByFormula=${encodeURIComponent(`{Date}>='${sinceDay}'`)}&fields[]=Date&fields[]=Feature&fields[]=Model&fields[]=Total Cost USD&fields[]=Calls`;
  const data = await airtableRequestAll('CostLog', qs);
  return (data.records || []).map((r: { fields: Record<string, unknown> }) => ({
    date: String(r.fields['Date'] || ''), feature: String(r.fields['Feature'] || 'unknown'), model: String(r.fields['Model'] || 'unknown'),
    cost: Number(r.fields['Total Cost USD']) || 0, calls: Number(r.fields['Calls']) || 0,
  }));
}

/** The week = the seven SGT days ending yesterday. `now` pins a moment for a re-run. */
export async function loadWeeklyCost(now: number = Date.now()): Promise<WeeklyCostInput> {
  const today = sgtTodayISO(now);
  const weekEnd = addDaysISO(today, -1);
  const weekStart = addDaysISO(today, -7);
  // The month the week ends in — on the 1st that is last month, complete.
  const monthStart = `${weekEnd.slice(0, 7)}-01`;
  const sb = getSupabaseAdmin();
  const from = sgtDayStart(weekStart).toISOString(), to = sgtDayStart(today).toISOString();
  const since4w = new Date(now - 28 * 86_400_000).toISOString();
  const [runsQ, shadowQ, testsQ] = await Promise.all([
    sb.from('paper_marking_runs').select(RUN_COLS).gte('created_at', from).lt('created_at', to).not('result_json->usage', 'is', null).limit(1000),
    sb.from('paper_marking_runs').select(SHADOW_COLS).gte('created_at', since4w)
      .or('result_json->helper_shadow.not.is.null,result_json->classify_shadow.not.is.null').limit(1000),
    sb.from('cost_lever_tests').select('name, status, measure, saving_per_paper_usd, measured_at'),
  ]);
  if (runsQ.error) throw new Error(`runs: ${runsQ.error.message}`);
  if (shadowQ.error) throw new Error(`shadows: ${shadowQ.error.message}`);
  const ledgerRows = await ledger(monthStart < weekStart ? monthStart : weekStart);
  let readerLevels: ReaderLevel[] = [], readerNoisePct: number | null = null;
  try {
    const s = await loadShadowSummary(60);
    readerNoisePct = s.noise?.agree_pct ?? null;
    readerLevels = (s.arms[0]?.levels || []).map(l => ({ level: l.level, papers: l.papers, agreePct: l.agree_pct, passes: /a candidate/.test(l.verdict) }));
  } catch { /* the reader line is optional */ }
  return {
    weekStart, weekEnd, monthStart, today,
    runs: fold((runsQ.data ?? []) as unknown as Record<string, unknown>[]),
    shadowRuns: fold((shadowQ.data ?? []) as unknown as Record<string, unknown>[]),
    ledgerWeek: ledgerRows.filter(r => r.date >= weekStart && r.date <= weekEnd),
    ledgerMonth: ledgerRows.filter(r => r.date >= monthStart && r.date <= weekEnd),
    tests: (testsQ.error ? [] : (testsQ.data ?? [])) as LeverTest[],
    readerLevels, readerNoisePct,
  };
}
