// A short-lived line on a student's own paper — in the app, on the card.
//
// Adrian, 14 Sep 2026: "fix both, but put the message in the app (in the cards
// instead - don't send through telegram), and only have the message last for 3
// days".
//
// WHY A NOTICE AND NOT A MESSAGE. When a marked copy is replaced, the student
// has to be told — otherwise pages appear out of nowhere and the copy they
// showed a parent no longer matches. Until now the only way to tell them was
// lib/reissue-message.ts, which is a Telegram line in Adrian's name. That is the
// right channel for "Adrian checked your paper and changed a mark"; it is the
// wrong one for "the pages that were missing are there now" — it pings a
// teenager at 11pm about a piece of our own plumbing, and it costs Adrian's
// voice on something he did not do.
//
// So this kind of news sits where the paper sits: on the paper's card in
// /app/marking and at the top of /app/marking/[id]. Nothing is sent.
//
// AND IT EXPIRES. A banner that never leaves becomes furniture — the student
// stops reading it, and the next one is invisible too. Three days is long enough
// that anyone who opens the app in a normal week sees it once, and short enough
// that the card is clean again before their next paper. The expiry is a stored
// timestamp, not a "days since": the clock starts when the copy changed, so a
// notice never outlives its own news because a page was rendered late.
//
// Pure. The stamp lives on the run at `result_json.student_notice`.

/**
 * Why the student is being told.
 *
 * `marks-realigned` exists because `pages-recovered` was put on a card it was
 * false for (Joey Goh Zhi Xuan, 14 Sep 2026). None of her pages were missing —
 * every page uploaded, and the ticks and crosses landed away from the working
 * they belonged to, so the ink was re-placed. Telling her pages hadn't uploaded
 * would have been Alexis Wong's story in Joey's app. A notice is the one thing
 * on the card the student cannot check against anything else, so the reason has
 * to be the reason: a new kind, not the nearest existing one.
 */
export type PaperNoticeKind = 'pages-recovered' | 'marks-realigned';

export type PaperNotice = {
  kind: PaperNoticeKind;
  /** When the copy changed — ISO. */
  at: string;
  /** When the line stops being shown — ISO. */
  until: string;
};

/** What the student reads. */
export type PaperNoticeText = { kind: PaperNoticeKind; title: string; body: string };

/** How long a notice stands. Adrian, 14 Sep 2026. */
export const NOTICE_DAYS = 3;

const TEXT: Record<PaperNoticeKind, PaperNoticeText> = {
  // Not "redrawn", not "re-marked", no new score — none of that happened
  // (Adrian, 14 Sep 2026: "don't tell her it's redrawn … some pages wasn't
  // uploaded properly previously, here is the full copy"). "Didn't upload
  // properly" is ours, not theirs, and saying the mark is unchanged stops a
  // student reading a replaced copy as a re-grade.
  'pages-recovered': {
    kind: 'pages-recovered',
    title: 'Your full paper is here',
    body: "Some pages didn't upload properly the first time, so they were missing from your copy. The whole paper is in the app now — your mark hasn't changed.",
  },
  // Adrian's wording, 14 Sep 2026, picked over two others. Every phrase in it is
  // load-bearing:
  //   • never "re-marked" — that is the word that makes a student open the paper
  //     asking whether their score moved. It did not.
  //   • never "placement issues" — our jargon for our own defect.
  //   • the pages are not named. A list invites a page-by-page audit of marking
  //     that did not change; "some pages" is true and closes the matter.
  //   • the mark goes last, so it is the sentence they leave with.
  'marks-realigned': {
    kind: 'marks-realigned',
    title: 'A fix to your marked copy',
    body: "On some pages the ticks and crosses didn't line up with your working. They do now. Nothing about the marking changed, and neither did your mark.",
  },
};

function isKind(v: unknown): v is PaperNoticeKind {
  return v === 'pages-recovered' || v === 'marks-realigned';
}

/** The stamp to write on `result_json.student_notice`. */
export function buildPaperNotice(
  kind: PaperNoticeKind,
  opts: { at?: string | Date; days?: number } = {},
): PaperNotice {
  const at = opts.at ? new Date(opts.at) : new Date();
  const days = Number.isFinite(opts.days) ? Number(opts.days) : NOTICE_DAYS;
  const until = new Date(at.getTime() + days * 86_400_000);
  return { kind, at: at.toISOString(), until: until.toISOString() };
}

/** Parse whatever is stored, without trusting it. Null when there is no usable notice. */
export function parsePaperNotice(raw: unknown): PaperNotice | null {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!r || !isKind(r.kind)) return null;
  const at = typeof r.at === 'string' ? r.at : '';
  const until = typeof r.until === 'string' ? r.until : '';
  if (!until || Number.isNaN(Date.parse(until))) return null;
  return { kind: r.kind, at, until };
}

/**
 * The line to show for one run, or null. Reads `result_json.student_notice`.
 *
 * A notice past its `until` is simply not returned — the stamp stays on the run
 * as the record that the student was told, which is what a later question
 * ("did she ever see this?") needs.
 */
export function activePaperNotice(resultJson: unknown, now: Date = new Date()): PaperNoticeText | null {
  const rj = resultJson && typeof resultJson === 'object' ? (resultJson as Record<string, unknown>) : null;
  const notice = parsePaperNotice(rj?.student_notice);
  if (!notice) return null;
  if (Date.parse(notice.until) <= now.getTime()) return null;
  return TEXT[notice.kind];
}

/** The reading of a `notice` field off a request body. Unrecognised = no notice. */
export function parseNoticeKind(v: unknown): PaperNoticeKind | null {
  return isKind(v) ? v : null;
}
