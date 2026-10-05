// Science figures point at the SCIENCE project's bucket (5 Oct 2026).
//
// The science bank stores its figures as bucket-relative names
// ("phys_vs_2023_p1_q25_e6b84af2.png") in ITS OWN Supabase project's
// `question_images` bucket. lib/bank-question-markdown resolves a relative name
// against the MATHS project's bucket, so until this file every science figure the
// Practise tab served rendered as a broken image (the maths bucket answers 400).
// Found while measuring whether the Sec 4 science bank is ready to serve
// (Adrian, 5 Oct 2026: "are all the science questions ready to be served for S4?").
//
// The fix is to hand the renderer ABSOLUTE urls: every image slot of a science row
// (stem image_url / images, part image_url / image_url_after / solution_image,
// solution_images, and {{IMG:…}} / ![](…) inside the text fields) is rewritten to
// the science bucket before rendering. An http(s) url is left as it is. Pure, no I/O.

export function scienceImageBase(supabaseUrl: string | null | undefined): string {
  const u = (supabaseUrl || '').trim().replace(/\/+$/, '');
  return u ? `${u}/storage/v1/object/public/question_images/` : '';
}

function abs(p: string, base: string): string {
  const s = p.trim();
  if (!s || /^https?:\/\//i.test(s) || /^data:/i.test(s)) return p;
  return base + s.replace(/^\/+/, '').replace(/^(question_images\/)+/, '');
}

/** One image slot: a bare name, a JSON-array string of names or {url,pos}, or an array. */
function slot(v: unknown, base: string): unknown {
  if (Array.isArray(v)) return v.map(e => (typeof e === 'string' ? abs(e, base) : e && typeof e === 'object' && typeof (e as { url?: unknown }).url === 'string' ? { ...e, url: abs((e as { url: string }).url, base) } : e));
  if (typeof v !== 'string') return v;
  const raw = v.trim();
  if (!raw || raw === '[]') return v;
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return JSON.stringify(slot(arr, base));
    } catch { /* not JSON — a path */ }
  }
  return abs(raw, base);
}

function text(v: unknown, base: string): unknown {
  if (typeof v !== 'string' || !v) return v;
  return v
    .replace(/\{\{IMG:([^}]+)\}\}/g, (_m, p: string) => `{{IMG:${abs(p, base)}}}`)
    .replace(/(!\[[^\]]*\]\(\s*<?)([^)\s>]+)/g, (_m, head: string, p: string) => head + abs(p, base));
}

type Part = Record<string, unknown> & { subparts?: unknown };
function part(p: unknown, base: string): unknown {
  if (!p || typeof p !== 'object') return p;
  const q = { ...(p as Part) };
  for (const k of ['image_url', 'image_url_after', 'solution_image']) if (k in q) q[k] = slot(q[k], base);
  for (const k of ['text', 'solution', 'answer']) if (k in q) q[k] = text(q[k], base);
  if (Array.isArray(q.subparts)) q.subparts = q.subparts.map(sp => part(sp, base));
  return q;
}

/**
 * A copy of a science row with every image reference made absolute against the
 * science bucket. `base` = scienceImageBase(SUPABASE_URL_SCIENCE); an empty base
 * returns the row unchanged.
 */
export function withScienceImageUrls<T extends Record<string, unknown>>(row: T, base: string): T {
  if (!base || !row) return row;
  const out: Record<string, unknown> = { ...row };
  if ('image_url' in out) out.image_url = slot(out.image_url, base);
  if (Array.isArray(out.images)) out.images = (out.images as unknown[]).map(im => (im && typeof im === 'object' && typeof (im as { filename?: unknown }).filename === 'string' ? { ...im, filename: abs((im as { filename: string }).filename, base) } : im));
  if ('solution_images' in out) out.solution_images = slot(out.solution_images, base);
  for (const k of ['question_text', 'solution', 'answer']) if (k in out) out[k] = text(out[k], base);
  if (Array.isArray(out.parts)) out.parts = (out.parts as unknown[]).map(p => part(p, base));
  return out as T;
}
