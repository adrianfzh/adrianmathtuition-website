// lib/invoice-description.ts — the last gate before a line-item description is
// printed on a parent's invoice or receipt.
//
// 17 Sep 2026 (Adrian, looking at Tan Sijia's August 2026 invoice: "Should not
// mention fuzzy match"). The referral-reward generator used to interpolate the
// name-matching confidence straight into the parent-facing description, so
// "Referral reward ⚠ fuzzy match — referred Chloe Gng" was rendered verbatim on
// her PDF. The generator was corrected on 15 Sep (the flag lives in the item's
// own `matchConfidence` field, which is what /admin/invoices reads for its
// badge) — but only Denise Chan's October row was cleaned, and nothing stopped
// a stored row, an old row, or a future edit from carrying the flag again.
//
// So the rule is enforced where it matters: at RENDER. Whatever is stored, a
// parent never sees an internal matching flag. Pure, so it is tested.

/** Internal name-matching flags, with any badge emoji that rides along. */
const INTERNAL_FLAG = /[\s ]*[⚠✅❌️]*[\s ]*\b(?:fuzzy|exact|no)[\s ]+match\b[\s ]*/giu;

/** A badge emoji left stranded at either end once the words are gone. */
const STRAY_BADGE = /^[\s ]*[⚠✅❌️]+[\s ]*|[\s ]*[⚠✅❌️]+[\s ]*$/gu;

/** A dash left leading or trailing once a flag was cut out of the middle. */
const DANGLING_DASH = /^[\s ]*[—–-]+[\s ]*|[\s ]*[—–-]+[\s ]*$/gu;

/** Brackets emptied by the cut — "… Chloe Gng (fuzzy match)" must not leave "()". */
const EMPTY_BRACKETS = /[\s ]*[([{][\s ]*[)\]}]/gu;

/**
 * The description as a parent should read it. Pure.
 *
 * Strips the internal matching flag wherever it sits, closes the gap it leaves
 * (one space, no orphaned dash or badge at either end), and returns `fallback`
 * when nothing legible is left. Text with no flag comes back untouched.
 */
export function parentFacingDescription(description: unknown, fallback = 'Additional Item'): string {
  const raw = typeof description === 'string' ? description : '';
  if (!raw.trim()) return fallback;
  if (!INTERNAL_FLAG.test(raw)) {
    INTERNAL_FLAG.lastIndex = 0;          // the /g flag makes .test stateful
    return raw.trim();
  }
  INTERNAL_FLAG.lastIndex = 0;
  const cleaned = raw
    .replace(INTERNAL_FLAG, ' ')
    .replace(EMPTY_BRACKETS, '')
    .replace(STRAY_BADGE, '')
    .replace(DANGLING_DASH, '')
    .replace(/[\s ]{2,}/g, ' ')
    .trim();
  return cleaned || fallback;
}

/** Does this description carry an internal flag a parent must not see? Pure. */
export function leaksInternalFlag(description: unknown): boolean {
  const raw = typeof description === 'string' ? description : '';
  INTERNAL_FLAG.lastIndex = 0;
  const hit = INTERNAL_FLAG.test(raw);
  INTERNAL_FLAG.lastIndex = 0;
  return hit;
}
