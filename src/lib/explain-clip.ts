// The one-minute explanation (1 Oct 2026, Adrian: "students have too short
// attention span to sit through even a 20 minute lesson, they usually want to
// know immediately what they need to know … dominant unit is one question"):
// ONE lost-marks question from a marked paper, replayed on the chalk board —
// the student's own lines up to the ✗ one, the fix, the red pen's steps from
// there with the reason spoken under each, the Answer. Built from what the
// marker ALREADY wrote for the card (lib/review-fix: `fixes`, `corrections`,
// `working`) — no model call, nothing to approve, instant. The Chinese apps'
// per-question video (作业帮's 讲题视频) done as a page that plays, not a file.
//
// Pure: a StudentQuestion in, a LessonScript out (or null when the marking
// carries nothing to replay — then there is no door). The script passes
// lib/lesson-script validateLessonScript, so the player treats it exactly like
// a committed lesson: beats, the chalk theme, ▶ Auto, tap to pause. Voice clips
// are not written here (no `audio`); the player shows no 🔊 pill without them.

import type { Beat, BeatAction, CaptionScene, CharacterPose, EquationStep, EquationStepsScene, LessonScript, StepToken } from './lesson-script';
import type { StudentQuestion } from './portal-marking';

/** The most of the student's lines shown before the ✗ one (the card shows two; the board has room for the same). */
const LINES_BEFORE = 2;
/** The pen's steps replayed per part — past this the clip is no longer a minute. */
const STEPS_MAX = 6;
/** Corrections (✗ line + fix) replayed when no part has a continuation. */
const CORRECTIONS_MAX = 3;
/** Parts replayed — one scene each. */
const PARTS_MAX = 2;
/** lib/lesson-script NOTE_MAX_CHARS — a handwritten aside beside a token. */
const NOTE_MAX = 140;
/** lib/lesson-script's ceiling per spoken beat; the clip keeps well under it. */
const SAY_MAX = 220;

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// ── Speaking maths ───────────────────────────────────────────────────────────
// A reason from the red pen carries inline `$…$`; the validator refuses TeX in
// a spoken line, and the board shows the maths anyway, so the voice only has to
// SAY it well enough. Common commands become words; the rest is stripped.

const SPOKEN: [RegExp, string][] = [
  [/\\left|\\right|\\displaystyle|\\,|\\;|\\!|\\quad|\\qquad/g, ' '],
  [/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 '],
  [/\\sqrt\s*\{([^{}]*)\}/g, ' root $1 '],
  [/\\sqrt\s*(\w)/g, ' root $1 '],
  [/\^\s*\{?\s*2\s*\}?/g, ' squared '],
  [/\^\s*\{?\s*3\s*\}?/g, ' cubed '],
  [/\^\s*\{([^{}]*)\}/g, ' to the power $1 '],
  [/\^\s*(\w)/g, ' to the power $1 '],
  [/_\s*\{([^{}]*)\}/g, ' $1 '],
  [/_\s*(\w)/g, ' $1 '],
  [/\\times|\\cdot/g, ' times '],
  [/\\div/g, ' divided by '],
  [/\\pm/g, ' plus or minus '],
  [/\\le(?:q)?\b|\\leqslant/g, ' is less than or equal to '],
  [/\\ge(?:q)?\b|\\geqslant/g, ' is greater than or equal to '],
  [/\\ne(?:q)?\b/g, ' is not equal to '],
  [/\\approx/g, ' is about '],
  [/\\infty/g, ' infinity '],
  [/\\pi\b/g, ' pi '],
  [/\\theta\b/g, ' theta '],
  [/\\alpha\b/g, ' alpha '],
  [/\\beta\b/g, ' beta '],
  [/\\lambda\b/g, ' lambda '],
  [/\\mu\b/g, ' mu '],
  [/\\sigma\b/g, ' sigma '],
  [/\\ln\b/g, ' l n '],
  [/\\(sin|cos|tan|log|sec|cosec|cot|lg)\b/g, ' $1 '],
  [/\\int\b/g, ' the integral of '],
  [/\\sum\b/g, ' the sum of '],
  [/\\text(?:bf|it|rm)?\s*\{([^{}]*)\}/g, ' $1 '],
  [/\\mathrm\s*\{([^{}]*)\}/g, ' $1 '],
  [/\\circ\b|°/g, ' degrees '],
  [/\\%|%/g, ' percent '],
  [/\\[a-zA-Z]+/g, ' '],
  [/\s*=\s*/g, ' equals '],
  [/\s*<\s*/g, ' is less than '],
  [/\s*>\s*/g, ' is greater than '],
  [/\s*\+\s*/g, ' plus '],
  [/(\w)\s*-\s*(?=[\w(])/g, '$1 minus '],
  [/(^|[\s(])-\s*(?=[\w(])/g, '$1minus '],
  [/\s*\/\s*/g, ' over '],
  [/[{}$\\^_]/g, ' '],
];

/** One `$…$` run (or bare TeX) as words a voice can say. */
export function spokenMath(tex: string): string {
  let out = ` ${tex} `;
  for (const [re, to] of SPOKEN) out = out.replace(re, to);
  return out.replace(/\s+/g, ' ').trim();
}

/** A pen reason with inline maths → one spoken line, no TeX characters left, never empty. */
export function speakable(text: string, fallback = ''): string {
  let out = String(text ?? '').replace(/\$([^$]+)\$/g, (_, tex: string) => ` ${spokenMath(tex)} `);
  // Anything still TeX-shaped (a stray `$`, `\cmd` outside dollars) goes the same way.
  if (/[$\\^_{}]/.test(out)) out = spokenMath(out);
  out = out.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
  if (out.length > SAY_MAX) out = out.slice(0, SAY_MAX - 1).replace(/\s+\S*$/, '') + '…';
  return out || fallback;
}

// ── The board ────────────────────────────────────────────────────────────────

/** One line of working as a step: the whole line one token, so a beat can write, box or note it. */
function line(tex: string, id: string, hl?: StepToken['hl'], note?: string): EquationStep {
  const t: StepToken = { tex, id };
  if (hl) t.hl = hl;
  const step: EquationStep = { tokens: [t] };
  if (note) step.note = note;
  return step;
}

/** Maths that only maths carries — a relation, an operator, a command, a power, a fraction bar with digits. */
const MATH_SIGNS = /[=<>+^_\\]|\d\s*\/\s*\d|\b\d+\s*[a-zA-Z]\b/;
/** A sentence, not working: three or more words and none of the signs above (a science answer, a "hence" line). */
export function isProse(text: string): boolean {
  const t = s(text);
  return t.split(/\s+/).length >= 3 && !MATH_SIGNS.test(t);
}

/** A line's TeX for the board: the card stores bare TeX (no dollars) — strip a wrapping pair if one came through.
 *  A sentence is set as text (upright, spaces kept) — KaTeX eats the spaces of prose set as maths. */
function boardTex(text: string): string {
  const t = s(text).replace(/^\$+|\$+$/g, '').trim();
  if (!t) return '\\;';
  return isProse(t) ? `\\text{${t.replace(/[{}]/g, '')}}` : t;
}

function clip(text: string, max: number): string {
  const t = s(text);
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

const write = (token: string, at?: number): BeatAction => (at === undefined ? { do: 'write', token } : { do: 'write', token, at });
/** The character at the corner takes a pose (lesson-character.tsx) — the student reacting to the beat. */
const pose = (p: CharacterPose, at: number): BeatAction => ({ do: 'character', pose: p, at });

/** The question's own words for the verdict on a part: its slip line, else the marker's comment, else nothing.
 *  A slip starts with its part label — "(b): …", "(whole): …" — which the heading already says. */
function verdictFor(q: StudentQuestion, partIndex: number): string {
  const v = s(q.slips[partIndex]) || s(q.slips[0]) || s(q.comment);
  return v.replace(/^\((?:[a-z]{1,4}|[ivx]{1,4}|whole)\)\s*:?\s*/i, '').trim();
}

/**
 * A part with the red pen's continuation: yours (✗ last) → the steps from there → the Answer.
 * Every line is one step; every step has a beat, so the voice and the chalk move together.
 */
function continuationScene(q: StudentQuestion, fix: NonNullable<StudentQuestion['fixes']>[number], partIndex: number): EquationStepsScene {
  const steps: EquationStep[] = [];
  const beats: Beat[] = [];
  const yours = fix.yours.slice(-(LINES_BEFORE + 1));
  const wrongIdx = yours.length - 1;
  // Your lines before the wrong one — written together, one beat.
  const before = yours.slice(0, wrongIdx);
  before.forEach((t, i) => steps.push(line(boardTex(t), `y${i}`)));
  if (before.length) {
    beats.push({
      say: before.length === 1 ? 'Here is your working, up to the line that went wrong.' : 'Here are your lines, up to the one that went wrong.',
      do: [pose('point', 0.02), ...before.map((_, i) => write(`y${i}`, Math.min(0.9, 0.15 + i * 0.35)))],
    });
  }
  // The ✗ line, boxed, with the marker's verdict beside it.
  const wrongId = `y${wrongIdx}`;
  steps.push(line(boardTex(yours[wrongIdx]), wrongId, 'rose'));
  const verdict = verdictFor(q, partIndex);
  const wrongBeat: Beat = {
    say: speakable(verdict, 'This line is where the marks went.'),
    do: [write(wrongId, 0.05), pose('oops', 0.3), { do: 'mark', kind: 'box', token: wrongId, at: 0.35 }],
  };
  if (verdict) wrongBeat.do.push({ do: 'note', text: clip(verdict, NOTE_MAX), near: wrongId, at: 0.5 });
  beats.push(wrongBeat);
  // The pen's steps from there, one beat each, the reason spoken and written under the line.
  const pen = fix.steps.slice(0, STEPS_MAX);
  pen.forEach((st, i) => {
    const id = `s${i}`;
    const why = s(st.why);
    steps.push(line(boardTex(st.latex), id, 'emerald', why ? clip(why, NOTE_MAX) : undefined));
    beats.push({
      say: speakable(why, i === 0 ? 'From your line, this is the step to take.' : 'Then this.'),
      do: [pose(i === 0 ? 'think' : 'nod', 0.02), write(id, 0.1)],
    });
  });
  // The Answer, when the pen's last step is not already it.
  const final = s(fix.final);
  if (final) {
    steps.push(line(`\\textbf{Answer:}\\; ${boardTex(final)}`, 'ans'));
    beats.push({ say: 'And that is the answer.', do: [pose('cheer', 0.1), write('ans', 0.2)] });
  }
  const label = fix.label ? `Q${q.questionNumber}${fix.label}` : `Q${q.questionNumber}`;
  return { type: 'equation-steps', heading: `${label} · where the mark went`, steps, beats };
}

/**
 * No continuation on any part (a science paper, an older maths run): every ✗ line
 * with the red pen's fix under it — you wrote, the fix — up to three pairs. A pair of
 * WORKING goes on one equation board; a pair of SENTENCES (a science answer) is a
 * caption scene, so the chalk hand writes the words and they wrap on a phone (1 Oct
 * 2026, Adrian's screenshot: a sentence set as maths lost its spaces and went italic).
 */
function correctionScenes(q: StudentQuestion, corrections: NonNullable<StudentQuestion['corrections']>): (EquationStepsScene | CaptionScene)[] {
  const heading = `Q${q.questionNumber} · what to write instead`;
  const out: (EquationStepsScene | CaptionScene)[] = [];
  let board: EquationStepsScene | null = null;
  corrections.slice(0, CORRECTIONS_MAX).forEach((c, i) => {
    const verdict = i === 0 ? verdictFor(q, 0) : '';
    const fixSay = speakable(verdict ? `The fix: ${verdict}` : '', 'It should read like this.');
    if (isProse(c.yours) || isProse(c.fix)) {
      board = null;
      out.push({
        type: 'caption', heading,
        text: `✗ You wrote: ${s(c.yours)}\n\n✓ Write instead: ${s(c.fix)}`,
        // The beat SAYS the sentence: that is what a voice would read, and the silent Auto
        // timer is sized by the spoken words (lib/lesson-beats beatAutoMs) — a three-word
        // beat ended before the hand had written the line (1 Oct 2026).
        beats: [
          { say: speakable(`${i === 0 ? 'You wrote' : 'Then you wrote'}: ${s(c.yours)}`), do: [pose('oops', 0.02), { do: 'write', text: 'text', para: 0, at: 0.05 }] },
          { say: speakable(`Write instead: ${s(c.fix)}. ${verdict}`), do: [pose('nod', 0.02), { do: 'write', text: 'text', para: 1, at: 0.05 }] },
        ],
      });
      return;
    }
    if (!board) { board = { type: 'equation-steps', heading, steps: [], beats: [] }; out.push(board); }
    const y = `y${i}`, f = `f${i}`;
    board.steps.push(line(boardTex(c.yours), y, 'rose'));
    board.steps.push(line(boardTex(c.fix), f, 'emerald'));
    board.beats!.push({ say: i === 0 ? 'You wrote this line.' : 'Then you wrote this.', do: [pose('oops', 0.02), write(y, 0.1), { do: 'mark', kind: 'box', token: y, at: 0.6 }] });
    board.beats!.push({ say: fixSay, do: [pose('nod', 0.02), write(f, 0.1)] });
  });
  return out;
}

/** Whether the marking carries enough to replay — the door shows only then. */
export function canExplain(q: Pick<StudentQuestion, 'fixes' | 'corrections'>): boolean {
  if ((q.fixes ?? []).some(f => f.yours.length > 0 && f.steps.length > 0)) return true;
  return (q.corrections ?? []).some(c => s(c.yours) && s(c.fix));
}

/** The route of a question's clip on its paper. */
export function explainHref(runId: string, questionNumber: string): string {
  return `/app/marking/${runId}/explain/${encodeURIComponent(questionNumber)}`;
}

/**
 * The clip for one lost-marks question, or null when there is nothing to replay.
 * `slug` only names the player's per-lesson preferences; the script never touches disk.
 */
export function buildExplainScript(q: StudentQuestion, runId: string): LessonScript | null {
  const fixes = (q.fixes ?? []).filter(f => f.yours.length > 0 && f.steps.length > 0).slice(0, PARTS_MAX);
  const scenes: (EquationStepsScene | CaptionScene)[] = fixes.map((f, i) => continuationScene(q, f, i));
  if (scenes.length === 0) {
    const corrections = (q.corrections ?? []).filter(c => s(c.yours) && s(c.fix));
    if (corrections.length === 0) return null;
    scenes.push(...correctionScenes(q, corrections));
  }
  const qn = q.questionNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'q';
  return {
    slug: `explain-${runId.slice(0, 8)}-${qn}`,
    title: `Q${q.questionNumber}${q.topic ? ` · ${q.topic}` : ''}`,
    level: 'AM',
    // The player's Practise link reads `topic`; the page hands it the card's own link, so a
    // question with no topic still validates.
    topic: q.topic || 'This question',
    minutes: 1,
    theme: 'chalk',
    // The cartoon teacher at the corner reacts to the beats (poses above).
    character: 'teacher',
    scenes,
  };
}
