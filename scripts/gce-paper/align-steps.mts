// scripts/gce-paper/align-steps.mts — the Word export's door into the ONE
// alignment rule (src/lib/solution-readability.ts): export-docx.py pipes a
// solution's lines in as JSON and gets each line's STEPS (one step a line),
// each with its lead-in and, when it is equations alone, its rows lined up on "=".
// One process per solution, so the Word export and the PDF/app never drift.
//   echo '["$x = 1$ so $y = 2$"]' | npx tsx scripts/gce-paper/align-steps.mts
import { leadIn, stepLines, stepRows, type AlignRow } from '../../src/lib/solution-readability';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  // Each stored line → its steps (one step a line, like solutionLines), each
  // step → { text, sub?, rows? }: rows only when the step is equations alone.
  const lines: string[] = JSON.parse(input || '[]');
  const out = lines.map((line) => stepLines(line).map((text) => {
    // A lead-in ("End values: …") is cut off only when what follows lines up;
    // otherwise the step stays whole ("Answer: $x = 3$" keeps its one line).
    const li = leadIn(text);
    let rows: AlignRow[] | null = null;
    try { rows = stepRows(li ? li[1] : text); } catch { rows = null; }
    if (!rows) return { text };
    return li ? { text: li[1], sub: li[0], rows } : { text, rows };
  }));
  process.stdout.write(JSON.stringify(out));
});
