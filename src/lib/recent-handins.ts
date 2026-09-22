// 📥 "Handed in this week" — the frame at the top of Adrian's Papers tab
// (Adrian, 22 Sep 2026: "put the papers that were submitted in the past week in
// a box section on its own … for me only, not for students, and allow me to drag
// and drop to move the paper out of the frame when I am done with it").
// A paper sits in the frame while its hand-in is within RECENT_DAYS and Adrian has
// not dragged it out (paper_marking_runs.recent_done_at). Students never see it.

export const RECENT_DAYS = 7;

export function isRecentHandin(
  row: { created_at?: string | null; recent_done_at?: string | null } | null | undefined,
  nowMs: number,
  days = RECENT_DAYS,
): boolean {
  if (!row?.created_at || row.recent_done_at) return false;
  const t = Date.parse(row.created_at);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= days * 86_400_000 && t <= nowMs + 60_000;
}
