// Mark anatomy — the explanatory M/A/B mark-code breakdown the practice grader
// attaches to each partBreakdown entry (O-Level convention: M = method mark,
// A = accuracy mark, B = independent mark).
//
// STRICTLY DISPLAY-ONLY. The anatomy never influences the awarded score; it
// merely explains a score the grader has already decided. This module is the
// single validation gate: anything malformed OR inconsistent with the part's
// awarded/outOf is dropped wholesale (return undefined → the UI hides it),
// so the panel can never show anatomy that contradicts the marks.
//
// Dependency-free on purpose (imported by scripts/golden-anatomy-check.mjs).

export interface MarkAnatomyItem {
  code: string;    // 'M1' | 'A1' | 'B2' … (normalised uppercase)
  for: string;     // short student-readable phrase: what this mark is for
  earned: boolean; // whether THIS mark was gained
}

const CODE_RE = /^[MAB][0-9]{0,2}$/;
const MAX_ITEMS = 20;
const MAX_FOR_LEN = 200;

/**
 * Validate one part's raw markAnatomy from the model.
 *
 * All-or-nothing: a single malformed item invalidates the whole array —
 * partial anatomy would misrepresent how the marks were split. When the
 * part's awarded/outOf are supplied (both non-negative integers, outOf > 0),
 * the anatomy must also reconcile exactly: one entry per mark of outOf, and
 * earned entries summing to awarded. Never throws.
 */
export function parseMarkAnatomy(
  value: unknown,
  awarded?: unknown,
  outOf?: unknown,
): MarkAnatomyItem[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) return undefined;

  const items: MarkAnatomyItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;
    if (typeof r.code !== 'string' || typeof r.for !== 'string' || typeof r.earned !== 'boolean') return undefined;
    const code = r.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) return undefined;
    const forText = r.for.trim().slice(0, MAX_FOR_LEN);
    if (!forText) return undefined;
    items.push({ code, for: forText, earned: r.earned });
  }

  // Consistency gate against the marks actually awarded (when known).
  if (typeof awarded === 'number' && typeof outOf === 'number') {
    if (!Number.isInteger(awarded) || !Number.isInteger(outOf) || outOf <= 0 || awarded < 0) return undefined;
    if (items.length !== outOf) return undefined;
    const earnedCount = items.filter(i => i.earned).length;
    if (earnedCount !== awarded) return undefined;
  }

  return items;
}
