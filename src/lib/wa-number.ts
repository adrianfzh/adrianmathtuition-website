// ─── WhatsApp assistant number — display formatting ──────────────────────────
//
// The Twilio assistant line (KIOSK_WA_NUMBER), formatted for humans.
//
// This is a tested pure function because the inline version shipped broken. On
// 10 Aug 2026 the formatter was written as
//
//     digits.replace(/(\d{4})(\d{4})/, '1ドル 2ドル')
//
// — a currency-localised mangling of the backreferences '$1 $2' ("1 dollar
// 2 dollar" in Japanese). With the backreferences gone the regex still matched
// all eight digits and replaced them with that literal, so the number did not
// get reformatted, it got DELETED: parents were told to "WhatsApp our assistant
// at 1ドル 2ドル". It reached one inbox (Jeanette Tan, 15 Aug 2026) before the
// paragraph was pulled for unrelated reasons.
//
// A replacement string that has lost its backreferences is silent — it type-
// checks, it never throws, and in a diff it looks like ordinary text. Only an
// assertion on the rendered output catches it, which is what the sibling test
// does. Keep formatting here rather than inline in an email template.

export const WA_NUMBER_FALLBACK = '6580164142';

/** Bare digits, country code included — what wa.me links need. */
export function waDigits(raw?: string): string {
  return (raw ?? process.env.KIOSK_WA_NUMBER ?? WA_NUMBER_FALLBACK).replace(/\D/g, '');
}

/** Local SG form for display, e.g. "8016 4142". */
export function waDisplay(raw?: string): string {
  return waDigits(raw).replace(/^65/, '').replace(/(\d{4})(\d{4})/, '$1 $2');
}
