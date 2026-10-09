// The print record for re-lettered parts: no record, no print (SPEC-PART-SYLLABUS.md §Re-lettering).
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { carryPartLabels, partLabelsOf, printedLabelRows, studentRow, storedOriginalKey } from './part-syllabus';
import { recordPrintedLabels, printedOriginalKey, PRINT_TABLE } from './part-label-prints-store';

const q = (id: string, hideMiddle: boolean) => ({
  id, question_text: 'Stem.', total_marks: 9,
  parts: [
    { label: 'i', marks: 3, text: 'x' },
    { label: 'ii', marks: 3, text: 'y', ...(hideMiddle ? { legacy: true, legacy_reason: 'r' } : {}) },
    { label: 'iii', marks: 3, text: 'z' },
  ],
});
const fake = (fail: boolean) => {
  const inserted: unknown[] = [];
  const sb = { from: (t: string) => ({ insert: async (rows: unknown[]) => { if (t !== PRINT_TABLE) throw new Error(t); if (fail) return { error: { message: 'relation does not exist' } }; inserted.push(...rows); return { error: null }; } }) };
  return { sb: sb as unknown as SupabaseClient, inserted };
};

describe('what a printed sheet called each part', () => {
  const plain = studentRow(q('00000000-0000-0000-0000-000000000001', false))!;
  const moved = studentRow(q('00000000-0000-0000-0000-000000000002', true))!;

  it('one row per re-lettered question: shown letter → the bank\'s part; nothing for a question whose letters are the bank\'s own', () => {
    const rows = printedLabelRows({ surface: 'kiosk', ref: 'sheet-1', student: 'recA' }, [plain, moved]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ surface: 'kiosk', ref: 'sheet-1', student: 'recA', question_id: moved.id, labels: { i: 'i', ii: 'iii' } });
    expect(rows[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(storedOriginalKey(rows[0].labels, '(ii)')).toBe('iii');
  });
  it('the map follows the row into the object a sheet is built from, and stays out of JSON', () => {
    const item = carryPartLabels({ id: moved.id, markdown: 'text' }, moved);
    expect(partLabelsOf(item).original).toEqual({ i: 'i', ii: 'iii' });
    expect(JSON.stringify(item)).toBe(`{"id":"${moved.id}","markdown":"text"}`);
    expect(Object.keys(carryPartLabels({ id: plain.id }, plain))).toEqual(['id']);
  });
  it('recorded → everything prints', async () => {
    const { sb, inserted } = fake(false);
    expect(await recordPrintedLabels(sb, { surface: 'print-paper', ref: 'p1' }, [plain, moved])).toEqual([plain, moved]);
    expect(inserted).toHaveLength(1);
  });
  it('the record cannot be written → the re-lettered question is left off the sheet; the others still print', async () => {
    const { sb, inserted } = fake(true);
    expect(await recordPrintedLabels(sb, { surface: 'print-paper', ref: 'p1' }, [plain, moved])).toEqual([plain]);
    expect(inserted).toHaveLength(0);
  });
  it('nothing re-lettered → the table is never touched', async () => {
    const sb = { from: () => { throw new Error('must not be called'); } } as unknown as SupabaseClient;
    expect(await recordPrintedLabels(sb, { surface: 'kiosk' }, [plain])).toEqual([plain]);
  });
  it('reading back: the sheet\'s own record wins over the bank as it stands today', async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lte', 'order']) chain[m] = () => chain;
    chain.limit = async () => ({ data: [{ labels: { i: 'i', ii: 'iii' } }] });
    const sb = { from: () => chain } as unknown as SupabaseClient;
    expect(await printedOriginalKey(sb, { surface: 'print-paper', ref: 'p1', questionId: moved.id }, '(ii)')).toBe('iii');
    chain.limit = async () => ({ data: [] });
    expect(await printedOriginalKey(sb, { questionId: plain.id }, '(ii)')).toBe('ii');   // no record: the letters were the bank's own
  });
});
