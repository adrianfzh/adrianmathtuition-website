// src/lib/region-crop.ts — turn a marker's prose region into a crop window.
//
// Every marked question records where on the page it sat, but as words rather
// than coordinates: "upper half of page, questions 7(a) and 7(b)", "lower half
// of page". Triage was showing the whole page behind a "Show page N" expander,
// so checking a mark meant opening the page and hunting for the question —
// which is why two wrong marks on Kayla's paper were found by reading the PDF
// instead (Adrian, 31 Aug 2026: "I can't see exactly what is happening").
//
// A band is enough. Reading "upper half" and showing the top of the page puts
// the working in front of him without a click, and being generous costs
// nothing: showing 10% too much page is harmless, cutting the answer line off
// is not. So every band is padded, and anything unrecognised shows the whole
// page rather than guessing.
export type CropBand = { top: number; height: number };

const FULL: CropBand = { top: 0, height: 1 };
const PAD = 0.08;   // generous on both edges — a clipped answer line is the failure

/** A band of the page (0–1 from the top), or the whole page when unsure. */
export function bandForRegion(region: string | null | undefined): CropBand {
  const r = (region || '').toLowerCase();
  if (!r) return FULL;

  // Thirds are named often enough to be worth honouring before halves, since
  // "top third" also contains the word "top".
  if (/\b(top|upper|first)\s+third\b/.test(r)) return pad({ top: 0, height: 1 / 3 });
  if (/\b(middle|centre|center|second)\s+third\b/.test(r)) return pad({ top: 1 / 3, height: 1 / 3 });
  if (/\b(bottom|lower|last|final)\s+third\b/.test(r)) return pad({ top: 2 / 3, height: 1 / 3 });

  if (/\b(top|upper|first)\s+(half|part|portion)\b/.test(r)) return pad({ top: 0, height: 0.5 });
  if (/\b(bottom|lower|last|final)\s+(half|part|portion)\b/.test(r)) return pad({ top: 0.5, height: 0.5 });
  if (/\b(middle|centre|center)\b/.test(r)) return pad({ top: 0.25, height: 0.5 });

  // Bare "top of page" / "bottom of page" with no fraction named.
  if (/\b(top|upper)\b/.test(r)) return pad({ top: 0, height: 0.45 });
  if (/\b(bottom|lower)\b/.test(r)) return pad({ top: 0.55, height: 0.45 });

  return FULL;
}

function pad(b: CropBand): CropBand {
  const top = Math.max(0, b.top - PAD);
  const bottom = Math.min(1, b.top + b.height + PAD);
  return { top, height: bottom - top };
}

/** True when the band is worth cropping to at all. */
export function isPartialBand(b: CropBand): boolean {
  return b.height < 0.95;
}
