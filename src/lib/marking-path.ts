// lib/marking-path.ts — which bill did a marking land on? (2 Sep 2026)
//
// A marked paper is either the Mac's (plan usage — the reads were done in a
// headless Claude Code session and handed back; `cost_usd` then only carries
// the bot's own extras) or the API's (Fly marked it: the 🌙 batch queue at
// ~50%, ⚡ mark_now at full price, or the synchronous ▶ Mark button). Hand-ins
// (portal /app/submit, Telegram /handin) are ALWAYS API by Adrian's split, so
// they are counted apart — the plan share is a question about HIS papers only.
//
// Pure: the /admin/ops board feeds it the rows and shows the split. The
// classification reads the same `result_json.queue` the bot writes (lib/
// queue-pick.js on the bot side is the policy; this only reports the outcome).

export type MarkingPath = 'plan' | 'api-queue' | 'api-now' | 'api-sync';

export type MarkingRunRow = {
  created_at: string;
  total_max: number | null;
  cost_usd: number | string | null;
  num_photos?: number | null;
  result_json: {
    queue?: {
      queued_at?: string;
      mark_now?: boolean;
      external_claim?: { by?: string; at?: string; delivered_at?: string; released_at?: string } | null;
    } | null;
    portal_submission?: unknown;
    telegram_handin?: unknown;
  } | null;
};

export function isHandin(row: MarkingRunRow): boolean {
  const rj = row.result_json;
  return !!rj && (!!rj.portal_submission || !!rj.telegram_handin);
}

/** Where the marking reads came from. Only meaningful for a MARKED row. */
export function markingPath(row: MarkingRunRow): MarkingPath {
  const q = row.result_json?.queue;
  if (q?.external_claim?.delivered_at) return 'plan';
  if (q?.mark_now) return 'api-now';
  if (q?.queued_at) return 'api-queue';
  return 'api-sync';
}

export type PathTotals = { runs: number; costUsd: number; photos: number };
export type MarkingShare = {
  days: number;
  /** Adrian's own papers — the ones the Mac may take. `plan.costUsd` is the API extras on plan-marked runs. */
  own: { plan: PathTotals; api: PathTotals; byPath: Record<MarkingPath, number> };
  /** Student hand-ins: always API, by design. */
  handins: PathTotals;
  /** plan runs ÷ own runs, or null when there were no own papers in the window. */
  planShare: number | null;
};

const zero = (): PathTotals => ({ runs: 0, costUsd: 0, photos: 0 });
function add(t: PathTotals, row: MarkingRunRow) {
  t.runs += 1;
  t.costUsd += Number(row.cost_usd) || 0;
  t.photos += Number(row.num_photos) || 0;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Split the last `days` days of MARKED rows by bill. Unmarked rows are ignored. */
export function markingShare(rows: MarkingRunRow[], now: number, days: number): MarkingShare {
  const since = now - days * 24 * 60 * 60 * 1000;
  const own = { plan: zero(), api: zero(), byPath: { plan: 0, 'api-queue': 0, 'api-now': 0, 'api-sync': 0 } as Record<MarkingPath, number> };
  const handins = zero();
  for (const row of rows || []) {
    if (row.total_max == null) continue;
    const t = new Date(row.created_at).getTime();
    if (!Number.isFinite(t) || t < since || t > now) continue;
    if (isHandin(row)) { add(handins, row); continue; }
    const path = markingPath(row);
    own.byPath[path] += 1;
    add(path === 'plan' ? own.plan : own.api, row);
  }
  own.plan.costUsd = round2(own.plan.costUsd);
  own.api.costUsd = round2(own.api.costUsd);
  handins.costUsd = round2(handins.costUsd);
  const ownRuns = own.plan.runs + own.api.runs;
  return { days, own, handins, planShare: ownRuns ? own.plan.runs / ownRuns : null };
}

/**
 * Should the board flag the split? Amber when the Mac is losing: at least
 * `minRuns` of Adrian's own papers in the window and fewer than half went
 * to the plan. A quiet week (few papers) is not a signal.
 */
export function planShareLow(share: MarkingShare, minRuns = 3): boolean {
  const ownRuns = share.own.plan.runs + share.own.api.runs;
  return ownRuns >= minRuns && share.planShare != null && share.planShare < 0.5;
}
