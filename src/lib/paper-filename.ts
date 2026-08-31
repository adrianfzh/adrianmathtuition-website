// Filenames for downloaded papers.
//
// A paper's on-screen label is "CJC 2025 \u00b7 JC2 \u00b7 P1 \u00b7 Prelim" - middle dots
// and all. That is unusable as a filename on Windows and ugly everywhere, so it
// is flattened here. Kept as a pure module because the failure it guards
// against is silent: two entries with the same name in a zip OVERWRITE each
// other, and you would only notice by counting the files after unzipping.

/** One label -> one safe filename (no extension). */
export function paperFileBase(label: string): string {
  return String(label ?? '')
    .replace(/[\u00b7\u2022]/g, ' ')      // the separator the UI uses
    .replace(/[\\/:*?"<>|]/g, '-')        // reserved on Windows
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'paper';
}

/**
 * Names for a whole batch, in order, guaranteed distinct. A repeat gets " (2)",
 * " (3)" and so on - never a silent overwrite inside the archive.
 */
export function paperFileNames(labels: string[], ext = '.pdf'): string[] {
  const seen = new Map<string, number>();
  return labels.map((l) => {
    const base = paperFileBase(l);
    const key = base.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? `${base}${ext}` : `${base} (${n})${ext}`;
  });
}
