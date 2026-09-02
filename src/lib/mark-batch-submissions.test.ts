import { describe, it, expect } from 'vitest';
import { batchSubmissionsFormula, submissionsLinkedToBatch } from './mark-batch-submissions';

describe('batchSubmissionsFormula', () => {
  it('FINDs the app-level Batch ID text (ARRAYJOIN yields primary-field text, never record ids)', () => {
    // Regression: all three mark-batch routes used FIND("<recId>", ...) — the
    // Batches record id — which can never appear in ARRAYJOIN({Batches})
    // output, so every submissions lookup returned zero rows (2026-09-02).
    expect(batchSubmissionsFormula('batch_1776961859688_2omfl0')).toBe(
      'FIND("batch_1776961859688_2omfl0", ARRAYJOIN({Batches}))'
    );
  });

  it('strips quote/backslash characters so the formula cannot be broken out of', () => {
    expect(batchSubmissionsFormula('batch_1\\"x')).toBe('FIND("batch_1x", ARRAYJOIN({Batches}))');
  });
});

describe('submissionsLinkedToBatch', () => {
  type Rec = { id: string; fields?: Record<string, unknown> };
  const rec = (id: string, batches?: unknown): Rec => ({
    id,
    fields: batches === undefined ? {} : { Batches: batches },
  });

  it('keeps only records whose Batches link includes the batch record id', () => {
    const records: Rec[] = [
      rec('a', ['recTarget']),
      rec('b', ['recOther']),
      rec('c', ['recOther', 'recTarget']), // multi-link still matches
      rec('d'), // no Batches field
      { id: 'e' }, // no fields at all
      rec('f', 'recTarget'), // malformed non-array value
    ];
    expect(submissionsLinkedToBatch(records, 'recTarget').map(r => r.id)).toEqual(['a', 'c']);
  });

  it('drops FIND substring false-positives (one batch id a prefix of another)', () => {
    // batch ids are batch_<ts>_<Math.random().toString(36).slice(2,8)> — the
    // suffix is USUALLY 6 chars but not guaranteed, so "batch_1_a" is a
    // substring of "batch_1_ab" and FIND would return both. The JS confirm on
    // the record id keeps only the real batch's rows.
    const records = [rec('short', ['recShort']), rec('long', ['recLong'])];
    expect(submissionsLinkedToBatch(records, 'recShort').map(r => r.id)).toEqual(['short']);
  });
});
