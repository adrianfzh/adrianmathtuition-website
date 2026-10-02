// Student preferences on `portal_accounts.prefs` (jsonb) — the whitelist the
// Settings route accepts and the merge it applies.
//
// 21 Sep 2026 (Adrian: "make things simple"): the four opt-in switches
// (exam countdown at the top of Home, one thing a day, save answers, skills I
// keep asking about) and their features were removed — one student had ever
// turned one on, and that student was Adrian. Stored blobs keep their old
// keys harmlessly.
//
// 24 Sep 2026 — the sciences a student takes (Adrian: "ask them to choose the
// science subjects they are taking — add a combined science option as well"):
// `sciences` = one to three of physics / chemistry / biology, and
// `combined_science` = the Combined Science track (O-Level 5086–5088: TWO
// sciences in one subject, a lighter syllabus than the pure papers). Combined
// is a track over the two sciences chosen, never a fourth subject — the
// papers still come one science at a time, so the tabs stay per science and
// the marker is told the track (`result_json.science_track`).

export const SCIENCE_SUBJECTS = ['physics', 'chemistry', 'biology'] as const;
export type ScienceSubject = (typeof SCIENCE_SUBJECTS)[number];
export const SCIENCE_SUBJECT_LABEL: Record<ScienceSubject, string> = { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology' };

/** Boolean preferences the Settings route accepts. */
export const PORTAL_PREF_KEYS: readonly string[] = ['combined_science'];
/** List preferences: the key and the values it may hold. */
export const PORTAL_PREF_LISTS: Readonly<Record<string, readonly string[]>> = { sciences: SCIENCE_SUBJECTS };

export type PrefsPatch = Record<string, boolean | string[]>;

function isScienceSubject(v: unknown): v is ScienceSubject {
  return typeof v === 'string' && (SCIENCE_SUBJECTS as readonly string[]).includes(v);
}

/** Dedupe and put a list of sciences in the fixed order physics · chemistry · biology. */
export function orderSciences(list: readonly unknown[]): ScienceSubject[] {
  return SCIENCE_SUBJECTS.filter(s => list.includes(s));
}

/**
 * Validate a client-supplied `prefs` object. Unknown keys and wrongly typed
 * values are refused outright (a 400, not a silent drop — a typo in a client
 * should fail loudly in development, not save nothing).
 */
export function readPrefsPatch(input: unknown): { patch: PrefsPatch } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'prefs must be an object' };
  }
  const patch: PrefsPatch = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key in PORTAL_PREF_LISTS) {
      if (!Array.isArray(value)) return { error: `${key} must be a list` };
      const allowed = PORTAL_PREF_LISTS[key];
      const bad = value.find(v => typeof v !== 'string' || !allowed.includes(v));
      if (bad !== undefined) return { error: `${key}: unknown value ${String(bad)}` };
      const list = allowed.filter(v => value.includes(v));
      if (list.length === 0) return { error: `${key} must name at least one` };
      patch[key] = list;
      continue;
    }
    if (!PORTAL_PREF_KEYS.includes(key)) return { error: `unknown pref: ${key}` };
    if (typeof value !== 'boolean') return { error: `${key} must be true or false` };
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return { error: 'prefs is empty' };
  // Combined Science is two sciences, by definition.
  if (patch.combined_science === true && Array.isArray(patch.sciences) && patch.sciences.length !== 2) {
    return { error: 'Combined Science is two sciences — pick the two in your paper' };
  }
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

export type ScienceChoice = { subjects: ScienceSubject[]; combined: boolean };

/**
 * The sciences a student said they take, from the stored prefs — null until
 * they have chosen (the Science tab then opens on the picker). A stored
 * `combined_science` only counts when exactly two sciences are named.
 */
export function studentSciences(prefs: unknown): ScienceChoice | null {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return null;
  const p = prefs as Record<string, unknown>;
  if (!Array.isArray(p.sciences)) return null;
  const subjects = orderSciences(p.sciences.filter(isScienceSubject));
  if (subjects.length === 0) return null;
  return { subjects, combined: p.combined_science === true && subjects.length === 2 };
}

/** "Physics · Chemistry — Combined Science" / "Physics · Chemistry · Biology". */
export function scienceChoiceLabel(choice: ScienceChoice): string {
  const names = choice.subjects.map(s => SCIENCE_SUBJECT_LABEL[s]).join(' · ');
  return choice.combined ? `${names} — Combined Science` : names;
}
