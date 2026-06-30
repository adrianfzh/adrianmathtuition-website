// Snippet-anchoring for the Solo essay feedback: split the student's text into
// segments, wrapping the first non-overlapping occurrence of each annotation's
// quote so the UI can highlight it. Pure + testable.

export type Severity = 'minor' | 'major';
export type Ann = { quote: string; comment: string; tag: string; severity: Severity };
export type Segment = { text: string; i?: number; sev?: Severity };

export function segment(text: string, anns: Ann[]): Segment[] {
  const ranges: { start: number; end: number; i: number }[] = [];
  anns.forEach((a, i) => {
    if (!a.quote) return;
    const idx = text.indexOf(a.quote);
    if (idx >= 0) ranges.push({ start: idx, end: idx + a.quote.length, i });
  });
  ranges.sort((a, b) => a.start - b.start);
  const clean: typeof ranges = [];
  let lastEnd = -1;
  for (const r of ranges) if (r.start >= lastEnd) { clean.push(r); lastEnd = r.end; }
  const parts: Segment[] = [];
  let cur = 0;
  for (const r of clean) {
    if (r.start > cur) parts.push({ text: text.slice(cur, r.start) });
    parts.push({ text: text.slice(r.start, r.end), i: r.i, sev: anns[r.i].severity });
    cur = r.end;
  }
  if (cur < text.length) parts.push({ text: text.slice(cur) });
  return parts;
}
