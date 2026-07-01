// Turns a bank `questions` row into render-ready markdown (KaTeX + inline images),
// split into QUESTION (stem + parts) and SOLUTION (answer + worked solution) so the
// practice flow can reveal the solution on demand. Image-schema handling mirrors
// admin/edit-cards/BankPanel.tsx (question_bank_viewer.html schema) — that panel has
// parallel logic; unify into this module if it's touched again.

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
function renderInlineImagesInText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\{\{IMG:([^}]+)\}\}/g, (_m, url: string) => {
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

/** Markdown for the answer + worked solution (revealed on demand). */
export function solutionMarkdown(q: BankQuestion): string {
  const out: string[] = [];
  if (q.answer && q.answer.trim()) out.push(`**Answer:** ${q.answer.trim()}`);
  if (q.solution && q.solution.trim()) out.push(renderInlineImagesInText(q.solution));
  for (const u of getSolutionImageUrls(q.solution_images)) out.push(imgTag(u, 'solution diagram'));
  for (const p of (Array.isArray(q.parts) ? q.parts : [])) {
    if (p?.solution) out.push(`**(${p.label ?? ''})** ${renderInlineImagesInText(p.solution)}`);
    if (p?.solution_image) { const t = partImageHtml(p.solution_image); if (t) out.push(t); }
    for (const sp of (Array.isArray(p?.subparts) ? p.subparts : [])) {
      if (sp?.solution) out.push(`**(${p.label ?? ''})(${sp.label ?? ''})** ${renderInlineImagesInText(sp.solution)}`);
      if (sp?.solution_image) { const t = partImageHtml(sp.solution_image); if (t) out.push(t); }
    }
  }
  return out.join('\n\n') || '_No worked solution recorded for this question._';
}
