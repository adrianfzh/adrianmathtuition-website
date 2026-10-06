// Re-crop a figure whose crop swallowed the whole question (7 Oct 2026, Adrian: "yes").
//
// The science figure sweep of 4 Oct 2026 held ~800 figures as `foreign · cosmetic` whose
// notes read "ripple tank … whole and agrees; question number 25, prose and options A–D are
// inside the frame". The figure is right and complete — the crop is just too big — and a
// science image question is served only once its row is clean, so ~800 good questions were
// hidden for a cosmetic reason. This is the inverse of lib/figure-blemish.ts: that asks
// where the FOREIGN mark is and erases inside the box; this asks for the boxes that HOLD
// the figure and crops to them. Same second-look pattern: nothing is accepted until a
// before/after comparison says no part of the figure was lost.
//
// His five rules (docs/HANDOFF-SCIENCE-RECROP.md):
//  1. the diagram only — the question number and printed sentences go (the app shows the
//     question as typed text);
//  2. the options STAY when the options are pictures;
//  3. anything showing a school's name, crest, footer or an "internal circulation" line is
//     REFUSED and stays hidden — never scrub a mark (docs/CONTENT-POLICY.md rule 3);
//  4. the original is kept every time (the caller's job: a new object, a revert ledger);
//  5. the new crop goes through the five-point fitness check before anything is released.
//
// Pure: prompts, parsing and box arithmetic. The caller fetches, calls the model, uses
// sharp, and writes.

/** A box on the judge's 0–1000 grid (the same grid lib/figure-blemish judgeView draws). */
export type GridBox = { x0: number; y0: number; x1: number; y1: number };
export type PxBox = { x0: number; y0: number; x1: number; y1: number };
export type KeepPart = { what: string; box: GridBox; option?: boolean };
export type RecropVerdict = {
  keep: KeepPart[];
  drop: GridBox[];
  /** A school's name, crest, an identifying footer or an "internal circulation" line: refuse. */
  schoolMark: string | null;
  /** Plain page furniture ("Turn over", a page number) — reported, cropped away like prose. */
  furniture: string[];
  refuse: string | null;
};

export function recropPrompt(stem: string, note: string | null | undefined): string {
  return [
    'You are looking at an image cropped from a Singapore exam paper. A light blue grid is drawn over it:',
    'x100…x900 across, y100…y900 down, on a scale of 0–1000 in each direction. The crop is TOO BIG: it holds the',
    'diagram the student needs, but also the question number, printed sentences, and perhaps the answer options.',
    'The app shows the question and its options as typed text, so the picture should hold ONLY the diagram(s).',
    '',
    'The typed question:',
    String(stem || '').slice(0, 900),
    '',
    note ? `What an earlier check said about this crop: ${String(note).slice(0, 500)}` : '',
    '',
    'Give boxes on the 0–1000 grid. Answer with JSON only, no prose:',
    '{"keep":[{"what":"<a few words>","box":[x0,y0,x1,y1],"option":false}],',
    ' "drop":[[x0,y0,x1,y1]],',
    ' "school_mark":null,',
    ' "furniture":[],',
    ' "refuse":null}',
    '',
    'KEEP — one box per separate drawing, each box holding the WHOLE drawing with every label, axis title, scale,',
    'unit, arrow, key and its own caption ("Fig. 4.1") — leave a little margin, never cut a stroke or a letter:',
    '  • the diagram, graph, apparatus, circuit, structure or table of data the question is about;',
    '  • the answer options ONLY WHEN THEY ARE PICTURES (four graphs, four diagrams, four structures labelled',
    '    A B C D) — keep each with its letter and mark it "option":true. A student cannot answer without them.',
    'DROP — a box round each block that must go: the question number, sentences of the question, answer options',
    'that are words, numbers or a table of words, lines of a neighbouring question, handwriting.',
    'SCHOOL MARK — if ANYWHERE in the image there is a school\'s name, a crest or logo, a footer or header that names',
    'the school or the paper (for example "Anglican High 2025 / 6091/01/Prelim/25"), or a line such as "for internal',
    'circulation only": set "school_mark" to what it says and where. Do not box it and do not try to keep it out.',
    'FURNITURE — plain page furniture that names nobody ("[Turn over", "END OF PAPER", a bare page number): list it',
    'in "furniture" and include it in "drop".',
    'REFUSE — set "refuse" to a short reason when no clean cut exists: there is no drawing at all; words of the',
    'question are printed INSIDE the drawing and cannot be separated from it; or you cannot tell what the student needs.',
    'When in doubt whether something is part of the drawing, KEEP it.',
  ].filter((l) => l !== '').join('\n');
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1000, Math.max(0, v)) : NaN);
function toBox(v: unknown): GridBox | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [a, b, c, d] = v.map(num);
  if ([a, b, c, d].some(Number.isNaN)) return null;
  const box = { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
  return box.x1 - box.x0 >= 10 && box.y1 - box.y0 >= 10 ? box : null;   // a sliver is not a drawing
}

/** Never throws. Anything unreadable is a refusal — a crop is not attempted on a guess. */
export function parseRecropVerdict(text: string): RecropVerdict {
  const fail = (why: string): RecropVerdict => ({ keep: [], drop: [], schoolMark: null, furniture: [], refuse: why });
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return fail('the judge returned no JSON');
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return fail('the judge\'s JSON did not parse'); }
  const keep: KeepPart[] = [];
  for (const k of Array.isArray(o.keep) ? o.keep : []) {
    const box = toBox((k as Record<string, unknown>)?.box);
    if (box) keep.push({ what: String((k as Record<string, unknown>).what ?? '').slice(0, 80), box, option: (k as Record<string, unknown>).option === true });
  }
  const drop = (Array.isArray(o.drop) ? o.drop : []).map(toBox).filter((b): b is GridBox => !!b);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 240) : null);
  const schoolMark = str(o.school_mark);
  const furniture = (Array.isArray(o.furniture) ? o.furniture : []).map(str).filter((s): s is string => !!s);
  let refuse = str(o.refuse);
  if (!refuse && !schoolMark && !keep.length) refuse = 'the judge kept nothing';
  return { keep, drop, schoolMark, furniture, refuse };
}

export const toPx = (b: GridBox, w: number, h: number): PxBox => ({
  x0: Math.floor((b.x0 / 1000) * w), y0: Math.floor((b.y0 / 1000) * h),
  x1: Math.ceil((b.x1 / 1000) * w), y1: Math.ceil((b.y1 / 1000) * h),
});

export const INK = 160;
/** How far an edge may walk outward looking for blank paper, as a share of that side. */
export const SNAP_REACH = 0.04;
export const PAD_PX = 8;

/**
 * Move each edge of a box OUTWARD until the line it sits on is blank paper, so the cut never
 * runs through a stroke or a letter of the drawing (the judge's boxes are good to a few
 * grid units, not to the pixel). It stops after SNAP_REACH of the side — a box whose edge
 * is still in ink then is reported `sliced`, and the caller's second look decides.
 */
export function snapOutward(grey: Uint8Array | Buffer, w: number, h: number, b: PxBox, ink = INK, reach = SNAP_REACH): { box: PxBox; sliced: boolean } {
  const box = { x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(w, b.x1), y1: Math.min(h, b.y1) };
  const rowInk = (y: number) => { for (let x = box.x0; x < box.x1; x++) if (grey[y * w + x] < ink) return true; return false; };
  const colInk = (x: number) => { for (let y = box.y0; y < box.y1; y++) if (grey[y * w + x] < ink) return true; return false; };
  const maxY = Math.max(2, Math.round(h * reach)), maxX = Math.max(2, Math.round(w * reach));
  let sliced = false, n = 0;
  for (n = 0; box.y0 > 0 && rowInk(box.y0) && n < maxY; n++) box.y0--;
  if (box.y0 > 0 && rowInk(box.y0)) sliced = true;
  for (n = 0; box.y1 < h && rowInk(box.y1 - 1) && n < maxY; n++) box.y1++;
  if (box.y1 < h && rowInk(box.y1 - 1)) sliced = true;
  for (n = 0; box.x0 > 0 && colInk(box.x0) && n < maxX; n++) box.x0--;
  if (box.x0 > 0 && colInk(box.x0)) sliced = true;
  for (n = 0; box.x1 < w && colInk(box.x1 - 1) && n < maxX; n++) box.x1++;
  if (box.x1 < w && colInk(box.x1 - 1)) sliced = true;
  return { box, sliced };
}

export const pad = (b: PxBox, w: number, h: number, p = PAD_PX): PxBox => ({
  x0: Math.max(0, b.x0 - p), y0: Math.max(0, b.y0 - p), x1: Math.min(w, b.x1 + p), y1: Math.min(h, b.y1 + p),
});
const union = (a: PxBox, b: PxBox): PxBox => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const area = (b: PxBox) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const overlap = (a: PxBox, b: PxBox) => area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });

/** A dropped block counts as "in the way" when this share of it lies inside the union of the kept boxes. */
export const DROP_INSIDE = 0.35;

export type CropPlan =
  | { mode: 'single'; regions: [PxBox] }
  /** Kept drawings with dropped text between them: each is cut out and they are stacked top to bottom. */
  | { mode: 'stack'; regions: PxBox[] };

/**
 * One cut when nothing dropped lies between the kept drawings; otherwise the kept drawings
 * are cut out one by one and stacked in reading order (rows top to bottom, left to right
 * within a row) — the picture loses the sentences between them and nothing else.
 */
export function planCrop(keep: PxBox[], drop: PxBox[]): CropPlan | null {
  if (!keep.length) return null;
  const all = keep.reduce(union);
  const inTheWay = drop.some((d) => area(d) > 0 && overlap(d, all) / area(d) >= DROP_INSIDE);
  if (!inTheWay || keep.length === 1) return { mode: 'single', regions: [all] };
  // rows: boxes whose vertical spans overlap by half the shorter one belong to one row
  const sorted = [...keep].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rows: PxBox[][] = [];
  for (const b of sorted) {
    const row = rows.find((r) => r.some((o) => Math.min(o.y1, b.y1) - Math.max(o.y0, b.y0) >= 0.5 * Math.min(o.y1 - o.y0, b.y1 - b.y0)));
    if (row) row.push(b); else rows.push([b]);
  }
  // a row is cut as ONE region (its drawings keep their side-by-side layout) unless a dropped block sits inside it
  const regions: PxBox[] = [];
  for (const row of rows) {
    const u = row.reduce(union);
    const blocked = drop.some((d) => area(d) > 0 && overlap(d, u) / area(d) >= DROP_INSIDE);
    if (blocked) regions.push(...row.sort((a, b) => a.x0 - b.x0)); else regions.push(u);
  }
  return regions.length === 1 ? { mode: 'single', regions: [regions[0]] } : { mode: 'stack', regions };
}

/** Share of the original's area that survives — a "re-crop" that keeps nearly everything cut nothing. */
export function keptShare(plan: CropPlan, w: number, h: number): number {
  return plan.regions.reduce((a, r) => a + area(r), 0) / Math.max(1, w * h);
}

// ── the second look ──────────────────────────────────────────────────────────
export type RecropCheck = { ok: boolean; lost: string[]; leftover: string[]; note: string };

export function recropVerifyPrompt(stem: string): string {
  return [
    'Two images. FIRST: an exam-paper crop that held a diagram together with the question number, printed sentences',
    'and perhaps answer options. SECOND: a new, tighter picture made from it, meant to hold ONLY the diagram(s) —',
    'and the answer options when the options are pictures. The question itself is shown to the student as typed text:',
    String(stem || '').slice(0, 700),
    '',
    'Compare them and answer with JSON only:',
    '{"ok":true,"lost":[],"leftover":[]}',
    '"lost": every part of a drawing that is in the FIRST image and missing, cut through or clipped in the SECOND —',
    'a label, an axis title or number, a unit, an arrow head, a key, a caption such as "Fig. 4.1", a whole option',
    'picture or its letter. Look hard at the four edges of the second image.',
    '"leftover": anything in the SECOND image that is not a drawing: a question number, a sentence or part of one,',
    'answer options written as words or numbers, a line of another question, a footer, a school name.',
    'Labels and captions that belong to a drawing are part of it and are never leftover.',
    '"ok" is true only when both lists are empty.',
  ].join('\n');
}

export function parseRecropCheck(text: string): RecropCheck {
  const bad = (why: string): RecropCheck => ({ ok: false, lost: [why], leftover: [], note: 'unverified' });
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return bad('the second look returned no JSON');
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return bad('the second look\'s JSON did not parse'); }
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  const lost = list(o.lost), leftover = list(o.leftover);
  const ok = o.ok === true && !lost.length && !leftover.length;
  return { ok, lost, leftover, note: ok ? 'a second look: nothing of the figure lost, nothing else left in' : [lost.length ? `lost: ${lost.join('; ')}` : '', leftover.length ? `still in: ${leftover.join('; ')}` : ''].filter(Boolean).join(' · ') };
}

/** What happens to one figure. Only `recrop` may go on to the fitness check. */
export type RecropOutcome = 'recrop' | 'refused-school-mark' | 'refused' | 'failed-check';

export function outcomeOf(v: RecropVerdict, check: RecropCheck | null, share: number | null): { outcome: RecropOutcome; why: string } {
  if (v.schoolMark) return { outcome: 'refused-school-mark', why: v.schoolMark };
  if (v.refuse) return { outcome: 'refused', why: v.refuse };
  if (share != null && share > 0.97) return { outcome: 'refused', why: 'the cut would keep nearly the whole image — nothing to gain' };
  if (!check) return { outcome: 'failed-check', why: 'no second look' };
  if (!check.ok) return { outcome: 'failed-check', why: check.note };
  return { outcome: 'recrop', why: check.note };
}

// ── releasing a prepared re-crop ─────────────────────────────────────────────
// A release points the question at the new picture. The original object stays in the
// bucket and every swap is logged (figure_clean_log), so pointing the field back at
// old_path undoes it. Pure: the fields in, the patch out.

export type FigureFields = { image_url?: unknown; images?: unknown; parts?: unknown; question_text?: unknown };
export type SwapResult = { patch: Record<string, unknown>; fields: string[]; count: number };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace the picture's NAME wherever the question points at it: the stem `image_url`
 * (a bare name or a JSON-array string), `images`, a part's slot inside `parts`, and an
 * inline `{{IMG:…}}` in the text. A name is matched whole — never inside a longer name —
 * with or without the `question_images/` prefix, which is kept as it was.
 */
export function swapFigureRef(row: FigureFields, oldName: string, newName: string): SwapResult {
  const bare = (s: string) => s.replace(/^(question_images\/)+/, '');
  const re = new RegExp(`(?<![\\w.%-])${escapeRe(bare(oldName))}(?![\\w.-])`, 'g');
  const patch: Record<string, unknown> = {}; const fields: string[] = []; let count = 0;
  const sub = (s: string) => { let n = 0; const out = s.replace(re, () => { n++; return bare(newName); }); return { out, n }; };
  for (const f of ['image_url', 'question_text'] as const) {
    const v = row[f];
    if (typeof v !== 'string' || !v) continue;
    const { out, n } = sub(v);
    if (n) { patch[f] = out; fields.push(f); count += n; }
  }
  for (const f of ['images', 'parts'] as const) {
    const v = row[f];
    if (v == null) continue;
    const { out, n } = sub(JSON.stringify(v));
    if (n) { patch[f] = JSON.parse(out); fields.push(f); count += n; }
  }
  return { patch, fields, count };
}

/** What Adrian's release writes on the flag — the sweep's own note stays behind the prefix. */
export const RECROP_NOTE_PREFIX = 'Adrian: re-cropped · ';

// ── the fitness check on the new picture, and the one correction ─────────────
export const FITNESS_WORDS = ['ok', 'unsure', 'incomplete', 'illegible', 'foreign', 'wrong-kind', 'watermark', 'mismatch', 'missing-object', 'wrong-figure', 'answer-leak'] as const;

export function fitnessPrompt(law: string, stem: string, answer: string): string {
  return [
    'You are the figure-fitness judge for a question bank. The rules are below, verbatim from the bank\'s law.',
    'Judge the ONE image you are shown against the typed question it belongs to. You do not have the source page,',
    'so judge what can be judged from the image and the question: (a) it belongs to this question, (b) it is whole',
    'and carries nothing foreign, (c) it does not hand over the answer, (d) it is legible, (e) it carries no watermark.',
    'Note: this picture was deliberately cut to the drawing only — the question number and sentences are typed',
    'beside it in the app, so their ABSENCE is correct and is not "incomplete".',
    '', '--- LAW ---', law.slice(0, 9000), '--- END LAW ---', '',
    'The typed question:', stem.slice(0, 1200), answer ? `The answer on file: ${answer.slice(0, 200)}` : '', '',
    `Answer with JSON only: {"verdict":"<one of ${FITNESS_WORDS.join(' | ')}>","severity":"<blocks-answering | cosmetic | none>","reason":"<one sentence>"}`,
  ].join('\n');
}

export type Fitness = { verdict: string; severity: string; reason: string };
/** Never throws; a verdict outside the vocabulary is `unsure`, which holds the figure. */
export function parseFitness(v: unknown): Fitness {
  let o: Record<string, unknown> = {};
  if (typeof v === 'string') { const m = v.match(/\{[\s\S]*\}/); try { o = m ? JSON.parse(m[0]) : {}; } catch { o = {}; } }
  else if (v && typeof v === 'object') o = v as Record<string, unknown>;
  const verdict = (FITNESS_WORDS as readonly string[]).includes(String(o.verdict)) ? String(o.verdict) : 'unsure';
  return { verdict, severity: String(o.severity ?? '').slice(0, 40), reason: String(o.reason ?? (verdict === 'unsure' ? 'no readable verdict' : '')).slice(0, 600) };
}

/** What the judge is told when the second look found a fault in the first cut. */
export function correctionNote(v: RecropVerdict, check: RecropCheck): string {
  return [
    'A FIRST CUT was made from these boxes and checked against the original:',
    JSON.stringify({ keep: v.keep.map((k) => ({ what: k.what, box: [k.box.x0, k.box.y0, k.box.x1, k.box.y1] })) }),
    `The check found — ${check.note}.`,
    'Give corrected boxes: widen a box until every label, axis title, arrow and caption named as lost is inside it with a clear margin, and pull an edge in (or add a drop box) to leave out anything named as still in.',
  ].join('\n');
}

/** The one word for a figure's fate: would-release, held-by-fitness (…), or the outcome. */
export function finalOf(outcome: RecropOutcome, fitness: Fitness | null): string {
  if (outcome !== 'recrop') return outcome;
  return fitness?.verdict === 'ok' ? 'would-release' : `held-by-fitness (${fitness?.verdict ?? '?'})`;
}

/** The flags the re-crop is for: cosmetic · foreign, not yet decided by Adrian, and the note says the crop holds the question. */
export function isRecropCandidate(note: string | null | undefined): boolean {
  const n = String(note ?? '');
  return !n.startsWith('Adrian:') && /· cosmetic · foreign ·/i.test(n) && /(question number|prose|stem|options|whole question)/i.test(n);
}
