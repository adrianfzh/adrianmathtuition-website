// The "science marking is open" notice on the Science tab — the one rule for
// when it shows, pure and tested.
//
// Adrian, 24 Sep 2026: "just put the notice at the science tab itself, so
// students will see it at the science tab. leave it there for one day after
// student go into that tab". So: the first time a device opens the tab, the
// moment is stamped (localStorage, like the other app notices); the notice
// stays for 24 hours from that stamp and then goes. No ✕ — it leaves by itself.
// Per device, on purpose: a second phone gets its own day, which is harmless,
// and nothing has to be written server-side for a one-day banner.

export const SCIENCE_NOTICE_KEY = 'portal_science_open_notice_seen_at';
export const SCIENCE_NOTICE_HOURS = 24;

export type ScienceNoticeState = {
  /** Render the notice? */
  show: boolean;
  /** The stamp to store (only set on the first visit; null = leave storage alone). */
  stamp: string | null;
};

/**
 * `stored` is what the device holds under SCIENCE_NOTICE_KEY (an ISO instant,
 * or null / garbage). Garbage counts as unseen and is re-stamped so a broken
 * value cannot pin the notice on forever.
 */
export function scienceNoticeState(stored: string | null | undefined, now: number = Date.now()): ScienceNoticeState {
  const seenAt = stored ? Date.parse(stored) : NaN;
  if (!Number.isFinite(seenAt)) return { show: true, stamp: new Date(now).toISOString() };
  const ageMs = now - seenAt;
  // a stamp from the future (clock moved) is treated as "just now", not as never-expiring
  if (ageMs < 0) return { show: true, stamp: new Date(now).toISOString() };
  return { show: ageMs < SCIENCE_NOTICE_HOURS * 3600_000, stamp: null };
}

/** The message, one paragraph per entry, exactly as Adrian wrote it (24 Sep 2026, second draft). */
export const SCIENCE_OPEN_NOTICE = {
  greeting: 'Dear students,',
  lead: 'Science marking is now open in the app. 🧪',
  paragraphs: [
    'It is meant to be a tool to help you prepare for your exams, not a replacement for your teacher. Please consult your teacher or tutor if you have any doubts about a mark or a comment.',
    'The total is an estimate, and answers to explain questions can be marked a little differently from how your school words them. If you have the answers or the mark scheme, attach them for better results.',
  ],
  limit: 'Limit: two papers a day. Extra papers wait for the next day, up to three days ahead.',
} as const;
