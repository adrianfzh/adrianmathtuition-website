// GFM pipe tables inside question text.
//
// Bank stems carry data tables as markdown pipe rows:
//
//   | t | 1 | 2 | 3 |
//   | --- | --- | --- |
//   | m | 15.6 | 12.1 | 9.5 |
//
// Both the printed paper and the on-screen question have to turn those into a
// real table — and they have to AGREE, or a paper reads one way on the page and
// another in the browser. So the splitting lives here once and each renderer
// supplies its own cell renderer: the PDF escapes and leaves $...$ for its
// KaTeX pass, the web runs cells through mathHtml.
//
// (Found on GCE 2022 AM P1 Q2, whose linear-law table printed as literal pipes
// in the browser long after the PDF had learnt to draw it.)

export type TextBlock = { kind: 'text'; text: string };
export type TableBlock = { kind: 'table'; rows: string[][] };
export type Block = TextBlock | TableBlock;

/** A row of only dashes is GFM's header rule, not data.
 *  Accepts every alignment spelling (`---`, `:--`, `--:`, `:-:`) but NOT a bare
 *  single `-`: that is how a data table writes "no value", and swallowing such
 *  a row would silently delete real data. */
export function isDividerRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => {
    const t = c.trim();
    return /^:?-+:?$/.test(t) && (t.includes(':') || t.replace(/:/g, '').length >= 2);
  });
}

/** A line that is a pipe row at all. Requires a second pipe so a lone "|" in
 *  prose (or an absolute value) cannot start a table. */
export function isPipeRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.includes('|', 1);
}

export function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** Question text -> alternating prose and table blocks, in order. PURE. */
export function splitPipeTables(s: string): Block[] {
  const out: Block[] = [];
  let buf: string[] = [];
  let table: string[][] | null = null;
  const flushText = () => { if (buf.length) { out.push({ kind: 'text', text: buf.join('\n') }); buf = []; } };
  const flushTable = () => { if (table && table.length) out.push({ kind: 'table', rows: table }); table = null; };

  for (const raw of String(s ?? '').split('\n')) {
    if (isPipeRow(raw)) {
      flushText();
      const cells = splitCells(raw);
      if (!isDividerRow(cells)) (table ??= []).push(cells);
      continue;
    }
    flushTable();
    buf.push(raw);
  }
  flushText();
  flushTable();
  return out;
}
