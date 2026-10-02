// ✅ Check fixes (30 Sep 2026) — the one page Adrian reviews repaired and
// redrawn figures on. Adrian: "i only need the fixed diagrams or redrawn
// diagrams in front of me, then i click approve or a comment to say why it is
// still not good enough, or just redraw".
//
// Three answers per card: Approve (the lanes' existing approve-candidate),
// "Not good enough" + a comment, or Redraw. The last two SEND THE CARD BACK:
// the candidate leaves candidates/ (so the page never shows it twice) and the
// flag's note says what to do next, in front of what was there. A repair
// session finds its work with `isSentBack` and reads the ask with `readSendBack`.
// Pure — the route does the storage and the write.

export type CheckLane = 'solution' | 'question';
export type SendBackAsk = 'redo' | 'redraw';

/** The decided prefix each lane already uses for "this still needs work" —
 *  kept, so a sent-back row stays on the list it was on (Solutions › Redraw,
 *  Fitness › Repair) and nothing else in the lanes changes. */
export const LANE_PREFIX: Record<CheckLane, string> = {
  solution: 'Adrian: redraw · ',
  question: 'Adrian: repair · ',
};

const ASK_WORD: Record<SendBackAsk, string> = {
  redo: 'redo',
  redraw: 'redraw from scratch',
};

/** "Adrian: repair · redo 30 Sep: the arrow points the wrong way · <what was there>".
 *  The newest ask sits first; an older ask stays behind it as history. */
export function sendBackNote(
  prior: string | null | undefined, lane: CheckLane, ask: SendBackAsk, comment: string | null | undefined, dateLabel: string,
): string {
  const head = LANE_PREFIX[lane];
  const bareHead = head.replace(/\s*·\s*$/, '');
  let rest = (prior ?? '').trim();
  if (rest.startsWith(head)) rest = rest.slice(head.length).trim();
  else if (rest === bareHead) rest = '';
  const words = (comment ?? '').replace(/\s+/g, ' ').trim();
  const mid = `${ASK_WORD[ask]} ${dateLabel}${words ? `: ${words}` : ''}`;
  return rest ? `${head}${mid} · ${rest}` : `${head}${mid}`;
}

const ASK_RE = /^Adrian: (?:redraw|repair) · (redo|redraw from scratch) (\d{1,2} [A-Z][a-z]{2})(?:: (.*?))?(?: · |$)/;

/** Is the NEWEST thing on this note a send-back from the Check page? */
export function isSentBack(note: string | null | undefined): boolean {
  return ASK_RE.test((note ?? '').trim());
}

/** The newest ask on a note: what to do, when, and Adrian's words. */
export function readSendBack(note: string | null | undefined): { ask: SendBackAsk; date: string; comment: string } | null {
  const m = ASK_RE.exec((note ?? '').trim());
  if (!m) return null;
  return { ask: m[1] === 'redo' ? 'redo' : 'redraw', date: m[2], comment: (m[3] ?? '').trim() };
}

/** "30 Sep" in Singapore time. */
export function sgtDayLabel(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }).format(at);
}

/** Where a sent-back candidate is kept so the redo session can look at what
 *  Adrian turned down: outside candidates/, one folder a day. */
export function sentBackObject(objectName: string, dayIso: string): string {
  return `sent-back/${dayIso}/${objectName}`;
}

/** Batch order for the page: the sidecar's "#B5-12" note puts a batch's cards
 *  together and in the order they were made; cards without one go last. */
export function batchKey(note: string | null | undefined): [number, number] {
  const m = /#B(\d+)-(\d+)/.exec(note ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
}

/** The reasons Adrian taps on a card that is not good enough — one tap each,
 *  free text optional (30 Sep 2026). */
export const REASON_CHIPS = ['caption inside', 'labels too small', 'crop', 'watermark', 'wrong figure', 'blurry'] as const;

/** Chips + his own words → the one comment the send-back note carries. */
export function reasonComment(chips: readonly string[], text: string | null | undefined): string {
  const words = (text ?? '').replace(/\s+/g, ' ').trim();
  return [...chips, ...(words ? [words] : [])].join('; ');
}

/** A smaller copy of a stored image, for the grid (Supabase's image transform):
 *  .../object/public/<bucket>/<key>?v=… → .../render/image/public/<bucket>/<key>?width=…&v=….
 *  Anything that is not a public Storage URL comes back as it was. */
export function sizedImageUrl(url: string, width: number): string {
  const i = url.indexOf('/storage/v1/object/public/');
  if (i < 0) return url;
  const [base, query] = url.split('?');
  const out = base.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  return `${out}?width=${Math.round(width)}&resize=contain${query ? `&${query}` : ''}`;
}
