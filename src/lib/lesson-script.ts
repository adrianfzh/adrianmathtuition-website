// Scene-script schema for the animated lesson engine (/app/lesson/[slug]).
//
// A lesson is a committed JSON file (data/lessons/<slug>.json) validated by
// `validateLessonScript` — no CMS, no AI at runtime. The player is pure client
// code that interprets these six scene types; a phase-2 drafting pipeline only
// ever has to emit this shape (plain strings + numbers, KaTeX in `$…$`), so
// keep the schema declarative: no expressions to evaluate, no code strings.
//
// Design decisions the player leans on (change them here and the player
// together, never one side alone):
//
//   · equation-steps lines are arrays of TOKENS, not one TeX string. Tokens are
//     the unit of highlighting (`hl`) and of the moved-term animation: a token
//     carrying `from: "<id>"` flies in from the earlier-revealed token that
//     declared `id: "<id>"` (FLIP clone, landing exactly on the destination
//     glyph). One KaTeX string per line would leave nothing addressable.
//   · graph-morph states are POLYNOMIAL COEFFICIENT ARRAYS (constant term
//     first), and the player lerps coefficients between adjacent states. That
//     makes every intermediate frame a real polynomial (total, never NaN — a
//     literal (1+x)^t would be undefined left of x = −1 for fractional t) and
//     the coefficients ARE the teaching object in a binomial lesson.
//   · annotate reuses StepToken so callout targets address the same ids the
//     moved-term animation uses.
//   · check scenes carry only the bank question id + presentation strings; the
//     SERVER resolves the question through the same eligibility gate practice
//     uses (lib/lesson-load.resolveCheckScene) — the script can never smuggle
//     an ineligible question in front of a student.
//   · narration is ADDITIVE and text-first: every scene may carry spoken
//     English (`narration`) and a committed clip for it (`audio`). Captions
//     never leave the screen; the voice reads over them. A string narrates the
//     whole scene, an array narrates each sub-step so the voice and the reveal
//     line up (docs/LESSONS.md has the authoring rules).
//   · BEATS (2026-09-04) are the finer cut of the same idea: a scene may carry
//     `beats` — short spoken ideas (`say`), each with the visual actions (`do`)
//     cued to ITS OWN clip. A beat IS the scene's sub-step (sceneStepCount =
//     beats.length), so the whole per-step machinery — one clip per step, the
//     Auto timers, ‹ / Continue, the teacher's cursor — carries over unchanged;
//     `narration` / `audio` are DERIVED from the beats (never hand-written
//     beside them — the validator refuses both on one scene). Actions address
//     the scene's own objects (a step, a token id, a callout, a graph state, a
//     prose field) and the validator checks every reference exists, exactly
//     as it does for `from` and callout `target`. What the actions mean on the
//     board is lib/lesson-beats.ts (pure); how they look is the player.
//
// Pure module (repo testing policy): no I/O, no React — importable from the
// client player, the server page, API routes and vitest alike.

import { splitParagraphs } from './lesson-speech';

/** Highlight / callout tones — the portal's soft tint palette. */
export const LESSON_TONES = ['amber', 'sky', 'rose', 'emerald'] as const;
export type LessonTone = (typeof LESSON_TONES)[number];

export interface StepToken {
  /** KaTeX fragment (no surrounding dollars — rendered directly). */
  tex: string;
  /** Tinted pill behind the token, drawing the eye to it. */
  hl?: LessonTone;
  /** Names this token so a later `from` or a callout `target` can address it. */
  id?: string;
  /** Fly in from the earlier-revealed token with this id (moved-term FLIP). */
  from?: string;
}

export interface EquationStep {
  tokens: StepToken[];
  /** One plain sentence under the line (inline `$…$` allowed). */
  note?: string;
}

/** One labelled state of a graph morph: y = Σ coeffs[i]·x^i (constant first). */
export interface GraphState {
  /** Shown above the axes while this state holds (inline `$…$` allowed). */
  label: string;
  coeffs: number[];
}

export interface GraphWindow {
  xMin: number; xMax: number; yMin: number; yMax: number;
}

export interface Callout {
  /** `id` of the token this callout points at. */
  target: string;
  /** Short naming phrase (inline `$…$` allowed). */
  label: string;
  tone?: LessonTone;
}

// ── Narration (the voice track) ──────────────────────────────────────────────

/** Spoken-English narration for a scene, plus its audio. Optional everywhere. */
export interface NarrationFields {
  /**
   * Plain spoken English — NO TeX. Say maths the way a teacher says it aloud
   * ("five choose three", "two to the power five minus r"). A string narrates
   * the whole scene; an array narrates each sub-step in turn — exactly one
   * entry per step (see sceneStepCount) — so the voice and the reveal align.
   * Check scenes narrate the prompt lead-in only, never the answer.
   */
  narration?: string | string[];
  /**
   * Audio for `narration`, same shape (one URL, or one per sub-step): a
   * same-origin path under /lessons/ (a committed file in public/) or an
   * https URL. Written by scripts/lessons/generate-narration.mjs — or by hand,
   * for a human recording dropped into the same file names.
   */
  audio?: string | string[];
  /**
   * Optional word/sentence timing sidecar(s) for `audio`, same shape (one
   * path, or one per sub-step — `null` for a step without one). Sits beside
   * the clip as `/lessons/<slug>/scene-NN[-K].timing.json` (contract in
   * lib/lesson-speech.ts). Drives the spoken-text animation exactly; without
   * it the player times the words proportionally over the clip. The player
   * never probes for a sidecar that is not declared here (no 404 per clip).
   */
  timing?: string | (string | null)[];
}

// ── Beats (the beat model, 2026-09-04) ───────────────────────────────────────
//
// A scene with `beats` is narrated as short ideas, one clip each; every beat's
// actions are cued to its own clip, so the visual and the sentence about it
// land together at every beat boundary — exact there, estimated (`at`) inside
// a clip. Scenes without `beats` behave exactly as before.

/** The look of the stage. `slide` is the original card; `chalk` a dark board
 *  with a pen; `paper` the same mechanics on a light ruled ground. */
export const LESSON_THEMES = ['slide', 'chalk', 'paper'] as const;
export type LessonTheme = (typeof LESSON_THEMES)[number];

/** The prose fields an action may write: which exist depends on the scene type
 *  (`expression` is an annotate scene's token row). */
export const PROSE_FIELDS = ['title', 'promise', 'heading', 'intro', 'text', 'caption', 'prompt', 'expression'] as const;
export type ProseField = (typeof PROSE_FIELDS)[number];

export const MARK_KINDS = ['underline', 'circle', 'box'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** What `clear` wipes: the pen layer (marks + notes + focus, the default), one
 *  part of it, or the whole board (everything written so far). */
export const CLEAR_SCOPES = ['pen', 'marks', 'notes', 'focus', 'board'] as const;
export type ClearScope = (typeof CLEAR_SCOPES)[number];

/**
 * What a write / reveal / focus points at — exactly ONE of these per action.
 * `step` = an equation-steps line, `callout` = an annotate callout, `token` = a
 * token id (equation-steps / annotate), `text` = a prose field of the scene;
 * `para` narrows `text: "text"` to one paragraph of a caption.
 */
export interface BeatTarget {
  step?: number;
  callout?: number;
  token?: string;
  text?: ProseField;
  para?: number;
}

/** `at` — fraction (0‥1) into the beat's clip at which the action fires.
 *  Estimated by the author; unspecified actions spread across the clip's
 *  first part in listed order (lib/lesson-beats.resolveActionTimes). */
interface Timed { at?: number }

export type BeatAction =
  /** The target appears by DRAW-ON (a pen sweep in the chalk/paper themes). */
  | ({ do: 'write' } & BeatTarget & Timed)
  /** The target appears by the plain reveal (fade/rise) — no pen. */
  | ({ do: 'reveal' } & BeatTarget & Timed)
  /** Pulse a token (or several) — the eye goes there. */
  | ({ do: 'highlight'; token: string | string[] } & Timed)
  /** Fly the earlier token with this id onto the later line that declared `from` for it (the FLIP). */
  | ({ do: 'move'; from: string } & Timed)
  /** graph-morph: ease the curve to states[state]. */
  | ({ do: 'morph'; state: number } & Timed)
  /** A hand-drawn underline / circle / box around one or more tokens. */
  | ({ do: 'mark'; kind: MarkKind; token: string | string[] } & Timed)
  /** A handwritten aside (inline `$…$` allowed), beside a token or under the working. */
  | ({ do: 'note'; text: string; near?: string } & Timed)
  /** Ease the board's view onto the target for `hold` seconds (at 1×; default 2.2), then release. */
  | ({ do: 'focus'; hold?: number } & BeatTarget & Timed)
  /** Wipe the pen layer (default) or the whole board. */
  | ({ do: 'clear'; what?: ClearScope } & Timed);

export type BeatActionKind = BeatAction['do'];
export const BEAT_ACTION_KINDS: readonly BeatActionKind[] = ['write', 'reveal', 'highlight', 'move', 'morph', 'mark', 'note', 'focus', 'clear'];

export interface Beat {
  /** One spoken idea — plain English, no TeX, ≤ ~40 words (the verifier warns above). */
  say: string;
  /** The visual actions cued to THIS beat's clip, in firing order. May be empty (a beat that only speaks). */
  do: BeatAction[];
  /** Its clip, /lessons/<slug>/scene-NN-bK.mp3 — written by scripts/lessons/generate-narration.mjs. */
  audio?: string;
  /** Optional timing sidecar for the clip (same contract as NarrationFields.timing). */
  timing?: string;
}

/** Every scene may carry beats instead of narration. */
export interface BeatFields { beats?: Beat[] }

export type TitleScene = NarrationFields & BeatFields & { type: 'title'; title: string; promise: string };
export type CaptionScene = NarrationFields & BeatFields & { type: 'caption'; heading?: string; text: string };
export type EquationStepsScene = NarrationFields & BeatFields & {
  type: 'equation-steps'; heading?: string; intro?: string; steps: EquationStep[];
};
export type GraphMorphScene = NarrationFields & BeatFields & {
  type: 'graph-morph'; heading?: string; caption?: string;
  states: GraphState[]; window: GraphWindow; xLabel?: string; yLabel?: string;
};
export type AnnotateScene = NarrationFields & BeatFields & {
  type: 'annotate'; heading?: string; intro?: string;
  tokens: StepToken[]; callouts: Callout[];
};
export type CheckScene = NarrationFields & BeatFields & {
  type: 'check';
  /** questions.id of a REAL bank question (uuid). */
  qid: string;
  /** Context line above the question (overrides nothing — the question text
   *  itself always renders). */
  prompt?: string;
  /** Input placeholder, e.g. "k = ?". */
  placeholder?: string;
  /** One-line explanation shown at reveal (and after a correct answer). */
  why: string;
};

export type Scene =
  | TitleScene
  | CaptionScene
  | EquationStepsScene
  | GraphMorphScene
  | AnnotateScene
  | CheckScene;

export type SceneType = Scene['type'];

export interface LessonScript {
  slug: string;
  title: string;
  /** Bank taxonomy level (AM / EM / JC / S1 / S2). */
  level: string;
  /** EXACT canonical topic string (lib/canonical-topics.ts) — deep links and
   *  the practice CTA depend on it verbatim. */
  topic: string;
  /** Honest estimate shown on entry points ("4 min"). */
  minutes: number;
  /** The stage's look (default `slide` — the original card, untouched). */
  theme?: LessonTheme;
  scenes: Scene[];
}

// ── What the player actually receives ────────────────────────────────────────
// The server page swaps every `check` scene for a RESOLVED one (question
// markdown + the official answer for instant local grading + the reveal) or a
// skipped marker when the bank question no longer passes the eligibility gate.
// The answer travelling to the client is the same exposure class as
// /api/portal/practice/solution (any signed-in session may fetch the full
// worked solution for an eligible question), so nothing new leaks.

export interface ResolvedCheckScene extends NarrationFields, BeatFields {
  type: 'check';
  qid: string;
  prompt: string | null;
  placeholder: string | null;
  /** Render-ready question markdown (stem + parts, no solution). */
  markdown: string;
  marks: number | null;
  /** Official bank answer — graded locally with lib/notebook.checkTypedAnswer. */
  answer: string;
  why: string;
}

export type SkippedCheckScene = { type: 'check-skipped' };

export type PlayScene =
  | TitleScene
  | CaptionScene
  | EquationStepsScene
  | GraphMorphScene
  | AnnotateScene
  | ResolvedCheckScene
  | SkippedCheckScene;

// ── Validation ───────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; script: LessonScript }
  | { ok: false; errors: string[] };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Per narration entry (a whole scene or one step) — a spoken beat, not an essay. */
export const NARRATION_MAX_CHARS = 600;
/** Characters that only ever mean TeX leaked into a spoken line. */
const TEX_LIKE_RE = /[$\\^_{}]/;
/** A committed clip: /lessons/<slug>/<file>.<audio ext> — no query, no `..`. */
const LESSON_AUDIO_PATH_RE = /^\/lessons\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:mp3|m4a|ogg|wav)$/;
/** A committed timing sidecar beside its clip: /lessons/<slug>/<file>.timing.json. */
const LESSON_TIMING_PATH_RE = /^\/lessons\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9][A-Za-z0-9._-]*\.timing\.json$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
function optionalString(v: unknown): boolean {
  return v === undefined || nonEmptyString(v);
}
function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isTone(v: unknown): boolean {
  return (LESSON_TONES as readonly string[]).includes(v as string);
}

/** A same-origin clip under /lessons/ or an https URL — the only audio sources a script may name. */
export function isLessonAudioUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (LESSON_AUDIO_PATH_RE.test(v)) return true;
  if (!v.startsWith('https://')) return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

/** A same-origin `.timing.json` under /lessons/ or an https URL. */
export function isLessonTimingUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (LESSON_TIMING_PATH_RE.test(v)) return true;
  if (!v.startsWith('https://')) return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

/** Validate one token; returns its id (if any) so callers can track scope. */
function validateToken(
  t: unknown, where: string, errors: string[],
  seenIds: Set<string>, earlierIds: Set<string> | null,
): void {
  if (!isRecord(t)) { errors.push(`${where}: token must be an object`); return; }
  if (!nonEmptyString(t.tex)) errors.push(`${where}: token needs non-empty tex`);
  if (t.hl !== undefined && !isTone(t.hl)) {
    errors.push(`${where}: hl must be one of ${LESSON_TONES.join('/')}`);
  }
  if (t.id !== undefined) {
    if (!nonEmptyString(t.id)) errors.push(`${where}: token id must be a non-empty string`);
    else if (seenIds.has(t.id)) errors.push(`${where}: duplicate token id "${t.id}" in this scene`);
    else seenIds.add(t.id);
  }
  if (t.from !== undefined) {
    if (earlierIds === null) {
      errors.push(`${where}: "from" is only meaningful in equation-steps`);
    } else if (!nonEmptyString(t.from) || !earlierIds.has(t.from as string)) {
      errors.push(`${where}: "from" references unknown earlier token id "${String(t.from)}"`);
    }
  }
}

function validateNarrationText(v: unknown, where: string, errors: string[]): void {
  if (!nonEmptyString(v)) { errors.push(`${where}: narration must be a non-empty string`); return; }
  const len = v.trim().length;
  if (len > NARRATION_MAX_CHARS) {
    errors.push(`${where}: narration is ${len} chars — keep one spoken beat under ${NARRATION_MAX_CHARS}`);
  }
  if (TEX_LIKE_RE.test(v)) {
    errors.push(`${where}: narration must be plain spoken English — no TeX (found one of $ \\ ^ _ { })`);
  }
}

/**
 * narration / audio on one scene. `steps` is the scene's sub-step count (null
 * when the scene body itself failed, so the per-step length rule is skipped
 * rather than piling a misleading error on top).
 */
function validateNarration(
  scene: Record<string, unknown>, steps: number | null, at: string, errors: string[],
): void {
  const n = scene.narration;
  const a = scene.audio;
  if (n !== undefined) {
    if (Array.isArray(n)) {
      if (n.length === 0) errors.push(`${at}: narration array must not be empty`);
      if (steps !== null && n.length !== steps) {
        errors.push(`${at}: narration array must have exactly ${steps} entries (one per sub-step), got ${n.length}`);
      }
      n.forEach((t, i) => validateNarrationText(t, `${at}.narration[${i}]`, errors));
    } else {
      validateNarrationText(n, `${at}.narration`, errors);
    }
  }
  if (a === undefined) return;
  if (n === undefined) {
    errors.push(`${at}: audio needs narration text (the transcript the voice reads — captions stay on screen)`);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(n)) {
      errors.push(`${at}: audio must be a single URL when narration is a single string`);
    } else if (a.length !== n.length) {
      errors.push(`${at}: audio must have one clip per narration entry (${n.length}), got ${a.length}`);
    }
    a.forEach((u, i) => {
      if (!isLessonAudioUrl(u)) errors.push(`${at}.audio[${i}]: must be a /lessons/<slug>/… path or an https URL (got "${String(u)}")`);
    });
  } else {
    if (Array.isArray(n)) errors.push(`${at}: audio must be an array (one clip per narration entry)`);
    if (!isLessonAudioUrl(a)) errors.push(`${at}.audio: must be a /lessons/<slug>/… path or an https URL (got "${String(a)}")`);
  }
  // timing (optional): the sidecar for each clip — same shape as audio, null
  // allowed per step (a clip timed later, or never).
  const t = scene.timing;
  if (t === undefined) return;
  if (Array.isArray(t)) {
    if (!Array.isArray(a)) {
      errors.push(`${at}: timing must be a single path when audio is a single clip`);
    } else if (t.length !== a.length) {
      errors.push(`${at}: timing must have one entry per audio clip (${a.length}), got ${t.length}`);
    }
    t.forEach((u, i) => {
      if (u !== null && !isLessonTimingUrl(u)) errors.push(`${at}.timing[${i}]: must be a /lessons/<slug>/….timing.json path, an https URL or null (got "${String(u)}")`);
    });
  } else {
    if (Array.isArray(a)) errors.push(`${at}: timing must be an array (one sidecar or null per clip)`);
    if (!isLessonTimingUrl(t)) errors.push(`${at}.timing: must be a /lessons/<slug>/….timing.json path or an https URL (got "${String(t)}")`);
  }
}

// ── Beat validation ──────────────────────────────────────────────────────────

/** What a scene exposes for actions to address — built while its body validates. */
interface BeatScope {
  type: string;
  /** equation-steps: line count. */
  steps: number;
  /** annotate: callout count. */
  callouts: number;
  /** graph-morph: state count. */
  states: number;
  /** Token ids (equation-steps / annotate). */
  tokenIds: Set<string>;
  /** `from` ids some later token flies from (equation-steps). */
  fromIds: Set<string>;
  /** Prose fields present on this scene (only these may be written). */
  prose: Set<ProseField>;
  /** Paragraphs of a caption's `text`. */
  paragraphs: number;
}

/** Per beat: the longest a handwritten aside may run (it sits beside a token). */
export const NOTE_MAX_CHARS = 140;

function integerIn(v: unknown, n: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;
}

function tokenList(v: unknown): string[] | null {
  if (typeof v === 'string') return v.trim() ? [v] : null;
  if (Array.isArray(v) && v.length > 0 && v.every(nonEmptyString)) return v as string[];
  return null;
}

/** One target (write / reveal / focus): exactly one field, resolvable in this scene. */
function validateTarget(a: Record<string, unknown>, scope: BeatScope, where: string, errors: string[]): void {
  const fields = (['step', 'callout', 'token', 'text'] as const).filter(k => a[k] !== undefined);
  if (fields.length !== 1) {
    errors.push(`${where}: needs exactly one of step / callout / token / text (got ${fields.length ? fields.join(', ') : 'none'})`);
    return;
  }
  if (a.para !== undefined && a.text !== 'text') errors.push(`${where}: para only narrows text: "text"`);
  switch (fields[0]) {
    case 'step':
      if (scope.type !== 'equation-steps') errors.push(`${where}: step targets only exist on equation-steps scenes`);
      else if (!integerIn(a.step, scope.steps)) errors.push(`${where}: step must be an integer in 0…${scope.steps - 1} (got ${String(a.step)})`);
      break;
    case 'callout':
      if (scope.type !== 'annotate') errors.push(`${where}: callout targets only exist on annotate scenes`);
      else if (!integerIn(a.callout, scope.callouts)) errors.push(`${where}: callout must be an integer in 0…${scope.callouts - 1} (got ${String(a.callout)})`);
      break;
    case 'token':
      if (!nonEmptyString(a.token) || !scope.tokenIds.has(a.token)) errors.push(`${where}: token "${String(a.token)}" is not a token id in this scene`);
      break;
    case 'text': {
      const f = a.text as ProseField;
      if (!(PROSE_FIELDS as readonly string[]).includes(f)) errors.push(`${where}: text must be one of ${PROSE_FIELDS.join('/')}`);
      else if (!scope.prose.has(f)) errors.push(`${where}: this ${scope.type} scene has no "${f}" to write`);
      else if (a.para !== undefined && !integerIn(a.para, scope.paragraphs)) {
        errors.push(`${where}: para must be an integer in 0…${scope.paragraphs - 1} (the caption has ${scope.paragraphs} paragraph${scope.paragraphs === 1 ? '' : 's'})`);
      }
      break;
    }
  }
}

function validateAction(raw: unknown, scope: BeatScope, where: string, errors: string[]): void {
  if (!isRecord(raw)) { errors.push(`${where}: action must be an object`); return; }
  const a = raw;
  const kind = a.do;
  if (!(BEAT_ACTION_KINDS as readonly unknown[]).includes(kind)) {
    errors.push(`${where}: unknown action "${String(kind)}" (one of ${BEAT_ACTION_KINDS.join('/')})`);
    return;
  }
  if (a.at !== undefined && (!finiteNumber(a.at) || a.at < 0 || a.at > 1)) {
    errors.push(`${where}: at must be a fraction 0…1 of the clip (got ${String(a.at)})`);
  }
  const tokens = (field: string) => {
    const list = tokenList(a[field]);
    if (!list) { errors.push(`${where}: ${field} must be a token id or a non-empty list of ids`); return; }
    for (const id of list) if (!scope.tokenIds.has(id)) errors.push(`${where}: token "${id}" is not a token id in this scene`);
  };
  switch (kind) {
    case 'write':
    case 'reveal':
      validateTarget(a, scope, where, errors);
      break;
    case 'focus':
      validateTarget(a, scope, where, errors);
      if (a.hold !== undefined && (!finiteNumber(a.hold) || a.hold <= 0 || a.hold > 10)) errors.push(`${where}: hold is seconds, 0 < hold ≤ 10`);
      break;
    case 'highlight':
      tokens('token');
      break;
    case 'move':
      if (scope.type !== 'equation-steps') errors.push(`${where}: move only applies to equation-steps scenes`);
      else if (!nonEmptyString(a.from) || !scope.fromIds.has(a.from)) {
        errors.push(`${where}: no later line flies from "${String(a.from)}" — a move needs a token with from: "${String(a.from)}"`);
      }
      break;
    case 'morph':
      if (scope.type !== 'graph-morph') errors.push(`${where}: morph only applies to graph-morph scenes`);
      else if (!integerIn(a.state, scope.states)) errors.push(`${where}: state must be an integer in 0…${scope.states - 1} (got ${String(a.state)})`);
      break;
    case 'mark':
      if (!(MARK_KINDS as readonly unknown[]).includes(a.kind)) errors.push(`${where}: kind must be one of ${MARK_KINDS.join('/')}`);
      tokens('token');
      break;
    case 'note':
      if (!nonEmptyString(a.text)) errors.push(`${where}: note needs text`);
      else if (a.text.trim().length > NOTE_MAX_CHARS) errors.push(`${where}: note is ${a.text.trim().length} chars — an aside, not a paragraph (≤ ${NOTE_MAX_CHARS})`);
      if (a.near !== undefined && (!nonEmptyString(a.near) || !scope.tokenIds.has(a.near))) {
        errors.push(`${where}: near "${String(a.near)}" is not a token id in this scene`);
      }
      break;
    case 'clear':
      if (a.what !== undefined && !(CLEAR_SCOPES as readonly unknown[]).includes(a.what)) {
        errors.push(`${where}: what must be one of ${CLEAR_SCOPES.join('/')}`);
      }
      break;
  }
}

/**
 * The beats of one scene. A beat scene derives its narration from `say`, so
 * hand-written narration / audio / timing beside it is refused — one source
 * of truth for the voice. A check keeps ONE beat (the lead-in): the answer
 * gate owns everything after it.
 */
function validateBeats(scene: Record<string, unknown>, scope: BeatScope | null, at: string, errors: string[]): void {
  const beats = scene.beats;
  if (beats === undefined) return;
  if (!Array.isArray(beats) || beats.length === 0) { errors.push(`${at}: beats must be a non-empty array`); return; }
  for (const k of ['narration', 'audio', 'timing'] as const) {
    if (scene[k] !== undefined) errors.push(`${at}: a beat scene derives its ${k} from beats[].say — remove the hand-written ${k}`);
  }
  if (scene.type === 'check' && beats.length !== 1) errors.push(`${at}: a check carries exactly one beat (the lead-in); got ${beats.length}`);
  beats.forEach((b, k) => {
    const bAt = `${at}.beats[${k}]`;
    if (!isRecord(b)) { errors.push(`${bAt}: beat must be an object`); return; }
    validateNarrationText(b.say, `${bAt}.say`, errors);
    if (b.audio !== undefined && !isLessonAudioUrl(b.audio)) errors.push(`${bAt}.audio: must be a /lessons/<slug>/… path or an https URL (got "${String(b.audio)}")`);
    if (b.timing !== undefined) {
      if (b.audio === undefined) errors.push(`${bAt}: timing needs audio`);
      if (!isLessonTimingUrl(b.timing)) errors.push(`${bAt}.timing: must be a /lessons/<slug>/….timing.json path or an https URL`);
    }
    if (!Array.isArray(b.do)) { errors.push(`${bAt}: do must be an array of actions (empty for a beat that only speaks)`); return; }
    if (scope === null) return; // the scene body failed — references cannot be judged
    let lastAt = -1;
    b.do.forEach((action, j) => {
      const aAt = `${bAt}.do[${j}]`;
      validateAction(action, scope, aAt, errors);
      if (isRecord(action) && finiteNumber(action.at)) {
        if (action.at < lastAt) errors.push(`${aAt}: at ${action.at} runs backwards — actions fire in listed order, so at must not decrease within a beat`);
        lastAt = Math.max(lastAt, action.at);
      }
    });
  });
}

function validateScene(scene: unknown, i: number, errors: string[]): void {
  const at = `scenes[${i}]`;
  if (!isRecord(scene)) { errors.push(`${at}: scene must be an object`); return; }
  const type = scene.type;
  // Sub-step count for the narration rule — mirrors sceneStepCount, computed
  // from the raw shape once the body validates (null = body broken).
  let steps: number | null = 1;
  // What this scene's beats may address; null once the body is broken.
  const scope: BeatScope = {
    type: String(type), steps: 0, callouts: 0, states: 0,
    tokenIds: new Set(), fromIds: new Set(), prose: new Set(), paragraphs: 0,
  };
  if (nonEmptyString(scene.heading)) scope.prose.add('heading');
  switch (type) {
    case 'title': {
      if (!nonEmptyString(scene.title)) errors.push(`${at} (title): needs title`);
      if (!nonEmptyString(scene.promise)) errors.push(`${at} (title): needs promise`);
      scope.prose.add('title').add('promise');
      break;
    }
    case 'caption': {
      if (!nonEmptyString(scene.text)) errors.push(`${at} (caption): needs text`);
      else { scope.prose.add('text'); scope.paragraphs = splitParagraphs(scene.text).length; }
      if (!optionalString(scene.heading)) errors.push(`${at} (caption): heading must be a non-empty string when present`);
      break;
    }
    case 'equation-steps': {
      if (!optionalString(scene.heading)) errors.push(`${at}: bad heading`);
      if (!optionalString(scene.intro)) errors.push(`${at}: bad intro`);
      const stepsArr = scene.steps;
      if (!Array.isArray(stepsArr) || stepsArr.length === 0) {
        errors.push(`${at} (equation-steps): needs at least one step`);
        steps = null;
        break;
      }
      steps = stepsArr.length;
      scope.steps = stepsArr.length;
      if (nonEmptyString(scene.intro)) scope.prose.add('intro');
      const sceneIds = new Set<string>();
      const earlier = new Set<string>();
      stepsArr.forEach((step, si) => {
        const sAt = `${at}.steps[${si}]`;
        if (!isRecord(step)) { errors.push(`${sAt}: step must be an object`); return; }
        if (!Array.isArray(step.tokens) || step.tokens.length === 0) {
          errors.push(`${sAt}: needs at least one token`);
          return;
        }
        // `from` may only reference ids revealed on EARLIER steps — a token
        // cannot fly out of a line that appears at the same moment it does.
        step.tokens.forEach((t, ti) =>
          validateToken(t, `${sAt}.tokens[${ti}]`, errors, sceneIds, earlier));
        for (const t of step.tokens) {
          if (isRecord(t) && nonEmptyString(t.id)) earlier.add(t.id);
          if (isRecord(t) && nonEmptyString(t.from)) scope.fromIds.add(t.from);
        }
        if (step.note !== undefined && !nonEmptyString(step.note)) {
          errors.push(`${sAt}: note must be a non-empty string when present`);
        }
      });
      scope.tokenIds = sceneIds;
      break;
    }
    case 'graph-morph': {
      if (!optionalString(scene.heading)) errors.push(`${at}: bad heading`);
      if (!optionalString(scene.caption)) errors.push(`${at}: bad caption`);
      const states = scene.states;
      if (!Array.isArray(states) || states.length < 2) {
        errors.push(`${at} (graph-morph): needs at least two states to morph between`);
        steps = null;
      } else {
        steps = states.length;
        scope.states = states.length;
        if (nonEmptyString(scene.caption)) scope.prose.add('caption');
        states.forEach((s, si) => {
          const sAt = `${at}.states[${si}]`;
          if (!isRecord(s)) { errors.push(`${sAt}: state must be an object`); return; }
          if (!nonEmptyString(s.label)) errors.push(`${sAt}: needs label`);
          if (!Array.isArray(s.coeffs) || s.coeffs.length === 0 || !s.coeffs.every(finiteNumber)) {
            errors.push(`${sAt}: coeffs must be a non-empty array of finite numbers`);
          }
        });
      }
      const w = scene.window;
      if (!isRecord(w) || !finiteNumber(w.xMin) || !finiteNumber(w.xMax)
        || !finiteNumber(w.yMin) || !finiteNumber(w.yMax)) {
        errors.push(`${at} (graph-morph): window needs finite xMin/xMax/yMin/yMax`);
      } else {
        if (w.xMin >= w.xMax) errors.push(`${at}: window xMin must be < xMax`);
        if (w.yMin >= w.yMax) errors.push(`${at}: window yMin must be < yMax`);
      }
      break;
    }
    case 'annotate': {
      if (!optionalString(scene.heading)) errors.push(`${at}: bad heading`);
      if (!optionalString(scene.intro)) errors.push(`${at}: bad intro`);
      const ids = new Set<string>();
      if (!Array.isArray(scene.tokens) || scene.tokens.length === 0) {
        errors.push(`${at} (annotate): needs tokens`);
      } else {
        scene.tokens.forEach((t, ti) =>
          validateToken(t, `${at}.tokens[${ti}]`, errors, ids, null));
        scope.prose.add('expression');
      }
      scope.tokenIds = ids;
      if (nonEmptyString(scene.intro)) scope.prose.add('intro');
      if (!Array.isArray(scene.callouts) || scene.callouts.length === 0) {
        errors.push(`${at} (annotate): needs at least one callout`);
        steps = null;
      } else {
        steps = scene.callouts.length + 1; // expression first, then callouts
        scope.callouts = scene.callouts.length;
        scene.callouts.forEach((c, ci) => {
          const cAt = `${at}.callouts[${ci}]`;
          if (!isRecord(c)) { errors.push(`${cAt}: callout must be an object`); return; }
          if (!nonEmptyString(c.label)) errors.push(`${cAt}: needs label`);
          if (!nonEmptyString(c.target) || !ids.has(c.target as string)) {
            errors.push(`${cAt}: target must name an existing token id (got "${String(c.target)}")`);
          }
          if (c.tone !== undefined && !isTone(c.tone)) {
            errors.push(`${cAt}: tone must be one of ${LESSON_TONES.join('/')}`);
          }
        });
      }
      break;
    }
    case 'check': {
      if (!nonEmptyString(scene.qid)) errors.push(`${at} (check): needs qid (a bank question id)`);
      if (!nonEmptyString(scene.why)) errors.push(`${at} (check): needs a one-line why for the reveal`);
      if (!optionalString(scene.prompt)) errors.push(`${at} (check): prompt must be a non-empty string when present`);
      if (!optionalString(scene.placeholder)) errors.push(`${at} (check): bad placeholder`);
      if (nonEmptyString(scene.prompt)) scope.prose.add('prompt');
      break;
    }
    default:
      errors.push(`${at}: unknown scene type "${String(type)}"`);
      return;
  }
  validateNarration(scene, steps, at, errors);
  validateBeats(scene, steps === null ? null : scope, at, errors);
}

/**
 * Full structural validation. Collects EVERY problem instead of stopping at the
 * first, so an author (or the phase-2 pipeline) fixes a script in one pass.
 */
export function validateLessonScript(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['script must be an object'] };

  if (!nonEmptyString(input.slug) || !SLUG_RE.test(input.slug)) {
    errors.push('slug must be lowercase kebab-case (a-z, 0-9, hyphens)');
  }
  if (!nonEmptyString(input.title)) errors.push('title is required');
  if (!nonEmptyString(input.level)) errors.push('level is required');
  if (!nonEmptyString(input.topic)) errors.push('topic is required');
  if (!finiteNumber(input.minutes) || input.minutes <= 0 || input.minutes > 60) {
    errors.push('minutes must be a number between 1 and 60');
  }
  if (input.theme !== undefined && !(LESSON_THEMES as readonly unknown[]).includes(input.theme)) {
    errors.push(`theme must be one of ${LESSON_THEMES.join('/')} (got "${String(input.theme)}")`);
  }
  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    errors.push('scenes must be a non-empty array');
  } else {
    input.scenes.forEach((s, i) => validateScene(s, i, errors));
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, script: input as unknown as LessonScript };
}

/** The bank question ids a script's check scenes reference, in order. */
export function checkQids(script: LessonScript): string[] {
  return script.scenes.flatMap(s => (s.type === 'check' ? [s.qid] : []));
}

/**
 * How many taps a scene takes to fully reveal — the player's sub-step count.
 * (Checks are interactive: the player owns their pacing, so 1 here.)
 */
export function sceneStepCount(scene: PlayScene): number {
  if (hasBeats(scene)) return scene.beats.length; // a beat IS the sub-step
  switch (scene.type) {
    case 'equation-steps': return scene.steps.length;
    case 'graph-morph': return scene.states.length;
    case 'annotate': return scene.callouts.length + 1; // expression first, then callouts
    default: return 1;
  }
}

// ── Narration helpers (pure — the player and its tests share them) ───────────

/** How a scene's narration sits against its sub-steps. */
export type NarrationLayout = 'none' | 'scene' | 'steps';

export interface NarrationCue {
  /** The spoken text (also the on-screen transcript). */
  text: string;
  /** Its clip, or null when the text exists but no audio was generated yet. */
  audio: string | null;
  /** Its timing sidecar, or null (the player then times words proportionally). */
  timing: string | null;
}

export function narrationLayout(scene: PlayScene): NarrationLayout {
  if (scene.type === 'check-skipped') return 'none';
  if (hasBeats(scene)) return 'steps';
  if (scene.narration === undefined) return 'none';
  return Array.isArray(scene.narration) ? 'steps' : 'scene';
}

/**
 * The cue that STARTS at (scene, step), or null. Per-step arrays cue every
 * step; a whole-scene string cues step 0 only — later steps ride inside that
 * one clip (the player spreads them evenly across its duration).
 */
export function narrationAt(scene: PlayScene, step: number): NarrationCue | null {
  if (scene.type === 'check-skipped') return null;
  if (hasBeats(scene)) {
    const b = scene.beats[step];
    if (!b) return null;
    return { text: b.say, audio: b.audio ?? null, timing: b.audio ? (b.timing ?? null) : null };
  }
  if (scene.narration === undefined) return null;
  const { narration, audio, timing } = scene;
  if (Array.isArray(narration)) {
    const text = narration[step];
    if (text === undefined) return null;
    const clip = Array.isArray(audio) ? audio[step] : undefined;
    const side = Array.isArray(timing) ? timing[step] : undefined;
    return { text, audio: clip ?? null, timing: clip ? (side ?? null) : null };
  }
  if (step !== 0) return null;
  const clip = typeof audio === 'string' ? audio : null;
  return { text: narration, audio: clip, timing: clip && typeof timing === 'string' ? timing : null };
}

/**
 * The next cue with a clip after (sceneIdx, step) — what to prefetch (clip +
 * sidecar). Walks forward over silent positions; null at the end of the lesson.
 */
export function nextNarrationCue(scenes: PlayScene[], sceneIdx: number, step: number): NarrationCue | null {
  let i = sceneIdx;
  let s = step;
  for (let guard = 0; guard < 1000; guard++) {
    if (i >= scenes.length) return null;
    if (s < sceneStepCount(scenes[i]) - 1) s++;
    else { i++; s = 0; if (i >= scenes.length) return null; }
    const cue = narrationAt(scenes[i], s);
    if (cue?.audio) return cue;
  }
  return null;
}

/**
 * The next clip the player will need after (sceneIdx, step) — the one to
 * preload. Walks forward over silent positions; null at the end of the lesson.
 */
export function nextNarrationAudio(scenes: PlayScene[], sceneIdx: number, step: number): string | null {
  return nextNarrationCue(scenes, sceneIdx, step)?.audio ?? null;
}

/** Does any scene carry a clip? A silent lesson never offers the Voice mode. */
export function lessonHasAudio(scenes: PlayScene[]): boolean {
  return scenes.some(scene => {
    if (scene.type === 'check-skipped') return false;
    if (hasBeats(scene)) return scene.beats.some(b => b.audio !== undefined);
    if (scene.audio === undefined) return false;
    return Array.isArray(scene.audio) ? scene.audio.length > 0 : true;
  });
}

// ── Beat helpers (pure) ──────────────────────────────────────────────────────

/** A scene narrated as beats (the validator guarantees a non-empty array). */
export function hasBeats(scene: PlayScene | Scene): scene is (PlayScene | Scene) & { beats: Beat[] } {
  return scene.type !== 'check-skipped' && Array.isArray(scene.beats) && scene.beats.length > 0;
}

/**
 * The spoken entries of a scene, whatever its shape: a beat scene's `say`
 * lines, else `narration` as written (a whole-scene string stays a string).
 * What the voice generator, the verifier and the tests read.
 */
export function sceneNarration(scene: Scene | PlayScene): string | string[] | undefined {
  if (scene.type === 'check-skipped') return undefined;
  if (hasBeats(scene)) return scene.beats.map(b => b.say);
  return scene.narration;
}

/** The clip(s) of a scene, same shape as sceneNarration (null per beat without one). */
export function sceneAudio(scene: Scene | PlayScene): string | (string | null)[] | undefined {
  if (scene.type === 'check-skipped') return undefined;
  if (hasBeats(scene)) return scene.beats.map(b => b.audio ?? null);
  return scene.audio;
}

/** The served path of beat K (1-based) of scene NN (1-based): /lessons/<slug>/scene-NN-bK.mp3. */
export function beatClipPath(slug: string, sceneNo: number, beatNo: number): string {
  return `/lessons/${slug}/scene-${String(sceneNo).padStart(2, '0')}-b${beatNo}.mp3`;
}

/**
 * Why a clip's play() promise rejected — three different responses in the
 * player. 'refused' is the autoplay policy (no gesture has reached the
 * element yet) → re-lock, show the play affordance. 'superseded' is an
 * AbortError: OUR OWN next load or pause interrupted a play that had not
 * started yet — the silent unlock replaced by the next position's clip inside
 * the same tap, a replay, a backgrounded tab — nothing failed, nothing to
 * record. Anything else means the clip itself won't play → skip it, the timer
 * beat takes that position. (Reverting the unlock on an AbortError re-locked
 * the player on every tap-to-advance from the poster: 2026-09-02 browser run.)
 */
export type PlayRejection = 'refused' | 'superseded' | 'failed';
export function classifyPlayRejection(err: unknown): PlayRejection {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  if (name === 'NotAllowedError') return 'refused';
  if (name === 'AbortError') return 'superseded';
  return 'failed';
}
