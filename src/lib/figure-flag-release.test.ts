import { describe, expect, it } from 'vitest';
import { isCorrectnessHold, parseFitnessNote, releaseNote, NOTE_MAX } from './figure-flag-release';

describe('isCorrectnessHold', () => {
  it('holds the verdicts pixels cannot see', () => {
    expect(isCorrectnessHold('figfit scope2 3 Sep 2026 · blocks-answering · wrong-figure · a bare axis where the pyramid belongs')).toBe(true);
    expect(isCorrectnessHold('figfit 3 Sep 2026 · blocks-answering · answer-leak · completed construction in colour')).toBe(true);
    expect(isCorrectnessHold('RE-OPENED 3 Sep 2026 21:05 — was flipped to fixed with no repair logged')).toBe(true);
    expect(isCorrectnessHold('Adrian: hide · figfit 3 Sep 2026 · cosmetic · foreign · question number in frame')).toBe(true);
  });
  it('lets cosmetic and watermark rows through', () => {
    expect(isCorrectnessHold('figfit 3 Sep 2026 · cosmetic · incomplete · zero right margin')).toBe(false);
    expect(isCorrectnessHold('shard25 scan 2026-07-16 watermark')).toBe(false);
    expect(isCorrectnessHold(null)).toBe(false);
    expect(isCorrectnessHold('')).toBe(false);
  });
});

describe('releaseNote', () => {
  it('never returns null and keeps the previous note behind the prefix', () => {
    expect(releaseNote('figfit · cosmetic · incomplete · tight crop')).toBe('Adrian: released · figfit · cosmetic · incomplete · tight crop');
    expect(releaseNote(null)).toBe('Adrian: released');
    expect(releaseNote('   ')).toBe('Adrian: released');
  });
  it('says so when the release overrode a hold', () => {
    const n = releaseNote('figfit · blocks-answering · answer-leak · colour construction', { force: true, extra: 'vetted on paper' });
    expect(n.startsWith('Adrian: released despite hold (vetted on paper) · figfit')).toBe(true);
  });
  it('caps at the column width', () => {
    expect(releaseNote('x'.repeat(900)).length).toBe(NOTE_MAX);
  });
});

describe('parseFitnessNote', () => {
  it('reads severity and the VERDICT, not the severity, from the grammar every writer uses', () => {
    expect(parseFitnessNote('figfit scope2 3 Sep 2026 · blocks-answering · wrong-figure · a bare axis'))
      .toEqual({ severity: 'blocks-answering', verdict: 'wrong-figure' });
    expect(parseFitnessNote('ingest-fitness 2026-09-04 · cosmetic · incomplete · zero margin'))
      .toEqual({ severity: 'cosmetic', verdict: 'incomplete' });
  });
  it('survives a human prefix and a re-open prefix', () => {
    expect(parseFitnessNote('Adrian: repair · figfit 3 Sep 2026 · cosmetic · illegible · 41% ink').verdict).toBe('illegible');
    expect(parseFitnessNote('RE-OPENED 3 Sep 2026 · figfit 3 Sep 2026 · blocks-answering · answer-leak · PR = 15 scrawled').verdict).toBe('answer-leak');
  });
  it('returns nulls for an empty or foreign note', () => {
    expect(parseFitnessNote(null)).toEqual({ severity: null, verdict: null });
    expect(parseFitnessNote('shard25 scan 2026-07-16')).toEqual({ severity: null, verdict: null });
  });
});
