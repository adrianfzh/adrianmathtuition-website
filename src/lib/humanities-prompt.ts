// The humanities reader's prompt (SPEC-HUMANITIES.md §The reader on the plan, 8 Oct 2026) — ported
// word for word from the bot's ai/humanities-marker.js so the reads can run on the PLAN queue
// (plan_reads) instead of the paid key. The website owns the question, the sources and the scheme,
// so it can write the whole prompt itself; the plan reader adds nothing. Pure.
// The prompt text below is the benched one: change a word and the bench (§4) must run again.
import { maxOf, isPointsQuestion, tableText, diagramByKey, diagramText, rulesFor, tagsFor, SUBJECT_NAME, type QuestionInContext } from './humanities-questions';

export interface HumanitiesPayload {
  answer: string;
  subject?: string;
  /** 'points' = a point-marked part; 'structured' = from the student's own knowledge; else source-based. */
  kind?: string;
  skill?: string;
  level?: string;
  issue?: string;
  question: string;
  sources?: { id: string; provenance?: string; text: string }[];
  scheme?: { label?: string; levels: { level: number; does: string }[]; note?: string | null; slips?: string[]; lifts?: { from: number; how: string }[] };
  rules?: string[];
  tags?: { key: string; label: string; meaning: string }[];
  points?: { max: number; develop: boolean; command: string; list: { id: string; text: string; develop?: string }[]; rules: string[] };
}

/** What the reader is told about one answer: the question, its sources or data, and the scheme or the points. */
export function buildHumanitiesPayload(ctx: QuestionInContext, answer: string): HumanitiesPayload {
  const q = ctx.question;
  // A point-marked part (Geography) sends its creditable points in place of a level scheme.
  if (isPointsQuestion(q)) return {
    answer, subject: SUBJECT_NAME[ctx.set.subject], kind: 'points', skill: q.skill,
    issue: ctx.set.issue, question: q.question,
    sources: [
      ...(q.table ? [{ id: q.table.caption, provenance: '', text: tableText(q.table) }] : []),
      ...(q.diagram && diagramByKey(q.diagram.key) ? [{ id: q.diagram.caption, provenance: '', text: diagramText(diagramByKey(q.diagram.key)!) }] : []),
    ],
    points: { max: maxOf(q), develop: !!q.develop, command: q.command ?? 'explain', list: q.points ?? [], rules: q.rules ?? [] },
  };
  return {
    answer, subject: SUBJECT_NAME[ctx.set.subject], kind: ctx.set.kind, skill: q.skill,
    // A case study's Background Information rides with the issue line: the prompt has one slot for both.
    issue: ctx.set.background ? `${ctx.set.issue}\n\nBACKGROUND INFORMATION\n${ctx.set.background}` : ctx.set.issue,
    question: q.question,
    sources: ctx.inView.map(x => ({ id: x.id, provenance: x.provenance, text: x.text })),
    scheme: { label: ctx.scheme.label, levels: ctx.scheme.levels, note: ctx.scheme.note ?? null, slips: ctx.scheme.slips, lifts: ctx.scheme.lifts },
    rules: rulesFor(q.skill), tags: tagsFor(q.skill),
  };
}

/** What the belt needs to check a read of this answer. */
export function readContext(p: HumanitiesPayload): { points: boolean; max: number; tags: string[] } {
  const points = p.kind === 'points';
  return { points, max: points ? Number(p.points?.max) || 0 : (p.scheme?.levels ?? []).length, tags: (p.tags ?? []).map(t => t.key) };
}

/** The question's own words — its sources, data, question and the answer. A figure quoted from here is not a mark for the answer. */
export function payloadMaterial(p: HumanitiesPayload): string {
  return [p.issue, p.question, p.answer, ...(p.sources ?? []).map(x => `${x.provenance ?? ''} ${x.text}`), ...(p.points?.list ?? []).map(x => `${x.text} ${x.develop ?? ''}`)].filter(Boolean).join('\n');
}

/** The whole prompt for one read. Read 1 goes claim by claim; read 2 reads whole first (the two orders the bench was run on). */
export function humanitiesPrompt(p: HumanitiesPayload, pass: number): string {
  return `${buildSystemPrompt(p)}\n\n${buildUserMessage(p, { pass })}`;
}

// A point-marked part (Geography, 7 Oct 2026): the website sends the list of
// creditable points with the question; this file still knows no syllabus.
const isPoints = (p: HumanitiesPayload): boolean => !!p && p.kind === 'points';

function buildPointsSystemPrompt(p: HumanitiesPayload): string {
  const pts: Partial<NonNullable<HumanitiesPayload['points']>> = p.points || {};
  const list = (pts.list || []).map(x => `- [${x.id}] ${x.text}${x.develop ? `\n      developed by: ${x.develop}` : ''}`).join('\n');
  const rules = (pts.rules || []).map(r => `- ${r}`).join('\n');
  const develop = !!pts.develop;
  return `You are an experienced Singapore secondary ${p.subject || 'Geography'} teacher marking ONE student's typed answer to ONE point-marked question. The command word is: ${pts.command || 'explain'}.

THE CREDITABLE POINTS — the standard you use
${list}

HOW CREDIT WORKS
- credit 1: the answer makes this point clearly. The student's own words are fine; the idea must be there, not just a key word.
${develop ? '- credit 2: the answer makes the point AND develops it — a further detail, a reason, a figure from the data, an example or a consequence that belongs to that point.\n' : '- There is no extra credit for development in this question: the most a point earns is 1.\n'}- credit 0: the point is missing, only hinted at, or wrong.
- The same idea said twice is credited once. A vague line ("it is good for the country") earns nothing.
- A point that states something false, or a figure the data does not show, is not credited.
- A correct, relevant point that is NOT on the list may be credited as id "other" (credit 1${develop ? ', or 2 when developed' : ''}) — only when it truly answers the question. At most two.
${rules ? `\nRULES FOR THIS QUESTION\n${rules}\n` : ''}
HOW TO READ
1. Go through the list point by point. For each, find the student's words that make it, or decide it is not there.
2. Length, fluency and spelling earn nothing. Words that restate the question earn nothing.
3. Do not add the credits up. The total is counted for you.

WHAT YOU RETURN — one JSON object, nothing else
{
  "points": [ { "id": "<a point id from the list, or \"other\">", "credit": <0${develop ? ', 1 or 2' : ' or 1'}>, "quote": "<the piece of the student's answer that makes the point, copied EXACTLY, character for character; \"\" when credit is 0>", "note": "<under 20 words: why it is or is not credited>", "text": "<only for \"other\": the point, in under 20 words>" } ],
  "lift": "<ONE sentence: the single most useful thing this student should add or fix, said plainly to the student, naming the idea that is missing>",
  "gap": [ "<at most two short lines: what a full answer has that this one does not>" ],
  "summary": "<one line for the teacher>"
}

HARD RULES
- Give one entry for EVERY point on the list, in the list's order.
- A credited point MUST carry a quote that appears in the answer exactly as written.
- In "lift", "gap" and "note", NEVER mention a mark, a score or a number out of a total.
- Write to a ${p.level || 'secondary school'} student: short, plain words. Say what to do, not what was wrong with them.
- If every point is fully credited, "lift" says what to keep doing, and "gap" is [].`;
}

function buildPointsUserMessage(p: HumanitiesPayload, { pass = 1 }: { pass?: number } = {}): string {
  const data = (p.sources || []).map(s => `${s.id}${s.provenance ? ` (${s.provenance})` : ''}\n${s.text}`).join('\n\n');
  const order = pass % 2 === 0
    ? 'ORDER FOR THIS READ: read the whole answer first, then go down the list of points.'
    : 'ORDER FOR THIS READ: go down the list of points one at a time, looking for each in the answer.';
  return `${p.issue ? `THE TOPIC: ${p.issue}\n\n` : ''}${data ? `THE DATA THE QUESTION GIVES\n${data}\n\n` : ''}THE QUESTION\n${p.question}\n\nTHE STUDENT'S ANSWER (exactly as typed):\n<<<\n${p.answer}\n>>>\n\n${order}\n\nReturn the JSON object.`;
}

export function buildSystemPrompt(p: HumanitiesPayload): string {
  if (isPoints(p)) return buildPointsSystemPrompt(p);
  const s: Partial<NonNullable<HumanitiesPayload['scheme']>> = p.scheme || {};
  const levels = [...(s.levels || [])].sort((a, b) => a.level - b.level).map(l => `- Level ${l.level}: ${l.does}`).join('\n');
  const max = (s.levels || []).length;
  const tags = (p.tags || []).map(t => `- ${t.key}: ${t.label} — ${t.meaning}`).join('\n');
  const rules = (p.rules || []).map(r => `- ${r}`).join('\n');
  const slips = (s.slips || []).map(x => `- ${x}`).join('\n');
  const lifts = (s.lifts || []).map(x => `- From Level ${x.from}: ${x.how}`).join('\n');
  // A structured-response question (H2, 3 Oct 2026) is answered from the
  // student's OWN knowledge; the extract is only a starting point.
  const structured = p.kind === 'structured';
  const reading = structured
    ? `2. The answer comes from the student's OWN knowledge and examples. The extract is only a starting point: copying or rewording it is description, not explanation. Never ask for a quotation.
3. A point counts as EXPLAINED only when the answer says how or why it leads to the result the question names. A point that is named, listed or only illustrated is not explained.`
    : `2. A claim only counts as supported when the student ties it to the source: a quotation, a close paraphrase or a specific detail. A claim the source does not carry is not supported, however sensible it sounds.
3. Material copied from the source without saying what it shows stays at the lowest level.`;
  return `You are an experienced Singapore secondary ${p.subject || 'Social Studies'} teacher reading ONE student's typed answer to ONE ${structured ? 'structured-response' : 'source-based'} question. The skill tested is: ${s.label || p.skill}.

THE LEVEL SCHEME — the only standard you use
${levels}
${s.note ? `\nNote: ${s.note}\n` : ''}
RULES THAT APPLY TO EVERY SKILL
${rules}
${slips ? `\nCOMMON SLIPS AT THIS SKILL\n${slips}\n` : ''}${lifts ? `\nWHAT LIFTS AN ANSWER\n${lifts}\n` : ''}
HOW TO READ
1. Decide the level from what the answer DOES, by the scheme above. Length, fluency and spelling do not move the level. Words that restate the question, announce an answer, or thank the reader count for nothing, up or down.
${reading}
4. An answer sits at the HIGHEST level it genuinely reaches; weaker material beside a strong passage does not pull it down.

WHAT YOU RETURN — one JSON object, nothing else
{
  "level": <integer 1..${max}>,
  "claims": [ { "quote": "<a piece of the student's answer, copied EXACTLY, character for character>", "tag": "<one tag key>", "note": "<under 20 words: why>" } ],
  "lift": "<ONE sentence: the single most useful thing this student should do to reach the next level, said plainly to the student, ${structured ? 'naming the point to explain or the step that is missing' : 'naming the source or detail to use'}>",
  "gap": [ "<at most two short lines: what a top-level answer does that this one does not>" ],
  "summary": "<one line for the teacher>"
}

THE TAGS
${tags}

HARD RULES
- NEVER give or mention a mark, a score or a number out of a total. Levels only.
- Each "quote" must appear in the answer exactly as written (same spelling, same punctuation). Tag 2 to 6 of the claims that matter most; do not tag everything; quotes must not overlap.
- Write to a ${p.level || 'secondary school'} student: short, plain words. Say what to do, not what was wrong with them.
- If the answer is already at the top level, "lift" says what to keep doing, and "gap" is [].`;
}

export function buildUserMessage(p: HumanitiesPayload, { pass = 1 }: { pass?: number } = {}): string {
  if (isPoints(p)) return buildPointsUserMessage(p, { pass });
  const structured = p.kind === 'structured';
  const sources = (p.sources || []).map(s => structured ? `(${s.provenance})\n${s.text}` : `Source ${s.id}\n(${s.provenance})\n${s.text}`).join('\n\n');
  const order = pass % 2 === 0
    ? 'ORDER FOR THIS READ: read the whole answer first and decide the level from the scheme alone; write "level" as the FIRST key. Only then pick the claims.'
    : 'ORDER FOR THIS READ: go through the answer claim by claim first, then decide the level from what the claims show.';
  return `THE ISSUE: ${p.issue || ''}\n\n${structured ? 'THE EXTRACT (a starting point only — the answer is NOT marked against it)' : 'THE SOURCES'}\n${sources}\n\nTHE QUESTION\n${p.question}\n\nTHE STUDENT'S ANSWER (exactly as typed):\n<<<\n${p.answer}\n>>>\n\n${order}\n\nReturn the JSON object.`;
}
