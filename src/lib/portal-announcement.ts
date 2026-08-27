// Portal announcements — the "we added something new" card a student sees once.
//
// ONE live announcement at a time, shipped in code (no DB, no admin UI — solo
// maintenance): to announce a release, edit CURRENT_ANNOUNCEMENT below and
// deploy; to retire it early, set it back to null. Dismissal is remembered per
// device against the announcement's id (localStorage), so redeploys never
// re-nag — only a NEW id shows again, exactly once. The card renders at the top
// of every /app page (components/PortalAnnouncementCard.tsx, wired in
// src/app/app/layout.tsx).
//
// This is the in-portal half of announcing a feature. The Telegram half stays a
// separate, manual act (Adrian sends it, or a future bot /announce command) —
// admin web actions are silent by policy, so nothing here messages anyone.
export type PortalAnnouncement = {
  /** Stable unique id — dismissal is stored against it. Convention: YYYY-MM-slug. */
  id: string;
  emoji: string;
  title: string;
  body: string;
  /** Optional call-to-action link into the portal. */
  cta?: { label: string; href: string };
  /**
   * Hide from marking-only beta students (lib/portal-beta.ts) when the feature
   * being announced lives behind the full-portal switch.
   */
  fullPortalOnly?: boolean;
  /**
   * Last day the card shows (YYYY-MM-DD, SGT) — after this it hides on its own
   * even if never dismissed. Convention: launch day + ~14 days (Adrian,
   * 2026-08-28: a NEW card must not sit there forever). Omit = no auto-expiry.
   */
  until?: string;
};

/** localStorage key that marks one announcement as dismissed on this device. */
export function announcementKey(id: string): string {
  return `portal_announcement_${id}`;
}

// Retired 2026-08-28 (Adrian: only show a NEW card when something is actually
// new). Example shape, with the ~2-week expiry convention:
//   { id: '2026-08-daily-slot', emoji: '🎟️', title: 'Hand-ins now run on a daily slot',
//     body: '…', cta: { label: 'Hand in a paper', href: '/app/submit' }, until: '2026-09-08' }
export const CURRENT_ANNOUNCEMENT: PortalAnnouncement | null = {
  id: '2026-08-mock-papers',
  emoji: '🖨️',
  title: 'Print real mock exam papers',
  body: 'Build a full 90-mark mock — proper cover page, timing and answer key — print it, sit it, then hand it in for marking. Also new: ✂️ save parts of marked papers into My Notes, and paper-ready notifications in Settings.',
  cta: { label: 'Print a paper', href: '/app/print' },
  until: '2026-09-11',
};

/** The announcement to show today — null when none is set or it has expired. */
export function activeAnnouncement(now: Date = new Date()): PortalAnnouncement | null {
  const a = CURRENT_ANNOUNCEMENT;
  if (!a) return null;
  if (a.until) {
    // SGT day comparison — the card dies at midnight Singapore time.
    const today = new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
    if (today > a.until) return null;
  }
  return a;
}
