// The ✏️ Annotate side panel's server half (27 Oct 2026 — SPEC-ANNOTATE §21): the question
// paper and the worked solutions for the questions on the page being annotated, and a
// diagram drawn for a solution that would be clearer with one. Admin-only callers.
//
// Solutions: the bank's own row when the marking matched the paper to the bank (what the
// marker grounded on), else the marker's own worked solution. Both go through
// lib/render-solutions-pdf (the house solutions layout: one step a line, a bold Answer per
// part, mark codes small and grey, KaTeX) — no second formatter.
//
// Diagrams: the figure library only (the bot's lib/figures through /api/figure-render —
// verify re-derives the maths and FAILS CLOSED, so no diagram beats a wrong one). A model
// decides whether a picture would help and writes the typed spec; the library draws it or
// refuses. Made once per question: the picture, or "none" and why, is kept beside the run's
// files (runs/<id>/side-diagrams/…).
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './supabase';
import { anthropicText } from './claude-models';
import { downloadStudentFile, putStudentFile, fileHref } from './student-files';
import { bankQuestionsForRun } from './question-clip-store';
import { rollupSolution } from './solution-rollup';
import { cropUrls, imgSrc, isPlausibleImagePath } from './kiosk-worksheet-images';
import { renderFigure, figureDoc } from './twin-store';
import { questionsByPage, markerPrompt, markerPromptLatex, markerSolutionItem, sideDiagramKey, firstJson, schemeCodes, resultFor } from './annotate/side-panel';
import { type SideExtras, fullScheme, hasOwnCodes, solutionTexts, sameApartFromCodes } from './annotate/side-extras';
import katex from 'katex';
import { mathHtml, escapeHtml } from './math-inline';
import { splitPlainMath, plainMathToTex, plainMathToDollar } from './annotate/plain-math';
import type { SolutionsItem, SolutionsPart } from './render-solutions-pdf';

/** Opus for the judgement (does a picture help, and what exactly does it show). */
export const SIDE_DIAGRAM_MODEL = process.env.SIDE_DIAGRAM_MODEL || 'claude-opus-5-5';

type Run = { id: string; paper_name: string | null; result_json: Record<string, unknown> | null };

export async function loadSideRun(runId: string): Promise<Run | null> {
  const { data } = await getSupabaseAdmin().from('paper_marking_runs').select('id, paper_name, result_json').eq('id', runId).maybeSingle();
  return (data as Run | null) ?? null;
}

/** What the panel needs up front: the paper PDF (same-origin), each page's questions, the prompts. */
export function sideInfo(run: Run) {
  const rj = run.result_json ?? {};
  const src = (rj.source ?? {}) as { paper_pdf_url?: string | null };
  const byPage = questionsByPage(rj);
  // The question as the marker read it, as HTML with the maths typeset (Adrian, 2 Nov 2026:
  // "questions math expression not in latex"): the marker's $…$ copy when it wrote one,
  // else the plain text with its maths runs typeset.
  const prompts: Record<string, string> = {};
  for (const qs of Object.values(byPage)) for (const q of qs) {
    const tex = markerPromptLatex(rj, q), plain = markerPrompt(rj, q);
    if (tex) prompts[q] = mathHtml(tex);
    else if (plain) prompts[q] = plainPromptHtml(plain);
  }
  // Through our own route: a paper-library link on the run is a signed link that expires.
  return { paperUrl: src.paper_pdf_url ? `/api/admin/annotate-side/paper?runId=${run.id}` : null, byPage, prompts, paperName: run.paper_name };
}

type BankRow = {
  id: string; question_number: string | null; question_text: string | null; solution: string | null; answer: string | null;
  parts: unknown; figure_url: string | null; image_url: string | null; images: unknown;
};

function bankFigures(row: BankRow): string[] {
  const urls: string[] = [];
  if (row.figure_url) urls.push(row.figure_url);
  urls.push(...cropUrls(row.image_url));
  if (!urls.length && Array.isArray(row.images)) for (const p of row.images) if (isPlausibleImagePath(p)) urls.push(imgSrc(p));
  return [...new Set(urls)].slice(0, 4);
}

/** The worked-solution items for the questions on one page, in paper order. */
export async function sideSolutionItems(run: Run, photoIndex: number): Promise<{ items: SolutionsItem[]; questions: string[]; fromBank: number }> {
  const rj = run.result_json ?? {};
  const questions = questionsByPage(rj)[photoIndex] ?? [];
  if (!questions.length) return { items: [], questions, fromBank: 0 };
  const bankIds = await bankQuestionsForRun(rj, questions).catch(() => ({} as Record<string, string>));
  const ids = Object.values(bankIds);
  const rows: BankRow[] = ids.length
    ? (((await getSupabaseAdmin().from('questions')
      .select('id, question_number, question_text, solution, answer, parts, figure_url, image_url, images').in('id', ids)).data ?? []) as BankRow[])
    : [];
  let fromBank = 0;
  const items: SolutionsItem[] = [];
  for (const q of questions) {
    const row = rows.find((r) => r.id === bankIds[q]);
    const solution = row ? rollupSolution(row.solution, row.parts) : '';
    if (row && solution) {
      fromBank += 1;
      const figs = bankFigures(row);
      items.push({
        qnum: q,
        questionText: (row.question_text ?? '').trim() || markerPromptLatex(rj, q) || plainMathToDollar(markerPrompt(rj, q)),
        questionFromMarker: !(row.question_text ?? '').trim(),
        solution,
        solutionFromParts: !(typeof row.solution === 'string' && row.solution.trim()),
        answer: (row.answer ?? '').trim(),
        parts: (row.parts as SolutionsPart[] | null) ?? null,
        solutionImages: [],
        figureImages: figs,
        diagramSlot: figs.length === 0,
      });
      continue;
    }
    const m = markerSolutionItem(rj, q);
    if (m) items.push({ ...m, figureImages: row ? bankFigures(row) : [], diagramSlot: !(row && bankFigures(row).length) });
  }
  return { items, questions, fromBank };
}

export type SideDiagram = { status: 'ok'; url: string; family: string } | { status: 'none'; why: string };

async function readCached(runId: string, q: string): Promise<SideDiagram | null> {
  try {
    const blob = await downloadStudentFile(`${sideDiagramKey(runId, q)}.json`);
    const j = JSON.parse(await blob.text());
    if (j && (j.status === 'ok' || j.status === 'none')) return j as SideDiagram;
  } catch { /* not made yet */ }
  return null;
}

async function remember(runId: string, q: string, d: SideDiagram): Promise<SideDiagram> {
  try {
    await putStudentFile({ key: `${sideDiagramKey(runId, q)}.json`, body: Buffer.from(JSON.stringify({ ...d, at: new Date().toISOString() })), contentType: 'application/octet-stream' });   // the bucket takes no application/json (the bot stores its ink JSON the same way)
  } catch { /* a cache miss next time is fine */ }
  return d;
}

async function ask(prompt: string, maxTokens = 6000): Promise<string> {
  const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
    model: SIDE_DIAGRAM_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return anthropicText(msg);
}

/** The question's text and worked solution, as the diagram writer reads them. */
async function diagramSource(run: Run, q: string): Promise<{ question: string; solution: string } | null> {
  const rj = run.result_json ?? {};
  for (const [pi, qs] of Object.entries(questionsByPage(rj))) {
    if (!qs.includes(q)) continue;
    const { items } = await sideSolutionItems(run, Number(pi));
    const it = items.find((x) => x.qnum === q);
    if (!it) return null;
    if (it.figureImages?.length) return null;   // it has its own figure
    const solution = it.solution || (it.parts ?? []).map((p) => `(${p.label}) ${p.solution ?? ''}`).join('\n');
    if (!solution.trim()) return null;
    return { question: it.questionText, solution };
  }
  return null;
}

/**
 * A diagram for question `q`'s worked solution — made once, then read from the run's files.
 * Fails closed at every step: no picture is the answer whenever the model says it would not
 * help, names no family, writes a spec the library's verify refuses (one repair try), or
 * anything is unreachable.
 */
export async function sideDiagram(run: Run, q: string, opts: { make?: boolean } = {}): Promise<SideDiagram & { cached?: boolean }> {
  const cached = await readCached(run.id, q);
  if (cached) return { ...cached, cached: true };
  if (opts.make === false) return { status: 'none', why: 'not made yet' };
  const src = await diagramSource(run, q);
  if (!src) return remember(run.id, q, { status: 'none', why: 'has its own figure, or no worked solution' });
  try {
    const fams = await figureDoc(null);
    const list = ((fams.body as { families?: { name: string; line: string }[] })?.families ?? []).map((f) => `- ${f.name}: ${f.line}`).join('\n');
    if (!list) return { status: 'none', why: 'figure library unreachable' };   // not remembered — try again later
    const pick = firstJson(await ask(`You are helping a Singapore secondary / JC maths tutor read a worked solution beside a student's marked script.

Would ONE diagram make this worked solution clearly easier to follow for a student — a graph sketch, a triangle with its sides, a number line, a region, a tree, a speed–time graph, and so on? Say yes only when the picture adds something the lines of working do not; pure algebra needs no picture. If yes, choose the ONE figure family below that draws it.

QUESTION:
${src.question || '(not available)'}

WORKED SOLUTION:
${src.solution}

FIGURE FAMILIES:
${list}

Reply with JSON only: {"need": true|false, "family": "<name or null>", "why": "<one short line>"}`, 3000));
    const family = typeof pick?.family === 'string' ? pick.family : null;
    if (!pick || pick.need !== true || !family) return remember(run.id, q, { status: 'none', why: String(pick?.why ?? 'no diagram needed') });
    const doc = await figureDoc(family);
    const docText = JSON.stringify((doc.body as { doc?: unknown })?.doc ?? doc.body).slice(0, 12000);
    let reason = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const spec = firstJson(await ask(`Write the typed spec for ONE "${family}" figure that goes beside this worked solution. Every number, label and point must match the solution exactly — the library re-checks the maths and refuses anything inconsistent. Keep it to what the solution uses; no extra annotations. Labels must be SHORT (a letter, a number, or two or three words at most) — the library does not move labels apart, and two long labels near each other print on top of one another. Leave out a title or caption unless it is a few words.

QUESTION:
${src.question || '(not available)'}

WORKED SOLUTION:
${src.solution}

THE "${family}" SPEC LANGUAGE:
${docText}
${reason ? `\nYOUR LAST SPEC WAS REFUSED: ${reason}\nFix that and write it again.\n` : ''}
Reply with the spec as JSON only, with "family": "${family}".`));
      if (!spec) { reason = 'the reply held no JSON object'; continue; }
      const r = await renderFigure({ ...spec, family });
      if (!r.ok) { reason = r.reason; continue; }
      const put = await putStudentFile({ key: `${sideDiagramKey(run.id, q)}.png`, body: r.png, contentType: 'image/png' });
      return remember(run.id, q, { status: 'ok', url: fileHref(put.url), family: r.family });
    }
    return remember(run.id, q, { status: 'none', why: `the figure library refused the drawing (${reason.slice(0, 160)})` });
  } catch (e) {
    // A model or network failure is not remembered: the next open tries again.
    return { status: 'none', why: `could not draw: ${(e as Error).message.slice(0, 120)}` };
  }
}

/** Plain question text → HTML: words escaped, maths runs through KaTeX. */
export function plainPromptHtml(plain: string): string {
  return splitPlainMath(plain).map((p) => p.math
    ? katex.renderToString(plainMathToTex(p.text), { throwOnError: false, output: 'html' })
    : escapeHtml(p.text)).join('');
}

// ── Extras: the question typeset + the scheme marks on the solution lines (2 Nov 2026) ──
const extrasKey = (runId: string, q: string) => `${sideDiagramKey(runId, q)}-extras-v2.json`;

export async function readSideExtras(runId: string, q: string): Promise<SideExtras | null> {
  try {
    const j = JSON.parse(await (await downloadStudentFile(extrasKey(runId, q))).text());
    if (j && typeof j.questionLatex === 'string' && j.marked && typeof j.marked === 'object') return j as SideExtras;
  } catch { /* not made yet */ }
  return null;
}

/** The item for question q, wherever its page is. */
export async function sideItemFor(run: Run, q: string): Promise<SolutionsItem | null> {
  for (const [pi, qs] of Object.entries(questionsByPage(run.result_json ?? {}))) {
    if (!qs.includes(q)) continue;
    const { items } = await sideSolutionItems(run, Number(pi));
    return items.find((it) => it.qnum === q) ?? null;
  }
  return null;
}

/** Make (once) and keep the extras for question q. Never throws: null = nothing to show. */
export async function makeSideExtras(run: Run, q: string): Promise<SideExtras | null> {
  const cached = await readSideExtras(run.id, q);
  if (cached) return cached;
  const rj = run.result_json ?? {};
  const item = await sideItemFor(run, q);
  if (!item) return null;
  const plain = markerPrompt(rj, q);
  const needQuestion = (item.questionFromMarker || !/\$/.test(item.questionText)) && !markerPromptLatex(rj, q) && !!plain;
  const texts = solutionTexts(item);
  const schemes: Record<string, string> = {};
  for (const [label, codes] of Object.entries(schemeCodes(resultFor(rj, q)))) { const f = fullScheme(codes); if (f) schemes[label || '(whole question)'] = f; }
  const needMarks = Object.keys(texts).length > 0 && Object.keys(schemes).length > 0 && !Object.values(texts).some(hasOwnCodes);
  const out: SideExtras = { questionLatex: '', marked: {} };
  if (needQuestion || needMarks) {
    try {
      const raw = await ask(`You prepare a worked solution for a maths tutor's screen. Return ONLY JSON:
{"question_latex": "...", "solutions": { "<key>": "..." }}

${needQuestion ? `1. question_latex: the question text below, with every mathematical expression written as LaTeX inside $...$ (fractions as \\frac, powers, subscripts like u_{n+1}, \\sin, \\ln). Words stay as words, outside the $. Change nothing else.
QUESTION:
${plain}
` : '1. question_latex: "" (not needed).'}

${needMarks ? `2. solutions: for each key below, copy the solution text EXACTLY, line for line, character for character, and append the mark-scheme codes at the END of the line where each mark is earned, in square brackets: " [M1]", " [A1]", " [B1]", or several on one line " [M1 A1]". M = method mark (the line that shows the method), A = accuracy mark (the line with the correct value it depends on), B = a mark for a correct statement on its own. Use exactly the codes in the scheme for that part, in order, each once. Never change, add or remove any other character.
SCHEME (part label → codes; match a key to its part label):
${JSON.stringify(schemes)}
SOLUTION TEXTS (key → text):
${JSON.stringify(texts)}` : '2. solutions: {} (not needed).'}`, 8000);
      const j = firstJson(raw) as { question_latex?: unknown; solutions?: Record<string, unknown> } | null;
      if (j && typeof j.question_latex === 'string') out.questionLatex = j.question_latex.trim();
      for (const [k, v] of Object.entries(j?.solutions ?? {})) {
        if (typeof v === 'string' && texts[k] != null && sameApartFromCodes(texts[k], v)) out.marked[k] = v;
      }
    } catch (e) {
      console.error('[annotate-side extras]', (e as Error).message);
      return null; // try again next time
    }
  }
  try {
    await putStudentFile({ key: extrasKey(run.id, q), body: Buffer.from(JSON.stringify({ ...out, at: new Date().toISOString() })), contentType: 'application/octet-stream' });
  } catch { /* made again next time */ }
  return out;
}
