// Student preferences on `portal_accounts.prefs` (jsonb) — the whitelist the
// Settings route accepts and the merge it applies. One place, so a new toggle
// is one line here plus its card, and a client can never write an arbitrary
// key into the blob.
//
// Every pref is a boolean for now; add a type here if that changes.
import { ASK_SIGNAL_PREF } from './ask-signal';

/** Settings → "Show my exam countdown at the top of Home" (SPEC-NOTEBOOK-V2 §3). */
export const EXAM_COUNTDOWN_PREF = 'exam_countdown';
/** The one-time Home notice about that switch has been shown (either button dismisses it). */
export const EXAM_COUNTDOWN_NOTICE_PREF = 'exam_countdown_notice_seen';

/** Settings → "Save answers to my notebook" → the 💾 button under Ask answers (SPEC-NOTEBOOK-V2 §1). */
export const SAVE_ANSWERS_PREF = 'save_answers';
/** Settings → "One thing a day from my notebook" → the Home resurface card (lib/resurface.ts). */
export const RESURFACE_PREF = 'resurface';

export const PORTAL_PREF_KEYS: readonly string[] = [
  /** Settings → "Show skills I keep asking about" → the Notebook's Keeps-coming-up band (lib/ask-signal.ts). */
  ASK_SIGNAL_PREF,
  EXAM_COUNTDOWN_PREF,
  EXAM_COUNTDOWN_NOTICE_PREF,
  SAVE_ANSWERS_PREF,
  RESURFACE_PREF,
];

/** True only for an explicit `true`. */
export function resurfaceOn(prefs: unknown): boolean {
  return prefsObject(prefs)?.[RESURFACE_PREF] === true;
}

/** True only for an explicit `true`. */
export function saveAnswersOn(prefs: unknown): boolean {
  return prefsObject(prefs)?.[SAVE_ANSWERS_PREF] === true;
}

function prefsObject(prefs: unknown): Record<string, unknown> | null {
  return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : null;
}

/** True only for an explicit `true`. */
export function examCountdownOn(prefs: unknown): boolean {
  return prefsObject(prefs)?.[EXAM_COUNTDOWN_PREF] === true;
}

/**
 * The one-time notice is due while the student has never touched the switch
 * (the key is absent — an explicit false is a decision) and has not dismissed
 * the notice. Adrian, 11 Sep 2026: "give them a one-time notification (the
 * next time they login) to tell them they can do it in settings".
 */
export function examCountdownNoticeDue(prefs: unknown): boolean {
  const p = prefsObject(prefs) ?? {};
  return !(EXAM_COUNTDOWN_PREF in p) && p[EXAM_COUNTDOWN_NOTICE_PREF] !== true;
}

export type PrefsPatch = Record<string, boolean>;

/**
 * Validate a client-supplied `prefs` object. Unknown keys and non-boolean
 * values are refused outright (a 400, not a silent drop — a typo in a client
 * should fail loudly in development, not save nothing).
 */
export function readPrefsPatch(input: unknown): { patch: PrefsPatch } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'prefs must be an object' };
  }
  const patch: PrefsPatch = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!PORTAL_PREF_KEYS.includes(key)) return { error: `unknown pref: ${key}` };
    if (typeof value !== 'boolean') return { error: `${key} must be true or false` };
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return { error: 'prefs is empty' };
  return { patch };
}

/** The stored blob with the patch laid over it; a malformed stored value counts as empty. */
export function mergePrefs(current: unknown, patch: PrefsPatch): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}
