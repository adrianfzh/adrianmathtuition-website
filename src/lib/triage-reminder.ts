// ─── Daily "papers waiting in triage" reminder ───────────────────────────────
//
// Every marking failure notifies Adrian exactly ONCE (the doorbell message when
// a run lands unreleased, or the ⚠ queue-failed alert) — after that the only
// backstops were passive: the hub ⏳ card and /admin/ops, both of which he has
// to open. A held script could therefore sit in triage for days without another
// word. This composes the daily nag that closes that gap (Adrian approved,
// 2026-08-29).
//
// Pure on purpose: the route fetches rows with the SAME filter as the triage
// GET (`released_at IS NULL`, ≤14 days, `result_json.results` present) so the
// number here always equals the scripts count on /admin/mark/triage — a
// reminder that says 3 when the page shows 2 teaches Adrian to distrust both.

export interface WaitingRun {
  paperName: string;
  studentName: string | null;
  /** Flagged questions still unresolved — 0 means the script is ready to release. */
  flaggedCount: number;
  createdAt: string; // ISO
}

const TRIAGE_URL = 'https://www.adrianmathtuition.com/admin/mark/triage';
const MAX_LINES = 8;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function waitedLabel(createdAt: string, now: Date): string {
  const ms = now.getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'today';
  const days = Math.floor(ms / 86400_000);
  return days <= 0 ? 'today' : `${days}d`;
}

/**
 * The reminder text (Telegram HTML), or null when nothing is waiting —
 * null means "send nothing", so a quiet triage stays a quiet phone.
 */
export function triageReminderMessage(runs: WaitingRun[], now: Date): string | null {
  if (runs.length === 0) return null;

  const sorted = [...runs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const ready = sorted.filter(r => r.flaggedCount === 0).length;
  const flagged = sorted.reduce((n, r) => n + r.flaggedCount, 0);

  const head =
    `🗂 <b>${sorted.length} marked paper${sorted.length === 1 ? '' : 's'} waiting in triage</b>` +
    (flagged > 0 ? ` — ${flagged} question${flagged === 1 ? '' : 's'} to check` : '') +
    (ready > 0 ? `, ${ready} ready to release` : '');

  const lines = sorted.slice(0, MAX_LINES).map(r => {
    const who = r.studentName ? escapeHtml(r.studentName) : 'untagged';
    const state = r.flaggedCount > 0 ? `${r.flaggedCount} to check` : 'ready';
    return `• ${escapeHtml(r.paperName)} — ${who} · ${state} · ${waitedLabel(r.createdAt, now)}`;
  });
  if (sorted.length > MAX_LINES) {
    lines.push(`…and ${sorted.length - MAX_LINES} more`);
  }

  return [head, ...lines, TRIAGE_URL].join('\n');
}
