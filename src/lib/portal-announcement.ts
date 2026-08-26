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
};

/** localStorage key that marks one announcement as dismissed on this device. */
export function announcementKey(id: string): string {
  return `portal_announcement_${id}`;
}

export const CURRENT_ANNOUNCEMENT: PortalAnnouncement | null = {
  id: '2026-08-daily-slot',
  emoji: '🎟️',
  title: 'Hand-ins now run on a daily slot',
  body: 'Every day you get one hand-in slot — photograph a finished paper, send it in, and it comes back marked. Your slot renews at midnight.',
  cta: { label: 'Hand in a paper', href: '/app/submit' },
};
