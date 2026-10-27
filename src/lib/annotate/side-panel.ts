// lib/annotate/side-panel.ts — the 📄 Paper / ✅ Solutions panel beside the page in
// ✏️ Annotate (27 Oct 2026, Adrian: "Able to have the question paper or the solution side
// by side when annotating? Used to have this in the marking desk, then marking desk was
// gone." … "Yes" … "But I find the solutions hard to read - readability needs to be
// improved on. And if there should be diagrams in the solutions or helpful to have, it
// should be generated"). Pure; tested. The I/O lives in the route and the panel.
import type { SolutionsItem, SolutionsPart } from '@/lib/render-solutions-pdf';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Natural order of printed question numbers: "2" < "10" < "10b" < "11". */
export function compareQnum(a: string, b: string): number {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/** photo index → the question numbers marked on that page, in paper order. */
export function questionsByPage(resultJson: unknown): Record<number, string[]> {
  const results = rec(resultJson)?.results;
  const out: Record<number, string[]> = {};
  if (!Array.isArray(results)) return out;
  for (const r of results) {
    const o = rec(r);
    const q = str(o?.question_number).trim();
    const pi = Number(o?.photo_index);
    if (!q || !Number.isInteger(pi) || pi < 0) continue;
    (out[pi] ||= []);
    if (!out[pi].includes(q)) out[pi].push(q);
  }
  for (const k of Object.keys(out)) out[Number(k)].sort(compareQnum);
  return out;
}

/** The marker's own record of one question (the first result carrying it). */
function resultFor(resultJson: unknown, q: string): Rec | null {
  const results = rec(resultJson)?.results;
  if (!Array.isArray(results)) return null;
  let best: Rec | null = null;
  for (const r of results) {
    const o = rec(r);
    if (str(o?.question_number).trim() !== q) continue;
    if (!best) best = o;
    // a result that carries the worked solution beats one that does not
    if (str(rec(rec(o?.marking_output)?.correct)?.full_solution_latex)) return o;
  }
  return best;
}

/** The printed question as the marker read it. */
export function markerPrompt(resultJson: unknown, q: string): string {
  return str(rec(rec(resultFor(resultJson, q)?.marking_output)?.question)?.prompt).trim();
}

const PART_LINE = /^\s*(?:\$\s*\\text\{\s*)?\(\s*([a-z]{1,2}|i{1,3}|iv|vi{0,3}|ix|x)\s*\)(?:\s*\}\s*\$)?\s*$/i;

/** A worked solution written as one block with "(a)" / "$\text{(a)}$" label lines → its parts.
 *  No label lines → one unlabelled part. */
export function splitByPartLabels(text: string): { label: string | null; body: string }[] {
  const lines = String(text || '').split('\n');
  const out: { label: string | null; body: string[] }[] = [];
  for (const l of lines) {
    const m = l.match(PART_LINE);
    if (m) { out.push({ label: `(${m[1].toLowerCase()})`, body: [] }); continue; }
    if (!out.length) out.push({ label: null, body: [] });
    out[out.length - 1].body.push(l);
  }
  return out
    .map((p) => ({ label: p.label, body: p.body.join('\n').trim() }))
    .filter((p) => p.body || p.label);
}

/** "(a) tan θ = …; (b) cosec θ = …" → { "(a)": "tan θ = …", "(b)": "cosec θ = …" }.
 *  An answer with no labels comes back under "". */
export function splitFinalAnswer(text: string): Record<string, string> {
  const t = String(text || '').trim();
  if (!t) return {};
  const re = /(?:^|[;\n]\s*)\(\s*([a-z]{1,2}|i{1,3}|iv|vi{0,3}|ix|x)\s*\)\s*/gi;
  const marks: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) marks.push({ label: `(${m[1].toLowerCase()})`, start: m.index, end: re.lastIndex });
  if (!marks.length) return { '': t };
  const out: Record<string, string> = {};
  const head = t.slice(0, marks[0].start).trim();
  if (head) out[''] = head.replace(/[;\s]+$/, '');
  marks.forEach((k, i) => {
    out[k.label] = t.slice(k.end, i + 1 < marks.length ? marks[i + 1].start : t.length).trim().replace(/[;\s]+$/, '');
  });
  return out;
}

/** Per part, the marker's scheme codes ("B1 M1 A1") — shown small and grey. */
function schemeCodes(result: Rec | null): Record<string, string> {
  const parts = rec(result?.marking)?.parts;
  const out: Record<string, string> = {};
  if (!Array.isArray(parts)) return out;
  for (const p of parts) {
    const o = rec(p);
    const label = str(o?.label).trim().toLowerCase();
    const scheme = str(o?.scheme).trim();
    if (scheme) out[label || ''] = scheme;
  }
  return out;
}

/**
 * One question's worked solution FROM THE MARKER (what it marked against, when the paper
 * is not in the bank): one part per "(a)" label, each closing on its own bold Answer line
 * (lib/render-solutions-pdf draws the Answer), the scheme codes as a small grey tag.
 */
export function markerSolutionItem(resultJson: unknown, q: string): SolutionsItem | null {
  const r = resultFor(resultJson, q);
  if (!r) return null;
  const correct = rec(rec(r.marking_output)?.correct);
  const full = str(correct?.full_solution_latex).trim();
  const final = str(correct?.final_answer).trim();
  const prompt = markerPrompt(resultJson, q);
  if (!full && !final) return { qnum: q, questionText: prompt, solution: '', answer: '', parts: null, solutionImages: [] };
  const answers = splitFinalAnswer(final);
  const codes = schemeCodes(r);
  const split = splitByPartLabels(full);
  const labelled = split.some((p) => p.label);
  if (!labelled) {
    return {
      qnum: q, questionText: prompt, solution: full, answer: final, parts: null, solutionImages: [],
      ...(codes[''] ? { codes: codes[''] } : {}),
    };
  }
  const parts: SolutionsPart[] = split.map((p) => ({
    label: p.label ? p.label.replace(/[()]/g, '') : null,
    solution: p.body,
    answer: (p.label && answers[p.label]) || (!p.label ? answers[''] : '') || null,
    ...(p.label && codes[p.label] ? { codes: codes[p.label] } : {}),
  }));
  return { qnum: q, questionText: prompt, solution: full, solutionFromParts: true, answer: final, parts, solutionImages: [] };
}

/**
 * Which page of the question paper a question starts on. `pages` = each PDF page's text
 * pieces with their x position as a fraction of the page width (pdf.js getTextContent).
 * A piece that IS the number ("10", "10.", "10)", "Q10"), or starts with it followed by a
 * space, near the left margin (x < 0.2) wins; otherwise null and the panel stays where it is.
 */
export function findQuestionPage(pages: { str: string; x: number }[][], qnum: string): number | null {
  const n = String(qnum || '').trim().match(/^\d+/)?.[0];
  if (!n) return null;
  const exact = new RegExp(`^\\s*(?:Q\\s*)?${n}\\s*[.)]?\\s*$`, 'i');
  const lead = new RegExp(`^\\s*(?:Q\\s*)?${n}(?:\\s*[.)]\\s*|\\s+)\\S`, 'i');
  for (let i = 0; i < pages.length; i++) {
    for (const t of pages[i]) {
      if (t.x > 0.2) continue;
      if (exact.test(t.str) || lead.test(t.str)) return i;
    }
  }
  return null;
}

/** The cache key of a question's drawn diagram, inside the run's own folder. */
export function sideDiagramKey(runId: string, q: string): string {
  const slug = String(q).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'q';
  return `runs/${runId}/side-diagrams/q-${slug}`;
}

/** The model's first JSON object in a reply (fenced or bare); null when there is none. */
export function firstJson(text: string): Rec | null {
  const t = String(text || '');
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : t;
  const start = body.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return rec(JSON.parse(body.slice(start, i + 1))); } catch { return null; } } }
  }
  return null;
}
