import { describe, it, expect } from 'vitest';
import { splitPipeTables, isPipeRow, isDividerRow, splitCells } from './pipe-tables';

describe('splitPipeTables', () => {
  it('pulls a data table out from between prose', () => {
    // GCE 2022 AM P1 Q2, the linear-law table.
    const blocks = splitPipeTables(
      'Measurements are shown below.\n| t | 1 | 2 | 3 |\n| --- | --- | --- |\n| m | 15.6 | 12.1 | 9.5 |\nPlot ln m against t.',
    );
    expect(blocks.map(b => b.kind)).toEqual(['text', 'table', 'text']);
    expect((blocks[1] as { rows: string[][] }).rows).toEqual([
      ['t', '1', '2', '3'],
      ['m', '15.6', '12.1', '9.5'],
    ]);
  });

  it('drops the divider row but keeps every data row', () => {
    const b = splitPipeTables('| a | b |\n| :-- | ---: |\n| 1 | 2 |\n| 3 | 4 |');
    expect((b[0] as { rows: string[][] }).rows).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('leaves cell contents alone for the caller to render', () => {
    // Cells keep their TeX; escaping and KaTeX belong to whoever is drawing.
    const b = splitPipeTables('| $t$ | $m$ |\n| --- | --- |\n| 1 | 15.6 |');
    expect((b[0] as { rows: string[][] }).rows[0]).toEqual(['$t$', '$m$']);
  });

  it('does not mistake prose containing a pipe for a table', () => {
    const b = splitPipeTables('The set A | B is not a table.');
    expect(b.map(x => x.kind)).toEqual(['text']);
  });

  it('keeps two tables separated by prose apart', () => {
    const b = splitPipeTables('| a |\n| --- |\n| 1 |\nthen\n| b |\n| --- |\n| 2 |');
    expect(b.map(x => x.kind)).toEqual(['table', 'text', 'table']);
  });

  it('handles text with no table at all', () => {
    expect(splitPipeTables('just a stem')).toEqual([{ kind: 'text', text: 'just a stem' }]);
  });

  it('survives empty input', () => {
    expect(splitPipeTables('')).toEqual([{ kind: 'text', text: '' }]);
  });
});

describe('row helpers', () => {
  it('needs two pipes before a line counts as a row', () => {
    expect(isPipeRow('| a | b |')).toBe(true);
    expect(isPipeRow('|x')).toBe(false);
    expect(isPipeRow('a | b')).toBe(false);
  });

  it('recognises every GFM divider spelling', () => {
    expect(isDividerRow(['---', ':--', '--:', ':-:'])).toBe(true);
    expect(isDividerRow(['---', 'data'])).toBe(false);
  });

  it('does NOT treat a row of bare dashes as a divider', () => {
    // "| - | - |" is how a data table writes "no value"; swallowing that row
    // would delete real data from the question.
    expect(isDividerRow(['-', '-'])).toBe(false);
  });

  it('trims cells and tolerates a missing trailing pipe', () => {
    expect(splitCells('|  a |b  ')).toEqual(['a', 'b']);
  });
});
