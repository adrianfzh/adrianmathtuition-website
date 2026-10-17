// The model answer, built from the student's own answer (17 Oct 2026, Adrian: students say "the app does not
// give answers" → "yes, but don't name it as 'Your answer, at full marks'" → shown as "Model answer").
//
// After an answer is marked, one read (on plan) rewrites the student's OWN answer up to full marks: it keeps what
// earned credit, adds what was missing, and marks every added piece [[+ … +]] so the page can highlight it — the
// student sees their answer get better, not a stranger's essay. Before a student sees it, the production reader
// re-marks it (a second read); it is shown only when that read puts it at the top of the scale. Otherwise nothing
// is shown — never a model answer that would not itself earn full marks. Pure here; the steps run in
// lib/humanities-settle-run (settleModel); stored in humanities_runs.model_answer.
import type { HumanitiesPayload } from './humanities-prompt';

export const MODEL_WRITE_KIND = 'humanities-model';
export const MODEL_CHECK_KIND = 'humanities-model-check';

export interface ModelSegment { text: string; added: boolean }
export type ModelState =
  | { state: 'writing'; readId: string }
  | { state: 'checking'; readId: string; segments: ModelSegment[] }
  | { state: 'ready'; segments: ModelSegment[] }
  | { state: 'dropped'; why: string };

export function modelPrompt(p: HumanitiesPayload, report: { lift?: string | null; gap?: string[] }): string {
  const standard = p.points
    ? p.points.list.map(x => `- ${x.text}${x.develop ? ` (developed by: ${x.develop})` : ''}`).join('\n') + (p.points.rules.length ? `\nRules: ${p.points.rules.join(' ')}` : '')
    : (p.scheme?.levels ?? []).map(l => `Level ${l.level}: ${l.does}`).join('\n');
  const sources = (p.sources ?? []).map(s => `${s.id}${s.provenance ? ` (${s.provenance})` : ''}\n${s.text}`).join('\n\n');
  return [
    `You are an experienced Singapore secondary ${p.subject ?? 'Humanities'} teacher. A student answered the question below. Rewrite THEIR answer so it earns full marks.`,
    '',
    'QUESTION', p.question,
    ...(sources ? ['', 'WHAT CAME WITH THE QUESTION', sources] : []),
    '', p.points ? `THE CREDITABLE POINTS (full marks = ${p.points.max})` : 'THE LEVEL SCHEME (full marks = the top level)', standard,
    '', "THE STUDENT'S ANSWER", p.answer,
    ...(report.lift ? ['', `WHAT THE MARKER SAID TO ADD: ${report.lift}`] : []),
    ...(report.gap?.length ? report.gap.map(g => `- ${g}`) : []),
    '',
    'HOW TO WRITE IT',
    "- Start from the student's own answer. Keep every sentence that already earns credit, in their words (fix only spelling).",
    '- Add what is missing for full marks, and nothing more. Change or remove a sentence only when it is wrong.',
    '- Wrap EVERY piece you add or change in [[+ and +]], e.g. "Source A says the tables are cleaner. [[+ Source B agrees: the centre is \'much cleaner\'. +]]"',
    '- Quote the sources exactly when you use them. Use only facts that are correct and in the syllabus.',
    '- Write as a strong student would in the exam: plain, clear sentences, one idea a sentence, the length the marks deserve.',
    '- One point a paragraph: start each new point (a similarity, a difference, a reason, a judgement) on its own line, with a blank line between points. Keep a [[+ … +]] piece inside one paragraph.',
    '- No headings, no notes to the student, no mention of marks or levels.',
    '',
    'Reply with the rewritten answer only.',
  ].join('\n');
}

/** The reply → segments (added pieces flagged) and the plain text for the check read, or null. */
export function parseModel(reply: string | null | undefined): { segments: ModelSegment[]; text: string } | null {
  const raw = String(reply ?? '').replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  if (!raw) return null;
  const segments: ModelSegment[] = [];
  const push = (text: string, added: boolean) => { if (text) segments.push({ text, added }); };
  const re = /\[\[\+([\s\S]*?)\+\]\]/g;
  let at = 0;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    push(raw.slice(at, m.index), false);
    // The added piece's own edge spaces and line breaks stay outside the highlight, so paragraphs survive.
    const [, lead, core, trail] = m[1].match(/^(\s*)([\s\S]*?)(\s*)$/) as RegExpMatchArray;
    push(lead, false); push(core, true); push(trail, false);
    at = m.index + m[0].length;
  }
  push(raw.slice(at), false);
  const clean = segments.map(s => ({ ...s, text: s.text.replace(/\[\[\+|\+\]\]/g, '').replace(/\n[ \t]+/g, '\n') }))
    .filter((s, i, all) => s.text && !(s.added === false && /^[ \t]+$/.test(s.text) && (i === 0 || /\n$/.test(all[i - 1].text))));
  const text = clean.map(s => s.text).join('').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 15 || words > 900) return null;
  return { segments: clean, text };
}

/** Full marks on the check read: the top level, or every mark of a point-marked question. */
export const isTop = (level: number | null, max: number): boolean => level != null && max > 0 && level >= max;
