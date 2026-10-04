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
export type PaperNoticeKind = 'pages-recovered' | 'marks-realigned' | 'marks-recalibrated' | 'pages-added' | 'missing-questions' | 'total-corrected';

export type PaperNotice = {
  kind: PaperNoticeKind;
  /** When the copy changed — ISO. */
  at: string;
  /** When the line stops being shown — ISO. */
  until: string;
  /** 'missing-questions' only: what the paper came back without. */
  missing?: { q: number; part?: string }[];
  /** 'total-corrected' only: what the paper was wrongly out of, and what it is out of now. */
  fromMax?: number;
  toMax?: number;
  /**
   * A read-once notice (`total-corrected`): when the STUDENT first saw it — ISO.
   * Absent = not seen yet. Once stamped the line is never shown again; `until`
   * is only the safety net for a student who never opens the app.
   */
  seen_at?: string;
};

/** What the student reads. */
export type PaperNoticeText = {
  kind: PaperNoticeKind; title: string; body: string;
  /** Show the ➕ Add missing pages door under the line. */
  addPages?: boolean;
};

/** How long a notice stands. Adrian, 14 Sep 2026. */
export const NOTICE_DAYS = 3;

/**
 * Notices that go away once the student has READ them, not after a fixed few
 * days (Adrian, 5 Oct 2026, on six E Math papers shown out of 90: "put a small
 * note that disappears upon first read"). The news is one fact about one paper
 * — the total was wrong, it is right now — so the first look is the whole job;
 * leaving it up for days only makes a corrected paper look like a problem one.
 * `until` still applies, as a safety expiry, so a stamp nobody sees cannot
 * stand forever.
 */
export const READ_ONCE_KINDS: readonly PaperNoticeKind[] = ['total-corrected'];
/** The safety expiry of a read-once notice. */
export const READ_ONCE_DAYS = 30;

export function isReadOnce(kind: PaperNoticeKind): boolean {
  return READ_ONCE_KINDS.includes(kind);
}

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
  // The paper's TOTAL was corrected (29 Sep 2026, Isabelle's Queenstown Prelim
  // Chemistry: 70/90 → 70/80 — the cover says Section A 70 + one Section B
  // question 10). Adrian: "Just reissue, saying marks have been recalibrated. Do
  // not mention me." No name, no "checked", no re-mark: the marks she earned did
  // not move, only what the paper is out of.
  'marks-recalibrated': {
    kind: 'marks-recalibrated',
    title: 'Your marks have been recalibrated',
    body: "The total for this paper has been corrected. Your updated copy is here.",
  },
  // ➕ The student added pages after the paper came back (29 Sep 2026, SPEC-HANDIN-
  // COMPLETENESS phase 3): only those pages were marked; the rest kept its marking.
  'pages-added': {
    kind: 'pages-added',
    title: 'Your added pages are marked',
    body: 'The pages you added are marked and your paper is updated — the new total is on the cover.',
  },
  // 🕳 The backstop (SPEC-HANDIN-COMPLETENESS ⑥, 30 Sep 2026): the paper came back
  // without questions nobody said were left undone. The body names them — built in
  // activePaperNotice from the stamp's `missing`; this is the fallback.
  'missing-questions': {
    kind: 'missing-questions',
    title: 'Some questions are not in your photos',
    body: "If you did them, add those pages.",
    addPages: true,
  },
  // 🔢 The paper's "out of" was wrong (5 Oct 2026: six old-syllabus E Math
  // papers — Paper 1 is out of 80 and Paper 2 out of 100 — shown out of 90).
  // Adrian: "saying total marks were incorrect, now amended to correct total
  // marks something like that - do not mention adrian". The body is built from
  // the stamp's numbers in activePaperNotice; this is the fallback. No name, no
  // "checked", no "re-marked": the marks earned did not move, and the last
  // sentence says so.
  'total-corrected': {
    kind: 'total-corrected',
    title: 'Total marks corrected',
    body: "This paper's total was shown wrongly. It is correct now. Your marks did not change.",
  },
};

function isKind(v: unknown): v is PaperNoticeKind {
  return v === 'pages-recovered' || v === 'marks-realigned' || v === 'marks-recalibrated' || v === 'pages-added' || v === 'missing-questions' || v === 'total-corrected';
}

/** The stamp to write on `result_json.student_notice`. */
export function buildPaperNotice(
  kind: PaperNoticeKind,
  opts: { at?: string | Date; days?: number; missing?: { q: number; part?: string }[]; fromMax?: number; toMax?: number } = {},
): PaperNotice {
  const at = opts.at ? new Date(opts.at) : new Date();
  const days = Number.isFinite(opts.days) ? Number(opts.days) : isReadOnce(kind) ? READ_ONCE_DAYS : NOTICE_DAYS;
  const until = new Date(at.getTime() + days * 86_400_000);
  const missing = kind === 'missing-questions' ? cleanRefs(opts.missing) : [];
  const totals = kind === 'total-corrected' ? cleanTotals(opts.fromMax, opts.toMax) : {};
  return { kind, at: at.toISOString(), until: until.toISOString(), ...(missing.length ? { missing } : {}), ...totals };
}

/** Both totals, or neither — a half-told correction falls back to the plain wording. */
function cleanTotals(from: unknown, to: unknown): { fromMax?: number; toMax?: number } {
  const f = Number(from), t = Number(to);
  const ok = (n: number) => Number.isInteger(n) && n > 0 && n <= 500;
  return ok(f) && ok(t) && f !== t ? { fromMax: f, toMax: t } : {};
}

function cleanRefs(x: unknown): { q: number; part?: string }[] {
  if (!Array.isArray(x)) return [];
  const out: { q: number; part?: string }[] = [];
  for (const m of x.slice(0, 40)) {
    const q = Number((m as { q?: unknown })?.q);
    if (!Number.isInteger(q) || q < 1 || q > 99) continue;
    const part = (m as { part?: unknown })?.part;
    out.push(typeof part === 'string' && /^[a-h]$/.test(part) ? { q, part } : { q });
  }
  return out;
}

/** "Q4, Q7(b) and Q9" */
export function describeRefs(refs: { q: number; part?: string }[]): string {
  const r = refs.map((m) => (m.part ? `Q${m.q}(${m.part})` : `Q${m.q}`));
  return r.length <= 1 ? r.join('') : `${r.slice(0, -1).join(', ')} and ${r[r.length - 1]}`;
}

/** Parse whatever is stored, without trusting it. Null when there is no usable notice. */
export function parsePaperNotice(raw: unknown): PaperNotice | null {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!r || !isKind(r.kind)) return null;
  const at = typeof r.at === 'string' ? r.at : '';
  const until = typeof r.until === 'string' ? r.until : '';
  if (!until || Number.isNaN(Date.parse(until))) return null;
  const missing = r.kind === 'missing-questions' ? cleanRefs(r.missing) : [];
  const totals = r.kind === 'total-corrected' ? cleanTotals(r.fromMax, r.toMax) : {};
  const seen = typeof r.seen_at === 'string' && !Number.isNaN(Date.parse(r.seen_at)) ? { seen_at: r.seen_at } : {};
  return { kind: r.kind, at, until, ...(missing.length ? { missing } : {}), ...totals, ...seen };
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
  // Read once: the render that stamps `seen_at` already has this text in hand
  // (noticeView reads before it stamps), so every render after it shows nothing.
  if (isReadOnce(notice.kind) && notice.seen_at) return null;
  if (notice.kind === 'total-corrected' && notice.fromMax && notice.toMax) {
    return {
      ...TEXT['total-corrected'],
      body: `This paper's total was shown as out of ${notice.fromMax} by mistake. It is now out of ${notice.toMax}. Your marks did not change.`,
    };
  }
  if (notice.kind === 'missing-questions' && notice.missing?.length) {
    const n = notice.missing.length;
    return {
      ...TEXT['missing-questions'],
      title: `We can't see ${describeRefs(notice.missing.slice(0, 10))}${n > 10 ? ' and more' : ''} in your photos`,
      body: `If you did ${n === 1 ? 'it' : 'them'}, add ${n === 1 ? 'that page' : 'those pages'}.`,
    };
  }
  return TEXT[notice.kind];
}

/**
 * Who is looking at a paper — decides whether a read-once notice counts as read.
 * `admin` covers Adrian's cookie in every form, "view as student" included: he
 * may see the line (so he can check it), but his look is not the student's.
 */
export type NoticeViewer = 'student' | 'admin';

/**
 * The line to show for one run AND whether this render is the student's first
 * read of a read-once notice (so the caller stamps `seen_at`). Pure.
 *
 *   unseen, student → shown, stamp
 *   unseen, admin   → shown, no stamp
 *   seen            → not shown, no stamp
 *   past `until`    → not shown, no stamp
 *   a timed kind    → as activePaperNotice, never a stamp
 */
export function noticeView(
  resultJson: unknown,
  opts: { viewer: NoticeViewer; now?: Date },
): { text: PaperNoticeText | null; stampSeen: boolean } {
  const text = activePaperNotice(resultJson, opts.now ?? new Date());
  if (!text) return { text: null, stampSeen: false };
  return { text, stampSeen: opts.viewer === 'student' && isReadOnce(text.kind) };
}

/** The reading of a `notice` field off a request body. Unrecognised = no notice. */
export function parseNoticeKind(v: unknown): PaperNoticeKind | null {
  return isKind(v) ? v : null;
}

/**
 * The runs whose read-once notice this render shows to the STUDENT for the
 * first time — the ones the caller stamps `seen_at` on, after building the
 * page with the line in it. Pure; takes what the page already built.
 */
export function readOnceToStamp(
  papers: { id: string; notice?: PaperNoticeText | null }[],
  viewer: NoticeViewer,
): string[] {
  if (viewer !== 'student') return [];
  return papers.filter(p => p.notice && isReadOnce(p.notice.kind)).map(p => p.id);
}
