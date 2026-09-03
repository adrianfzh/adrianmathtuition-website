// Pure helpers for putting a CLEANED SOLUTION IMAGE back into a bank question.
//
// This is the TypeScript mirror of the binding write contract in
// ~/Desktop/AdrianMath/solimg-2026-09-03/clean/scripts/apply.py — do not invent a
// different shape. What that script does, and what these helpers exist to support:
//
//   1. upload the cleaned image as a NEW bucket object
//      question_images/solutions/cleaned/<qid>-<part>-<sha8>.png
//   2. replace EVERY reference to the old path RECURSIVELY across the row —
//      solution_images[], parts[].solution_image, parts[].subparts[].solution_image
//      and any inline {{IMG:…}} inside solution text — writing the FULL public URL.
//      ONE new object even when the old key is referenced twice.
//   3. insert a figure_clean_log row (the revert ledger)
//   4. flip the figure_flags row from 'held' to 'fixed'
//   5. re-read the whole row and PROVE the old key is absent; if it survived
//      anywhere, revert.
//
// Why recursion and not "write the field": on Raffles Girls 2015 Q1 the first pass
// updated parts[1].image_url and left the SAME key alive in
// parts[1].subparts[1].image_url (docs/FIGURES.md §8b). Sub-parts are a real level.
//
// Key matching mirrors apply.py's key_of(): a bare filename, `question_images/<f>`
// and the full public URL are all the SAME key — normalised with
// normaliseImagePath() so the three spellings that actually occur in the bank
// (all three are present among the 152 held rows) collapse to one.
import { normaliseImagePath } from './bank-question-markdown';

/** The only columns this contract is allowed to touch. Never image_url/images[]. */
export type SolutionRowFields = {
  solution_images?: unknown;
  parts?: unknown;
  solution?: unknown;
};

export type ReplaceResult = {
  /** ONLY the columns that actually changed — the PATCH body, nothing more. */
  row: SolutionRowFields;
  /** How many individual references were rewritten (can be > 1 per row). */
  replaced: number;
  /** Where each one lived, e.g. `parts[1].subparts[0].solution_image`. */
  fields: string[];
};

const IMG_TOKEN = /\{\{IMG:([^}]+)\}\}/g;

/** The bare bucket key: strips a public-URL prefix and any `question_images/`. */
export function imageKey(raw: string | null | undefined): string {
  return normaliseImagePath(typeof raw === 'string' ? raw : '');
}

/** A part label as Adrian reads it: "b" → "(b)", "(a)" stays, empty → fallback. */
function labelOf(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return fallback;
  return /^\(/.test(s) ? s : `(${s})`;
}

/** apply.py's sanitise(): the `<part>` slug inside the new object's name. */
export function sanitisePartSlug(part: string | null | undefined): string {
  const s = (part ?? 'x').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return s || 'x';
}

/** The new object key, exactly as the contract names it. */
export function cleanedObjectKey(qid: string, partLabel: string | null, sha8: string, ext = 'png'): string {
  return `solutions/cleaned/${qid}-${sanitisePartSlug(partLabel)}-${sha8}.${ext}`;
}

/** True when this string is (or embeds) a reference to `key`. */
function stringRefs(s: unknown, key: string): boolean {
  if (typeof s !== 'string' || !key) return false;
  if (normaliseImagePath(s) === key) return true;
  if (s.includes('{{IMG:')) {
    IMG_TOKEN.lastIndex = 0;
    for (const m of s.matchAll(IMG_TOKEN)) if (normaliseImagePath(m[1]) === key) return true;
  }
  return false;
}

function replaceInString(s: string, key: string, newUrl: string): { value: string; n: number } {
  if (s.includes('{{IMG:')) {
    let n = 0;
    const out = s.replace(IMG_TOKEN, (whole, inner: string) =>
      (normaliseImagePath(inner) === key ? (n++, `{{IMG:${newUrl}}}`) : whole));
    if (n) return { value: out, n };
  }
  if (normaliseImagePath(s) === key) return { value: newUrl, n: 1 };
  return { value: s, n: 0 };
}

function walk(node: unknown, at: string, key: string, newUrl: string, fields: string[]): { value: unknown; n: number } {
  if (typeof node === 'string') {
    const r = replaceInString(node, key, newUrl);
    if (r.n) fields.push(at);
    return { value: r.value, n: r.n };
  }
  if (Array.isArray(node)) {
    let n = 0;
    const out = node.map((v, i) => {
      const r = walk(v, `${at}[${i}]`, key, newUrl, fields);
      n += r.n;
      return r.value;
    });
    return { value: out, n };
  }
  if (node && typeof node === 'object') {
    let n = 0;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const r = walk(v, at ? `${at}.${k}` : k, key, newUrl, fields);
      out[k] = r.value;
      n += r.n;
    }
    return { value: out, n };
  }
  return { value: node, n: 0 };
}

/**
 * Swap every reference to `oldPath` for `newUrl`, recursively, across the three
 * solution-bearing columns. Returns ONLY the columns that changed, so the caller
 * PATCHes nothing it did not mean to.
 */
export function replaceSolutionImageRefs(
  row: SolutionRowFields,
  oldPath: string,
  newUrl: string,
): ReplaceResult {
  const key = imageKey(oldPath);
  const out: SolutionRowFields = {};
  const fields: string[] = [];
  let replaced = 0;
  if (!key) return { row: out, replaced, fields };
  for (const f of ['solution_images', 'parts', 'solution'] as const) {
    const v = row?.[f];
    if (v === undefined || v === null) continue;
    const r = walk(v, f, key, newUrl, fields);
    if (r.n) { out[f] = r.value; replaced += r.n; }
  }
  return { row: out, replaced, fields };
}

/**
 * The absence proof. Deliberately STRICTER than node-level matching: any string
 * anywhere in the row that even contains the bare key counts, which is what
 * apply.py's `old_key in json.dumps(row)` check does. A survivor must be caught.
 */
export function containsImageRef(row: unknown, oldPath: string): boolean {
  const key = imageKey(oldPath);
  if (!key) return false;
  let found = false;
  const visit = (n: unknown): void => {
    if (found || n === null || n === undefined) return;
    if (typeof n === 'string') { if (n.includes(key) || stringRefs(n, key)) found = true; return; }
    if (Array.isArray(n)) { for (const v of n) { visit(v); if (found) return; } return; }
    if (typeof n === 'object') { for (const v of Object.values(n as Record<string, unknown>)) { visit(v); if (found) return; } }
  };
  visit(row);
  return found;
}

/**
 * Where in the question this image hangs, in Adrian's language:
 * "(b)(ii)" for a sub-part, "(b)" for a part, "solution_images[0]" for a
 * question-level image, "solution" for an inline {{IMG:}} in the stem solution.
 * Parts win over solution_images — the part label is the more useful caption,
 * and a handful of rows carry the same key in both.
 */
export function partLabelFor(row: SolutionRowFields, path: string): string | null {
  const key = imageKey(path);
  if (!key) return null;
  const refs = (v: unknown) => stringRefs(v, key);

  const parts = row?.parts;
  if (Array.isArray(parts)) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
      const rec = p as Record<string, unknown>;
      const pl = labelOf(rec.label, `parts[${i}]`);
      const subs = rec.subparts;
      if (Array.isArray(subs)) {
        for (let j = 0; j < subs.length; j++) {
          const s = subs[j];
          if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
          const srec = s as Record<string, unknown>;
          if (refs(srec.solution_image) || refs(srec.solution)) return pl + labelOf(srec.label, `[${j}]`);
        }
      }
      if (refs(rec.solution_image) || refs(rec.solution)) return pl;
    }
  }

  const si = row?.solution_images;
  if (Array.isArray(si)) {
    for (let i = 0; i < si.length; i++) if (refs(si[i])) return `solution_images[${i}]`;
  }
  if (refs(row?.solution)) return 'solution';
  return null;
}
