import { describe, it, expect } from 'vitest';
import { bundleList, paperOrderKey, syllabusOrder } from './portal-paper-bundles';

const P = (id: string, name: string, date: string) => ({ id, name, date });

describe('paperOrderKey', () => {
  it('reads the year and paper number from a student-facing name', () => {
    expect(paperOrderKey('A Math · GCE 2023 · Paper 1')).toEqual({ year: 2023, paper: 1 });
    expect(paperOrderKey('E Math · GCE 2025 · Paper 2')).toEqual({ year: 2025, paper: 2 });
  });
  it('is null where a name carries neither', () => {
    expect(paperOrderKey('A Math · Test Set 3')).toEqual({ year: null, paper: null });
    expect(paperOrderKey('Marked paper')).toEqual({ year: null, paper: null });
  });
});

describe('syllabusOrder', () => {
  it("Adrian's example: 2023 P1, 2023 P2, then 2025 P1 — whatever order they were handed in", () => {
    const ordered = syllabusOrder([
      P('a', 'A Math · GCE 2025 · Paper 1', '2026-09-08'),
      P('b', 'A Math · GCE 2023 · Paper 2', '2026-09-07'),
      P('c', 'A Math · GCE 2023 · Paper 1', '2026-09-09'),
    ]);
    expect(ordered.map(p => p.id)).toEqual(['c', 'b', 'a']);
  });
  it('a paper with no year goes after the dated ones; ties fall back to hand-in date', () => {
    const ordered = syllabusOrder([
      P('set', 'A Math · Test Set 3 · Paper 1', '2026-09-01'),
      P('p2', 'A Math · GCE 2024 · Paper 2', '2026-09-03'),
      P('p2b', 'A Math · GCE 2024 · Paper 2', '2026-09-02'),
    ]);
    expect(ordered.map(p => p.id)).toEqual(['p2b', 'p2', 'set']);
  });
});

describe('bundleList', () => {
  const list = [
    P('n', 'E Math · GCE 2025 · Paper 2', '2026-09-10'),   // newest, not in any batch
    P('a', 'A Math · GCE 2025 · Paper 1', '2026-09-08'),
    P('x', 'A Math · GCE 2024 · Paper 1', '2026-09-08'),   // single-paper sheet
    P('b', 'A Math · GCE 2023 · Paper 2', '2026-09-07'),
    P('c', 'A Math · GCE 2023 · Paper 1', '2026-09-06'),
    P('o', 'E Math · GCE 2022 · Paper 1', '2026-09-01'),   // no sheet
  ];
  const merged = { id: 'sheet-1', source_run_ids: ['a', 'b', 'c'] };
  const single = { id: 'sheet-2', source_run_ids: null };
  const sheetOf = (id: string) => (['a', 'b', 'c'].includes(id) ? merged : id === 'x' ? single : null);

  it('the covered papers become one bundle in the newest paper\'s slot, in syllabus order; the rest stay single cards', () => {
    const out = bundleList(list, sheetOf);
    expect(out.map(e => e.kind)).toEqual(['paper', 'bundle', 'paper', 'paper']);
    const bundle = out[1];
    if (bundle.kind !== 'bundle') throw new Error('expected a bundle');
    expect(bundle.sheetId).toBe('sheet-1');
    expect(bundle.papers.map(p => p.id)).toEqual(['c', 'b', 'a']);
    expect(out[2]).toEqual({ kind: 'paper', paper: list[2] });
    expect(out[3]).toEqual({ kind: 'paper', paper: list[5] });
  });

  it('a sheet that covers only ONE listed paper (the others fell off the list) is a plain card', () => {
    const shorter = list.filter(p => p.id !== 'b' && p.id !== 'c');
    const out = bundleList(shorter, sheetOf);
    expect(out.every(e => e.kind === 'paper')).toBe(true);
  });

  it('a single-paper sheet never bundles', () => {
    const out = bundleList(list, id => (id === 'x' ? single : null));
    expect(out.every(e => e.kind === 'paper')).toBe(true);
    expect(out).toHaveLength(6);
  });

  it('a paper the sheet does not name is not pulled into its bundle even if the page hands it that sheet', () => {
    const out = bundleList(list, id => (['a', 'b', 'n'].includes(id) ? { id: 's', source_run_ids: ['a', 'b'] } : null));
    expect(out[0]).toEqual({ kind: 'paper', paper: list[0] });
    const bundle = out[1];
    if (bundle.kind !== 'bundle') throw new Error('expected a bundle');
    expect(bundle.papers.map(p => p.id)).toEqual(['b', 'a']);
  });
});
