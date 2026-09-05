// Pure helpers for the nightly Find-a-question review (SPEC-PORTAL-V2 §4):
// the plan-billed session on Adrian's Mac (scripts/find-review) reads
// yesterday's `portal_generation_log` rows through GET /api/admin/find-review,
// judges each match that reached a student, and POSTs verdicts back; the route
// stores them in `portal_generation_log.review` and Telegrams one digest.
// Everything here is IO-free so the body parser and the digest wording are
// unit-tested (testing policy in CLAUDE.md).
import type { FindTier } from './portal-find';

export const REVIEW_VERDICTS = ['similar', 'same-chapter', 'off'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const REVIEW_VERDICT_LABEL: Record<ReviewVerdict, string> = {
  similar: 'Similar',
  'same-chapter': 'Same chapter only',
  off: 'Off',
};

export type ReviewEntry = { id: string; verdict: ReviewVerdict; why: string };

/** What lands in `portal_generation_log.review`. */
export type StoredReview = ReviewEntry & { reviewed_at: string; by: string };

export const MAX_WHY = 300;
export const MAX_VERDICTS = 500;
export const REVIEWED_BY = 'find-review';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isReviewVerdict(v: unknown): v is ReviewVerdict {
  return typeof v === 'string' && (REVIEW_VERDICTS as readonly string[]).includes(v);
}

export function isReviewDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
}

export type ParsedReview =
  | { ok: true; date: string; verdicts: ReviewEntry[]; note: string | null }
  | { ok: false; error: string };

/**
 * POST /api/admin/find-review body: { date, verdicts:[{id, verdict, why}], note? }.
 * Every verdict needs a real ledger id, one of the three verdicts, and a
 * one-line why (the why IS the review — a bare verdict teaches nothing).
 * An empty verdict list is valid: a quiet day still posts, so the digest and
 * the logbook stamp happen whatever the day held.
 */
export function parseReviewBody(body: unknown): ParsedReview {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const b = body as { date?: unknown; verdicts?: unknown; note?: unknown };
  if (!isReviewDate(b.date)) return { ok: false, error: 'date must be YYYY-MM-DD' };
  if (!Array.isArray(b.verdicts)) return { ok: false, error: 'verdicts must be an array' };
  if (b.verdicts.length > MAX_VERDICTS) return { ok: false, error: `at most ${MAX_VERDICTS} verdicts per post` };
  const verdicts: ReviewEntry[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of b.verdicts.entries()) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: `verdicts[${i}] must be an object` };
    const v = raw as { id?: unknown; verdict?: unknown; why?: unknown };
    if (typeof v.id !== 'string' || !UUID_RE.test(v.id)) return { ok: false, error: `verdicts[${i}].id must be a ledger uuid` };
    if (seen.has(v.id)) return { ok: false, error: `verdicts[${i}].id repeats ${v.id}` };
    seen.add(v.id);
    if (!isReviewVerdict(v.verdict)) return { ok: false, error: `verdicts[${i}].verdict must be one of ${REVIEW_VERDICTS.join(' | ')}` };
    const why = typeof v.why === 'string' ? v.why.replace(/\s+/g, ' ').trim() : '';
    if (why.length < 3) return { ok: false, error: `verdicts[${i}].why must say why (one line)` };
    verdicts.push({ id: v.id, verdict: v.verdict, why: why.slice(0, MAX_WHY) });
  }
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 600) : null;
  return { ok: true, date: b.date, verdicts, note };
}

/** One ledger row as the digest needs it (the route shapes it from the joins). */
export type ReviewDayRow = {
  id: string;
  student: string | null;
  tier: FindTier | null;
  /** The find found nothing and no generation followed (or it failed). */
  miss: boolean;
  topic: string | null;
  subgroup: string | null;
};

export type ReviewCounts = {
  finds: number;
  similar: number;
  madeForYou: number;
  misses: number;
  judged: number;
  byVerdict: Record<ReviewVerdict, number>;
};

export function reviewCounts(rows: ReviewDayRow[], verdicts: ReviewEntry[]): ReviewCounts {
  const byVerdict: Record<ReviewVerdict, number> = { similar: 0, 'same-chapter': 0, off: 0 };
  const ids = new Set(rows.map((r) => r.id));
  let judged = 0;
  for (const v of verdicts) {
    if (!ids.has(v.id)) continue;
    judged++;
    byVerdict[v.verdict]++;
  }
  return {
    finds: rows.length,
    similar: rows.filter((r) => r.tier === 'similar').length,
    madeForYou: rows.filter((r) => r.tier === 'made-for-you').length,
    misses: rows.filter((r) => r.miss).length,
    judged,
    byVerdict,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "5 Sep" — hand-rolled so the wording does not drift with Node's ICU ("Sept"). */
function dayLabel(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MAX_LISTED = 8;

/**
 * The one-message Telegram digest (HTML, under 20 lines). Leads with the
 * misses — a "same chapter" that reached a student is the thing Adrian wants
 * to see at breakfast; the counts are context.
 */
export function reviewDigest(date: string, rows: ReviewDayRow[], verdicts: ReviewEntry[]): string {
  const c = reviewCounts(rows, verdicts);
  const head = `🔍 <b>Find review — ${dayLabel(date)}</b>`;
  if (!rows.length) return `${head}\nNo finds yesterday — nothing to judge.`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = [
    `${head} · ${c.finds} find${c.finds === 1 ? '' : 's'} · ${c.similar} similar · ${c.madeForYou} made for you · ${c.misses} nothing found`,
    `✅ Judged ${c.judged}: ${c.byVerdict.similar} similar · ${c.byVerdict['same-chapter']} same-chapter · ${c.byVerdict.off} off`,
  ];
  for (const verdict of ['same-chapter', 'off'] as const) {
    const hits = verdicts.filter((v) => v.verdict === verdict && byId.has(v.id));
    if (!hits.length) continue;
    lines.push(`${verdict === 'off' ? '⚠️' : '❌'} <b>${REVIEW_VERDICT_LABEL[verdict]}</b> (${hits.length}):`);
    for (const v of hits.slice(0, MAX_LISTED)) {
      const r = byId.get(v.id)!;
      const where = [r.topic, r.subgroup].filter(Boolean).join(' / ');
      lines.push(`• ${esc(r.student || 'a student')}${where ? ` · ${esc(where)}` : ''}${r.tier ? ` · ${r.tier}` : ''} — ${esc(v.why)}`);
    }
    if (hits.length > MAX_LISTED) lines.push(`• …and ${hits.length - MAX_LISTED} more`);
  }
  return lines.join('\n');
}

/** The one-line `job_runs.summary` for the logbook. */
export function reviewSummaryLine(counts: ReviewCounts): string {
  const misses = counts.byVerdict['same-chapter'] + counts.byVerdict.off;
  return `${counts.finds} finds · ${counts.judged} judged · ${misses} miss${misses === 1 ? '' : 'es'}`;
}
