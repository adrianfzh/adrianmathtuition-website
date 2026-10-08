// The worksheet PICKER's data model (8 Oct 2026, Adrian: "put the selected
// questions in a left panel, then I get to drag and drop to the right panel …
// click done, and you generate the pdf/docx according to the worksheet skills").
//
// Pure, client-safe. Turns the admin bank detail (GET /api/admin/questions?id=
// / ?ids=) into the shape both outputs share — the PDF (lib/render-bot-worksheet
// in its plain style) and the DOCX (lib/pick-worksheet-docx) — so the two can
// never disagree about what a question says, which parts carry marks, or what
// its [Ans:] line reads. The layout rules copied here are the create-worksheet
// skill's (worksheet_lib.py): one orange [Ans: (a) …; (b) …] line at the END of
// each question, never per part; working space ∝ marks, 4 lines a mark with one
// bonus line for a [1]; the school and year never printed.

export type PickPart = {
  label: string;
  text: string;
  marks: number | null;
  answer: string;
  /** Figures that belong to this part, in reading order (before the text, then after). */
  imagesBefore: string[];
  imagesAfter: string[];
  subparts: PickPart[];
};

export type PickQuestion = {
  id: string;
  /** Admin-only provenance for the picker cards; never printed. */
  provenance: string;
  marks: number | null;
  stem: string;
  images: string[];
  parts: PickPart[];
  /** Top-level answer when the row has no per-part answers. */
  answer: string;
  solution: string;
  /** Per-part solutions keyed like lib/solution-readability labelKey ("a", "b.ii"). */
  partSolutions: Record<string, string>;
  partAnswers: Record<string, string>;
  solutionImages: string[];
  topics: string[];
  level: string | null;
};

/** The admin detail row as the questions API returns it (only what we read). */
export type DetailRow = {
  id: string;
  school?: string | null;
  year?: number | null;
  paper?: string | null;
  examType?: string | null;
  qnum?: string | null;
  level?: string | null;
  topics?: string[] | null;
  marks?: number | null;
  questionMd?: string | null;
  parts?: unknown;
  solution?: string | null;
  answer?: string | null;
  images?: string[] | null;
  solutionImages?: string[] | null;
};

type RawPart = {
  label?: unknown; text?: unknown; marks?: unknown; answer?: unknown; solution?: unknown;
  image_url?: unknown; image_url_after?: unknown; subparts?: unknown;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const urlList = (v: unknown): string[] => {
  if (typeof v === 'string' && /^https?:/i.test(v)) return [v];
  if (Array.isArray(v)) return v.filter((u): u is string => typeof u === 'string' && /^https?:/i.test(u));
  return [];
};

function toPart(p: RawPart): PickPart {
  const m = Number(p.marks);
  const subparts = Array.isArray(p.subparts)
    ? (p.subparts as RawPart[]).filter((s) => s && typeof s === 'object' && (s.label || s.text)).map(toPart)
    : [];
  let marks = Number.isFinite(m) && m > 0 ? m : null;
  // A parent stamped with the SUM of its sub-parts prints no marks of its own
  // (same rule as lib/bank-question-markdown structuredPart).
  if (marks !== null && subparts.some((s) => s.marks !== null)) marks = null;
  return {
    label: str(p.label).trim().replace(/^\(|\)$/g, ''),
    text: str(p.text).trim(),
    marks,
    answer: str(p.answer).trim(),
    imagesBefore: urlList(p.image_url),
    imagesAfter: urlList(p.image_url_after),
    subparts,
  };
}

/** "a" / "b.ii" — the key lib/solution-readability uses for part answers. */
export function partKey(labels: string[]): string {
  return labels.map((l) => l.toLowerCase()).join('.');
}

/** "(a)" / "(b)(ii)" as printed. */
export function partLabel(labels: string[]): string {
  return labels.map((l) => `(${l})`).join('');
}

export function fromDetail(d: DetailRow): PickQuestion {
  const rawParts = Array.isArray(d.parts) ? (d.parts as RawPart[]) : [];
  const parts = rawParts.filter((p) => p && typeof p === 'object' && (p.label || p.text)).map(toPart);
  const partSolutions: Record<string, string> = {};
  const partAnswers: Record<string, string> = {};
  const walk = (list: RawPart[], prefix: string[]) => {
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const labels = [...prefix, str(p.label).trim().replace(/^\(|\)$/g, '')].filter(Boolean);
      const key = partKey(labels);
      if (str(p.solution).trim()) partSolutions[key] = str(p.solution).trim();
      if (str(p.answer).trim()) partAnswers[key] = str(p.answer).trim();
      if (Array.isArray(p.subparts)) walk(p.subparts as RawPart[], labels);
    }
  };
  walk(rawParts, []);
  const stem = str(d.questionMd).replace(/\{\{IMG:[^}]*\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const prov = [d.school, d.year, d.paper ? `P${String(d.paper).replace(/^P/i, '')}` : null, d.qnum ? `Q${d.qnum}` : null]
    .filter(Boolean)
    .join(' ');
  return {
    id: d.id,
    provenance: prov || 'Question bank',
    marks: d.marks ?? totalMarks(parts),
    stem,
    images: (d.images ?? []).filter((u) => typeof u === 'string'),
    parts,
    answer: str(d.answer).trim(),
    solution: str(d.solution).trim(),
    partSolutions,
    partAnswers,
    solutionImages: (d.solutionImages ?? []).filter((u) => typeof u === 'string'),
    topics: Array.isArray(d.topics) ? d.topics : [],
    level: d.level ?? null,
  };
}

export function totalMarks(parts: PickPart[]): number | null {
  let sum = 0;
  for (const p of parts) {
    sum += p.marks ?? 0;
    for (const s of p.subparts) sum += s.marks ?? 0;
  }
  return sum > 0 ? sum : null;
}

/** Parts in reading order with their full label path. */
export function flatParts(parts: PickPart[], prefix: string[] = []): { labels: string[]; part: PickPart; depth: number }[] {
  const out: { labels: string[]; part: PickPart; depth: number }[] = [];
  for (const p of parts) {
    const labels = [...prefix, p.label].filter(Boolean);
    out.push({ labels, part: p, depth: prefix.length });
    if (p.subparts.length) out.push(...flatParts(p.subparts, labels));
  }
  return out;
}

/** A "shown" / "proved" answer is not an answer line. */
export function isShownAnswer(a: string): boolean {
  return /^\s*(shown|proved|proof|proven|n\.?a\.?|—|-|\[?(sketch|graph|diagram)\]?)\.?\s*$/i.test(a) || /^\s*shown\b/i.test(a);
}

/**
 * The inner text of the one `[Ans: …]` line: "(a) …; (b)(ii) …". Parts whose
 * answer is "shown" are left out; a question with no part answers falls back
 * to its top-level answer. Empty string = print no answer line.
 */
export function ansLine(q: PickQuestion): string {
  const bits: string[] = [];
  for (const { labels, part } of flatParts(q.parts)) {
    const a = part.answer.trim();
    if (!a || isShownAnswer(a)) continue;
    bits.push(`${partLabel(labels)} ${a}`);
  }
  if (bits.length) return bits.join('; ');
  const top = q.answer.trim();
  return top && !isShownAnswer(top) ? top : '';
}

/** Blank lines of writing space under a part: 4 a mark, one more for a [1]
 *  (worksheet_lib Worksheet(working_space=4.0, one_mark_bonus=1)). */
export function workingLines(marks: number | null, perMark = 4): number {
  if (!marks || marks <= 0) return 0;
  return marks * perMark + (marks === 1 ? 1 : 0);
}

/** ids from a `?ids=a,b,c` query (uuids only, order kept, duplicates dropped). */
export function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw.split(/[,\s]+/)) {
    const id = s.trim().toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** The markdown the bank worksheet renderer prints for one question — the same
 *  flattening the kiosk uses (label bold, marks as a trailing [n] the renderer
 *  floats right and spaces under), built from the picker's model so the PDF
 *  shows exactly the parts the DOCX does. */
export function questionMarkdown(q: PickQuestion): string {
  const lines: string[] = [];
  if (q.stem) lines.push(q.stem);
  for (const { labels, part } of flatParts(q.parts)) {
    for (const u of part.imagesBefore) lines.push(`![diagram](${u})`);
    if (part.text || part.marks) {
      const mk = part.marks ? ` [${part.marks}]` : '';
      lines.push(`**${partLabel(labels)}** ${part.text}${mk}`);
    }
    for (const u of part.imagesAfter) lines.push(`![diagram](${u})`);
  }
  return lines.join('\n\n');
}

/** Default file name for the outputs: the title, safe for a file system. */
export function fileStem(title: string): string {
  return (title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Worksheet').slice(0, 80);
}

/** The Practice shelf folder (Dropbox/Apps/AdrianMathNotes/Practice/<LEVEL>) for
 *  a set of bank levels: JC1/JC2 → JC, AM/S3_AM/AM_NA → AM, EM/S3_EM/EM_NA → EM,
 *  S1… / S2… → S1 / S2 (lib/notes-list dropboxFolderFor slugs). The most common
 *  folder wins; null when nothing maps. */
export const PRACTICE_FOLDERS = ['JC', 'AM', 'EM', 'S2', 'S1'] as const;
export type PracticeFolder = (typeof PRACTICE_FOLDERS)[number];

export function practiceFolderOf(level: string | null | undefined): PracticeFolder | null {
  const l = (level ?? '').toUpperCase();
  if (/^JC/.test(l)) return 'JC';
  if (/(^|_)AM(_|$)/.test(l)) return 'AM';
  if (/(^|_)EM(_|$)/.test(l)) return 'EM';
  if (/^S2/.test(l)) return 'S2';
  if (/^S1/.test(l)) return 'S1';
  return null;
}

export function practiceFolderFor(levels: (string | null | undefined)[]): PracticeFolder | null {
  const tally = new Map<PracticeFolder, number>();
  for (const l of levels) {
    const f = practiceFolderOf(l);
    if (f) tally.set(f, (tally.get(f) ?? 0) + 1);
  }
  let best: PracticeFolder | null = null;
  for (const [f, n] of tally) if (best === null || n > (tally.get(best) ?? 0)) best = f;
  return best;
}
