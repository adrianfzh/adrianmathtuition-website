import { describe, it, expect } from 'vitest';
import { autoReleaseGate, holdHours, sgtShort, heldByPaperLine, requestedSentLine } from './sheet-auto-release';

const good = { noSheet: false, verified: '73/73 sympy', wave: ['chain rule'], exampleCheck: { checked: 3, disagreements: [] }, grounded: null };

describe('autoReleaseGate', () => {
  it('passes a verified, checked, non-empty sheet', () => {
    expect(autoReleaseGate(good)).toEqual({ ok: true, reasons: [], watch: [] });
  });
  it('names every reason it will not release on its own', () => {
    const r = autoReleaseGate({ noSheet: false, verified: '70/73 sympy', wave: [], exampleCheck: { checked: 2, disagreements: [{}] }, grounded: false });
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(4);
    expect(r.reasons[0]).toMatch(/only 70 of 73/);
  });
  it('a skipped or missing example check holds the sheet for a human', () => {
    expect(autoReleaseGate({ ...good, exampleCheck: { checked: 0, disagreements: [], skipped: 'model call failed' } }).ok).toBe(false);
    expect(autoReleaseGate({ ...good, exampleCheck: null }).ok).toBe(false);
  });
  it('a no-sheet completion is not auto-released', () => {
    expect(autoReleaseGate({ ...good, noSheet: true }).ok).toBe(false);
  });
});

describe('holdHours / sgtShort', () => {
  it('defaults to 12 and honours the env override, including 0 (off)', () => {
    expect(holdHours(undefined)).toBe(12);
    expect(holdHours('0')).toBe(0);
    expect(holdHours('junk')).toBe(12);
  });
  it('formats Singapore time', () => {
    expect(sgtShort('2026-09-06T16:46:58Z')).toBe('Mon 12:46am');
    expect(sgtShort('2026-09-07T01:12:00Z')).toBe('Mon 9:12am');
  });
});

describe('the paper\'s hold holds the 12-hour clock (8 Sep 2026)', () => {
  it('the paper\'s signals are watch-outs, not a refusal; only nothing-marked stops the clock (8 Sep 2026)', () => {
    const r = autoReleaseGate({ ...good, paperHold: ['2 pages could not be read'] });
    expect(r.ok).toBe(true);
    expect(r.watch).toEqual(['2 pages could not be read']);
    expect(autoReleaseGate({ ...good, paperHold: ['no questions were marked'] }).ok).toBe(false);
    expect(autoReleaseGate({ ...good, paperHold: null }).ok).toBe(true);
  });
  it('the cron names the student, the paper and the reasons when it holds', () => {
    expect(heldByPaperLine('Denise Chan', 'denise am tys 2021 p2', ['the questions add up to 85 but the paper is out of 90'], 'https://x')).toContain('NOT released — the paper is held:\n• the questions add up to 85');
  });
});

describe('requestedSentLine', () => {
  it('names the student and the paper, and carries the paper\'s watch-outs', () => {
    expect(requestedSentLine('Kassandra', 'A Math · GCE 2021 · Paper 1')).toBe('📘 <b>Kassandra</b> — A Math · GCE 2021 · Paper 1: asked for Practice Again from the app — the sheet is written and with them now.');
    expect(requestedSentLine('Denise', null, ['3/12 questions marked without their question'])).toContain('\n⚠️ Watch out for: 3/12 questions marked without their question');
  });
});
