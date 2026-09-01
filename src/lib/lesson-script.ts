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
//
// Pure module (repo testing policy): no I/O, no React — importable from the
// client player, the server page, API routes and vitest alike.

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

export type TitleScene = { type: 'title'; title: string; promise: string };
export type CaptionScene = { type: 'caption'; heading?: string; text: string };
export type EquationStepsScene = {
  type: 'equation-steps'; heading?: string; intro?: string; steps: EquationStep[];
};
export type GraphMorphScene = {
  type: 'graph-morph'; heading?: string; caption?: string;
  states: GraphState[]; window: GraphWindow; xLabel?: string; yLabel?: string;
};
export type AnnotateScene = {
  type: 'annotate'; heading?: string; intro?: string;
  tokens: StepToken[]; callouts: Callout[];
};
export type CheckScene = {
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
  scenes: Scene[];
}

// ── What the player actually receives ────────────────────────────────────────
// The server page swaps every `check` scene for a RESOLVED one (question
// markdown + the official answer for instant local grading + the reveal) or a
// skipped marker when the bank question no longer passes the eligibility gate.
// The answer travelling to the client is the same exposure class as
// /api/portal/practice/solution (any signed-in session may fetch the full
// worked solution for an eligible question), so nothing new leaks.

export interface ResolvedCheckScene {
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

function validateScene(scene: unknown, i: number, errors: string[]): void {
  const at = `scenes[${i}]`;
  if (!isRecord(scene)) { errors.push(`${at}: scene must be an object`); return; }
  const type = scene.type;
  switch (type) {
    case 'title': {
      if (!nonEmptyString(scene.title)) errors.push(`${at} (title): needs title`);
      if (!nonEmptyString(scene.promise)) errors.push(`${at} (title): needs promise`);
      return;
    }
    case 'caption': {
      if (!nonEmptyString(scene.text)) errors.push(`${at} (caption): needs text`);
      if (!optionalString(scene.heading)) errors.push(`${at} (caption): heading must be a non-empty string when present`);
      return;
    }
    case 'equation-steps': {
      if (!optionalString(scene.heading)) errors.push(`${at}: bad heading`);
      if (!optionalString(scene.intro)) errors.push(`${at}: bad intro`);
      const steps = scene.steps;
      if (!Array.isArray(steps) || steps.length === 0) {
        errors.push(`${at} (equation-steps): needs at least one step`);
        return;
      }
      const sceneIds = new Set<string>();
      const earlier = new Set<string>();
      steps.forEach((step, si) => {
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
        }
        if (step.note !== undefined && !nonEmptyString(step.note)) {
          errors.push(`${sAt}: note must be a non-empty string when present`);
        }
      });
      return;
    }
    case 'graph-morph': {
      if (!optionalString(scene.heading)) errors.push(`${at}: bad heading`);
      if (!optionalString(scene.caption)) errors.push(`${at}: bad caption`);
      const states = scene.states;
      if (!Array.isArray(states) || states.length < 2) {
        errors.push(`${at} (graph-morph): needs at least two states to morph between`);
      } else {
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
      return;
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
      }
      if (!Array.isArray(scene.callouts) || scene.callouts.length === 0) {
        errors.push(`${at} (annotate): needs at least one callout`);
      } else {
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
      return;
    }
    case 'check': {
      if (!nonEmptyString(scene.qid)) errors.push(`${at} (check): needs qid (a bank question id)`);
      if (!nonEmptyString(scene.why)) errors.push(`${at} (check): needs a one-line why for the reveal`);
      if (!optionalString(scene.prompt)) errors.push(`${at} (check): prompt must be a non-empty string when present`);
      if (!optionalString(scene.placeholder)) errors.push(`${at} (check): bad placeholder`);
      return;
    }
    default:
      errors.push(`${at}: unknown scene type "${String(type)}"`);
  }
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
  switch (scene.type) {
    case 'equation-steps': return scene.steps.length;
    case 'graph-morph': return scene.states.length;
    case 'annotate': return scene.callouts.length + 1; // expression first, then callouts
    default: return 1;
  }
}
