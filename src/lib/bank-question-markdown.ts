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
  solution_images?: string | null;      // JSON array of URLs
  answer?: string | null;
};

type StemImageRecord = { url: string; pos: 'before' | 'after' };

function toStorageUrl(s: string): string {
  return s.startsWith('http') ? s : STORAGE_BUCKET + s.replace(/^question_images\//, '');
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
function renderInlineImagesInText(text: string | null | undefined): string {
  if (!text) return '';
  return normalizeMathDelimiters(text).replace(/\{\{IMG:([^}]+)\}\}/g, (_m, url: string) => {
    const cleaned = url.trim();
    return isPlausibleFilename(cleaned) ? imgTag(cleaned) : '';
  });
}
function partImageHtml(path: string | null | undefined): string {
  return isPlausibleFilename(path) ? imgTag(path) : '';
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
function getSolutionImageUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
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

/** Stem markdown + structured parts (no answer/solution). */
export function questionStructured(q: BankQuestion): { stem: string; parts: StructuredPart[] } {
  const out: string[] = [];
  const stem = getStemImageRecords(q);
  for (const r of stem.filter((r) => r.pos === 'before')) out.push(imgTag(r.url, 'diagram'));
  if (q.question_text) out.push(renderInlineImagesInText(q.question_text));
  for (const r of stem.filter((r) => r.pos === 'after')) out.push(imgTag(r.url, 'diagram'));
  const parts = (Array.isArray(q.parts) ? q.parts : [])
    .filter(p => p && (p.label || p.text))
    .map(p => structuredPart(p, true));
  return { stem: out.join('\n\n'), parts };
}

// Worked-solution text → one block per step, runs of equations aligned on `=`
// (lib/solution-format.ts). Images are substituted AFTER formatting so the
// {{IMG:…}} lines pass through the formatter untouched.
function workedSolution(text: string): string {
  return renderInlineImagesInText(formatSolution(text));
}

/** Markdown for the answer + worked solution (revealed on demand). */
export function solutionMarkdown(q: BankQuestion): string {
  const out: string[] = [];
  const parts = Array.isArray(q.parts) ? q.parts : [];
  // Multi-part rows carry the combined working in `solution` AND the same
  // working split per part — render the structured per-part version only
  // (pre-2026-08-21 both were emitted, so every solution appeared twice).
  const hasPartSolutions = parts.some(p => p?.solution || p?.subparts?.some(sp => sp?.solution));
  if (q.answer && q.answer.trim()) out.push(`**Answer:** ${normalizeMathDelimiters(q.answer.trim())}`);
  if (!hasPartSolutions && q.solution && q.solution.trim()) out.push(workedSolution(q.solution));
  for (const u of getSolutionImageUrls(q.solution_images)) out.push(imgTag(u, 'solution diagram'));
  for (const p of parts) {
    if (p?.solution) out.push(`**(${p.label ?? ''})**\n\n${workedSolution(p.solution)}`);
    if (p?.solution_image) { const t = partImageHtml(p.solution_image); if (t) out.push(t); }
    for (const sp of (Array.isArray(p?.subparts) ? p.subparts : [])) {
      if (sp?.solution) out.push(`**(${p.label ?? ''})(${sp.label ?? ''})**\n\n${workedSolution(sp.solution)}`);
      if (sp?.solution_image) { const t = partImageHtml(sp.solution_image); if (t) out.push(t); }
    }
  }
  return out.join('\n\n') || '_No worked solution recorded for this question._';
}
