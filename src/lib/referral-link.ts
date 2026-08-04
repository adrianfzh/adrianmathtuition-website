// Referral links — the exact-match layer over the referral reward automation.
//
// The reward flow (generate-invoices) historically matched the referrer by
// FUZZY NAME from the signup form's free-text "Referred by" field — which once
// matched "Abel Tan" to "Kiara Tan" before the confidence gate was added.
// Referral links remove the guessing: /r/<studentRecId> stores the referrer's
// RECORD ID at signup time.
//
// No new Airtable field: the id rides INSIDE the existing `Referred By Name`
// text field as a trailing marker — `Kiara Tan [recXXXXXXXXXXXXXX]` — the same
// marker-in-a-field pattern as PWAA in Exam Notes. Airtable stays readable,
// and rows written before links existed parse as plain names (recId: null),
// falling back to the fuzzy matcher unchanged.

export const REC_ID_RE = /^rec[A-Za-z0-9]{14}$/;

const MARKER_RE = /\s*\[(rec[A-Za-z0-9]{14})\]\s*$/;

/** "Kiara Tan [recABC…]" → { name: "Kiara Tan", recId: "recABC…" }; plain names → recId null. */
export function parseReferrerMarker(value: string | null | undefined): { name: string; recId: string | null } {
  const raw = String(value || '').trim();
  const m = raw.match(MARKER_RE);
  if (!m) return { name: raw, recId: null };
  return { name: raw.replace(MARKER_RE, '').trim(), recId: m[1] };
}

/** Attach (or replace) the marker. Invalid rec ids attach nothing. */
export function appendReferrerMarker(name: string, recId: string): string {
  const base = parseReferrerMarker(name).name; // idempotent: never double-marker
  if (!REC_ID_RE.test(recId)) return base;
  return base ? `${base} [${recId}]` : `[${recId}]`;
}

/** The shareable path for a family's referral link. */
export function referralPathFor(studentRecId: string): string {
  return `/r/${studentRecId}`;
}
