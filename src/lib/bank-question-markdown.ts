// Turns a bank `questions` row into render-ready markdown (KaTeX + inline images),
// split into QUESTION (stem + parts) and SOLUTION (answer + worked solution) so the
// practice flow can reveal the solution on demand. Image-schema handling mirrors
// admin/edit-cards/BankPanel.tsx (question_bank_viewer.html schema) — that panel has
// parallel logic; unify into this module if it's touched again.

import { formatSolution, normalizeMathDelimiters } from './solution-format';

const STORAGE_BUCKET =
  'https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/';

export type BankPart = {
  label?: string; text?: string; marks?: number;
  image_url?: string; image_url_after?: string; solution?: string; solution_image?: string;
  subparts?: BankPart[];
};
export type BankQuestion = {
  question_text?: string | null;
  parts?: BankPart[] | null;
  image_url?: string | null;            // JSON array of {url,pos} or legacy bare string
  images?: { filename: string }[] | null;
  solution?: string | null;
  solution_images?: string | string[] | null;  // JSON array of URLs (text via the practice_solution RPC; a real array off the jsonb column)
  answer?: string | null;
};

type StemImageRecord = { url: string; pos: 'before' | 'after' };

function toStorageUrl(s: string): string {
  return s.startsWith('http') ? s : STORAGE_BUCKET + s.replace(/^question_images\//, '');
}

// ── Solution-image gate (2026-09-03) ─────────────────────────────────────────
// Question figures fail closed (kiosk-pool.figureServable + the open-flag
// exclusion in the serving RPCs); solution images had no gate at all, so a
// watermarked solution scan showed the moment a solution was revealed. The
// gate is DATA: lib/solution-image-gate.ts builds it (the only module that
// reads the DB for it) and callers hand it in here — this module stays pure.
// Absent gate = every image renders, exactly as before.
export type SolutionImageGate = {
  /** Normalised bucket paths that must never render (open kind='solution' flags). */
  blocked: ReadonlySet<string>;
  /** When true, a path renders ONLY if it is in `clean` (the dormant allow-list mode). */
  requireClean?: boolean;
  clean?: ReadonlySet<string>;
};

/**
 * One spelling for an image path, so gate lookups match however a row spelt
 * it: bucket-relative, no leading slash, no `question_images/` prefix, no
 * host or query string. Sub-folders are kept (`thumbs/a.jpg` stays
 * `thumbs/a.jpg`). A full URL outside the bucket keeps its (decoded) pathname
 * — it can never match a bucket path, which is the right answer.
 */
export function normaliseImagePath(raw: string): string {
  let s = (raw ?? '').trim();
  if (/^https?:\/\//i.test(s)) {
    const i = s.lastIndexOf('question_images/');
    s = i === -1 ? s.replace(/^https?:\/\/[^/]+/i, '') : s.slice(i + 'question_images/'.length);
    s = s.split(/[?#]/)[0];
    try { s = decodeURIComponent(s); } catch { /* keep the raw spelling */ }
  }
  return s.replace(/^\/+/, '').replace(/^(question_images\/)+/, '');
}

/** True when the gate lets this image render (no gate = always). */
export function solutionImageAllowed(path: string, gate?: SolutionImageGate): boolean {
  if (!gate) return true;
  const n = normaliseImagePath(path);
  if (gate.blocked.has(n)) return false;
  if (gate.requireClean) return !!gate.clean?.has(n);
  return true;
}
function isPlausibleFilename(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 6
    && !['[]', '{}', 'null', 'undefined', '[object Object]'].includes(s.trim());
}
function imgTag(url: string, alt = ''): string {
  return `<img src="${toStorageUrl(url)}" alt="${alt}" style="max-width:100%;display:block;margin:8px 0" />`;
}
// Also normalises \( \) / \[ \] to $-delimiters — remark-math only parses the
// dollar forms, and ~90 (mostly AI-authored) rows carry the backslash forms.
// `gate` is only ever passed from the SOLUTION side (solutionMarkdown →
// workedSolution); question-side callers pass none and render as before.
function renderInlineImagesInText(text: string | null | undefined, gate?: SolutionImageGate): string {
  if (!text) return '';
  return normalizeMathDelimiters(text).replace(/\{\{IMG:([^}]+)\}\}/g, (_m, url: string) => {
    const cleaned = url.trim();
    return isPlausibleFilename(cleaned) && solutionImageAllowed(cleaned, gate) ? imgTag(cleaned) : '';
  });
}
function partImageHtml(path: string | null | undefined, gate?: SolutionImageGate): string {
  return isPlausibleFilename(path) && solutionImageAllowed(path, gate) ? imgTag(path) : '';
}
function getStemImageRecords(q: BankQuestion): StemImageRecord[] {
  const records: StemImageRecord[] = [];
  const raw = (q.image_url || '').trim();
  if (raw && raw !== '[]') {
    let parsed: unknown;
    try { parsed = raw.startsWith('[') ? JSON.parse(raw) : raw; } catch { parsed = raw; }
    for (const entry of (Array.isArray(parsed) ? parsed : [parsed])) {
      if (typeof entry === 'string' && isPlausibleFilename(entry)) records.push({ url: entry, pos: 'after' });
      else if (entry && typeof entry === 'object' && 'url' in entry && isPlausibleFilename((entry as { url: unknown }).url)) {
        const e = entry as { url: string; pos?: string };
        records.push({ url: e.url, pos: e.pos === 'before' ? 'before' : 'after' });
      }
    }
  }
  if (records.length === 0 && q.images?.length) {
    for (const img of q.images) if (isPlausibleFilename(img?.filename)) records.push({ url: img.filename, pos: 'after' });
  }
  return records;
}
function getSolutionImageUrls(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(isPlausibleFilename);   // the jsonb column read directly
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[]') return [];
  try {
    const parsed = trimmed.startsWith('[') ? JSON.parse(trimmed) : trimmed;
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(isPlausibleFilename) as string[];
  } catch { return isPlausibleFilename(trimmed) ? [trimmed] : []; }
}

/** Markdown for the question stem + parts (no answer/solution). */
export function questionMarkdown(q: BankQuestion): string {
  const out: string[] = [];
  const stem = getStemImageRecords(q);
  for (const r of stem.filter((r) => r.pos === 'before')) out.push(imgTag(r.url, 'diagram'));
  if (q.question_text) out.push(renderInlineImagesInText(q.question_text));
  for (const r of stem.filter((r) => r.pos === 'after')) out.push(imgTag(r.url, 'diagram'));

  for (const p of (Array.isArray(q.parts) ? q.parts : [])) {
    if (!p?.label && !p?.text) continue;
    const marks = p.marks ? ` _[${p.marks}m]_` : '';
    if (p.image_url) out.push(partImageHtml(p.image_url));
    out.push(`**(${p.label ?? ''})** ${renderInlineImagesInText(p.text)}${marks}`.trim());
    if (p.image_url_after) out.push(partImageHtml(p.image_url_after));
    for (const sp of (Array.isArray(p.subparts) ? p.subparts : [])) {
      if (!sp?.label && !sp?.text) continue;
      const spMarks = sp.marks ? ` _[${sp.marks}m]_` : '';
      if (sp.image_url) out.push(partImageHtml(sp.image_url));
      out.push(`&nbsp;&nbsp;**(${sp.label ?? ''})** ${renderInlineImagesInText(sp.text)}${spMarks}`.trim());
      if (sp.image_url_after) out.push(partImageHtml(sp.image_url_after));
    }
  }
  return out.join('\n\n');
}

// ── Structured question (stem + parts) for the portal's grid layout ──────────
// The markdown form above is fine for prompts and plain renderers, but a neat
// exam-style layout (label column, sub-part column, marks flush right on the
// last line of each part) can't be expressed in markdown without block-level
// HTML — and block HTML switches off math parsing inside it. So the portal
// renders this structure with React and runs only the text cells through
// ReactMarkdown. Images stay inline as <img> blocks inside the text cells.
export type StructuredPart = {
  label: string;
  text: string;           // markdown (may be '' for a bare "(b)" that only has sub-parts)
  marks: number | null;
  subparts: StructuredPart[];
};

function partText(p: BankPart): string {
  const chunks: string[] = [];
  if (p.image_url) { const t = partImageHtml(p.image_url); if (t) chunks.push(t); }
  const body = renderInlineImagesInText(p.text).trim();
  if (body) chunks.push(body);
  if (p.image_url_after) { const t = partImageHtml(p.image_url_after); if (t) chunks.push(t); }
  return chunks.join('\n\n');
}

function structuredPart(p: BankPart, withSubparts: boolean): StructuredPart {
  const subparts = withSubparts && Array.isArray(p.subparts)
    ? p.subparts.filter(sp => sp && (sp.label || sp.text)).map(sp => structuredPart(sp, false))
    : [];
  const m = Number(p.marks);   // some rows store marks as "3"
  let marks = Number.isFinite(m) && m > 0 ? m : null;
  // Many rows stamp the parent with the SUM of its sub-parts' marks ("(a) [2]"
  // over "(i) [1]", "(ii) [1]"). An exam paper prints marks only where they are
  // earned, so the parent's total is dropped whenever a sub-part carries its own.
  if (marks !== null && subparts.some(sp => sp.marks !== null)) marks = null;
  return { label: String(p.label ?? '').trim(), text: partText(p), marks, subparts };
}

// ~20% of bank rows (mostly AI-authored, incl. most Advanced ones) carry no
// `parts` array at all — the parts live inside question_text as lines like
//   (a) State the value of $n$. [1]
//   (b)(i) Find … [2]
//   (ii) Hence … [3]
// Those rendered as plain paragraphs with the "[1]" stuck on the end of the
// sentence (Adrian 2026-08-21: "some of the questions have marks that are
// still not right-aligned"). Split them into the same structure the grid
// expects: lines before the first part line are the stem; a roman label opens
// a sub-part of the current lettered part; an unlabelled line continues the
// current (sub)part. Only used when `parts` is empty — authored parts win.
const PART_LINE = /^\(([a-z]|[ivx]{1,4})\)\s*(?:\(([ivx]{1,4})\)\s*)?([\s\S]*?)\s*(?:\[\s*(\d+)\s*(?:marks?|m)?\s*\])?\s*$/i;
const TRAILING_MARKS = /\s*\[\s*(\d+)\s*(?:marks?|m)?\s*\]\s*$/i;
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

export function splitInlineParts(text: string | null | undefined): { stem: string; parts: BankPart[] } {
  const lines = (text || '').split('\n').map(l => l.trim());
  const stemLines: string[] = [];
  const parts: BankPart[] = [];
  let current: BankPart | null = null;        // the (sub)part continuation lines attach to
  let parent: BankPart | null = null;         // the open lettered part for roman sub-parts
  for (const line of lines) {
    if (!line) continue;
    const m = line.match(PART_LINE);
    if (m) {
      const [, l1, l2, body, marks] = m;
      const mk = marks ? Number(marks) : undefined;
      if (l2) {                                 // "(b)(i) …" — lettered part + first sub-part on one line
        parent = { label: l1.toLowerCase(), text: '', subparts: [] };
        parts.push(parent);
        current = { label: l2.toLowerCase(), text: body, marks: mk };
        parent.subparts!.push(current);
      } else if (ROMAN.test(l1) && parent) {    // "(ii) …" under the open lettered part
        current = { label: l1.toLowerCase(), text: body, marks: mk };
        parent.subparts = parent.subparts || [];
        parent.subparts.push(current);
      } else {                                  // "(a) …" top-level part
        current = { label: l1.toLowerCase(), text: body, marks: mk };
        parent = ROMAN.test(l1) ? null : current;
        parts.push(current);
      }
      continue;
    }
    if (!current) { stemLines.push(line); continue; }
    // Continuation of the current (sub)part; a marks tag on its last line
    // belongs to the part, not the sentence.
    let body = line;
    const tm = body.match(TRAILING_MARKS);
    if (tm && current.marks == null) { current.marks = Number(tm[1]); body = body.replace(TRAILING_MARKS, '').trim(); }
    if (body) current.text = current.text ? `${current.text}\n\n${body}` : body;
  }
  if (!parts.length) return { stem: (text || '').trim(), parts: [] };
  return { stem: stemLines.join('\n\n'), parts };
}

/**
 * Total marks derived from the structured parts, for rows whose
 * `total_marks` column is null — the header chip showed nothing on those
 * ("some questions have no marks?", Adrian's phone review 2026-08-29) even
 * though the marks sit right there on the parts. Sums every part and
 * sub-part (structuredPart already nulls a parent that merely repeats its
 * sub-parts' total, so leaves are counted exactly once). Null when the parts
 * carry no marks at all — a "0 marks" chip would be worse than none.
 */
export function totalMarksOf(parts: StructuredPart[]): number | null {
  let sum = 0;
  for (const p of parts) {
    sum += p.marks ?? 0;
    for (const sp of p.subparts) sum += sp.marks ?? 0;
  }
  return sum > 0 ? sum : null;
}

/** Stem markdown + structured parts (no answer/solution). */
export function questionStructured(q: BankQuestion): { stem: string; parts: StructuredPart[] } {
  const authored = (Array.isArray(q.parts) ? q.parts : []).filter(p => p && (p.label || p.text));
  const inline = authored.length ? null : splitInlineParts(q.question_text);
  const stemText = inline ? inline.stem : q.question_text;
  const rawParts = inline ? inline.parts : authored;

  const out: string[] = [];
  const stem = getStemImageRecords(q);
  for (const r of stem.filter((r) => r.pos === 'before')) out.push(imgTag(r.url, 'diagram'));
  if (stemText) out.push(renderInlineImagesInText(stemText));
  for (const r of stem.filter((r) => r.pos === 'after')) out.push(imgTag(r.url, 'diagram'));
  const parts = rawParts.map(p => structuredPart(p, true));
  return { stem: out.join('\n\n'), parts };
}

// Worked-solution text → one block per step, runs of equations aligned on `=`
// (lib/solution-format.ts). Images are substituted AFTER formatting so the
// {{IMG:…}} lines pass through the formatter untouched.
function workedSolution(text: string, gate?: SolutionImageGate): string {
  return renderInlineImagesInText(formatSolution(text), gate);
}

/**
 * Markdown for the answer + worked solution (revealed on demand).
 * `gate` (lib/solution-image-gate.ts) withholds flagged solution images —
 * top-level `solution_images[]`, `parts[].solution_image`, sub-part
 * `solution_image` and `{{IMG:…}}` inside solution text alike. A withheld
 * image emits nothing (no placeholder); the working around it still shows.
 * No gate = every image renders, as before.
 */
export function solutionMarkdown(q: BankQuestion, gate?: SolutionImageGate): string {
  const out: string[] = [];
  const parts = Array.isArray(q.parts) ? q.parts : [];
  // Multi-part rows carry the combined working in `solution` AND the same
  // working split per part — render the structured per-part version only
  // (pre-2026-08-21 both were emitted, so every solution appeared twice).
  const hasPartSolutions = parts.some(p => p?.solution || p?.subparts?.some(sp => sp?.solution));
  if (q.answer && q.answer.trim()) out.push(`**Answer:** ${normalizeMathDelimiters(q.answer.trim())}`);
  if (!hasPartSolutions && q.solution && q.solution.trim()) out.push(workedSolution(q.solution, gate));
  for (const u of getSolutionImageUrls(q.solution_images)) if (solutionImageAllowed(u, gate)) out.push(imgTag(u, 'solution diagram'));
  for (const p of parts) {
    if (p?.solution) out.push(`**(${p.label ?? ''})**\n\n${workedSolution(p.solution, gate)}`);
    if (p?.solution_image) { const t = partImageHtml(p.solution_image, gate); if (t) out.push(t); }
    for (const sp of (Array.isArray(p?.subparts) ? p.subparts : [])) {
      if (sp?.solution) out.push(`**(${p.label ?? ''})(${sp.label ?? ''})**\n\n${workedSolution(sp.solution, gate)}`);
      if (sp?.solution_image) { const t = partImageHtml(sp.solution_image, gate); if (t) out.push(t); }
    }
  }
  return out.join('\n\n') || '_No worked solution recorded for this question._';
}
