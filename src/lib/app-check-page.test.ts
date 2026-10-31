import { describe, it, expect } from 'vitest';
import { parseCheckPageRequest, parseCheckPageReply, buildCheckPagePrompt, mergeLooks, keyPhrases, pickKeyRows, type PageLine } from './app-check-page';

const sent: PageLine[] = [
  { n: 1, box: [100, 200, 300, 40] },
  { n: 2, box: [100, 250, 320, 40] },
  { n: 3, box: [100, 300, 200, 40] },
];

describe('check this page — request', () => {
  it('needs a picture and at least one line', () => {
    expect(parseCheckPageRequest({}).ok).toBe(false);
    expect(parseCheckPageRequest({ image: 'abc', lines: [] }).ok).toBe(false);
    const r = parseCheckPageRequest({ image: 'data:image/jpeg;base64,abc', lines: [{ n: 1, box: [1, 2, 3, 4] }, { n: 'x', box: [] }] });
    expect(r.ok && r.req.image).toBe('abc');
    expect(r.ok && r.req.lines).toEqual([{ n: 1, box: [1, 2, 3, 4] }]);
    expect(r.ok && r.req.printed).toBe('');
  });
  it('refuses an oversized picture', () => {
    expect(parseCheckPageRequest({ image: 'a'.repeat(4_000_001), lines: [{ n: 1, box: [1, 2, 3, 4] }] }).ok).toBe(false);
  });
  it('the prompt names the line numbers and never asks for coordinates', () => {
    const p = buildCheckPagePrompt(sent);
    expect(p).toContain('1, 2, 3');
    expect(p).not.toMatch(/coordinate|pixel/i);
  });
});

describe('check this page — reading the reply', () => {
  it('keeps only lines the app sent, once each; a tick has no note', () => {
    const r = parseCheckPageReply(`Here: {"verdict":"partial","summary":"x","lines":[
      {"n":1,"mark":"tick","note":"nice","correct":"x"},{"n":2,"mark":"cross","note":"should be ≤","correct":"−1 ≤ k ≤ 4"},
      {"n":2,"mark":"tick","note":""},{"n":9,"mark":"cross","note":"ghost"},{"n":3,"mark":"maybe"}],
      "questions":[{"label":"Q3","verdict":"partial","wrong":"Sign kept when dividing by −4.","fix":"Flip the sign.","answer":"−1 ≤ k ≤ 4"}]}`, sent);
    expect(r.lines).toEqual([{ n: 1, mark: 'tick', note: '', correct: '' }, { n: 2, mark: 'cross', note: 'should be ≤', correct: '−1 ≤ k ≤ 4' }]);
    expect(r.verdict).toBe('partial');
    expect(r.questions[0].answer).toBe('−1 ≤ k ≤ 4');
  });
  it('the page verdict follows the questions; several questions → "n of m right"', () => {
    const r = parseCheckPageReply(JSON.stringify({ verdict: 'wrong', lines: [], questions: [
      { label: 'Q1', verdict: 'correct', wrong: 'ignored', fix: 'ignored', answer: '5' },
      { label: 'Q2', verdict: 'wrong', wrong: 'a', fix: 'b', answer: '7' }] }), sent);
    expect(r.verdict).toBe('partial');
    expect(r.summary).toBe('1 of 2 right');
    expect(r.questions[0].wrong).toBe('');
  });
  it('unreadable carries no marks', () => {
    const r = parseCheckPageReply('{"verdict":"unreadable","summary":"","lines":[{"n":1,"mark":"tick"}],"questions":[]}', sent);
    expect(r).toEqual({ verdict: 'unreadable', summary: 'Nothing to check on this page.', lines: [], questions: [] });
  });
  it('no JSON is an error, not an empty result', () => {
    expect(() => parseCheckPageReply('sorry', sent)).toThrow();
  });
});

describe('check this page — two looks and the answer key', () => {
  const main = parseCheckPageReply(JSON.stringify({ verdict: 'wrong', summary: 's', lines: [
    { n: 1, mark: 'tick' }, { n: 2, mark: 'cross', note: 'sign', correct: '10 > 5x' }, { n: 3, mark: 'tick' }],
    questions: [{ label: 'Q1', verdict: 'wrong', wrong: 'a', fix: 'b', answer: 'x < 2' }] }), sent);
  it('the second look only raises a doubt: a tick it crosses becomes "?"; a main cross stays; carried-forward lines are left alone', () => {
    const second = { ...main, lines: [
      { n: 1, mark: 'cross' as const, note: '', correct: '' },
      { n: 2, mark: 'tick' as const, note: '', correct: '' },
      { n: 3, mark: 'cross' as const, note: '', correct: '' }] };
    const r = mergeLooks(main, second);
    expect(r.lines).toEqual([
      { n: 1, mark: 'unsure', note: 'check this line', correct: '' },
      { n: 2, mark: 'cross', note: 'sign', correct: '10 > 5x' },
      { n: 3, mark: 'tick', note: '', correct: '' }]);
    expect(r.questions).toEqual(main.questions);
  });
  it('no second look, or an unreadable one, leaves the main look alone', () => {
    expect(mergeLooks(main, null)).toBe(main);
    expect(mergeLooks(main, { verdict: 'unreadable', summary: '', lines: [], questions: [] })).toBe(main);
  });
  it('phrases are plain words, no maths, spread over the page', () => {
    const p = keyPhrases('1 (a) Solve the inequality 5 − 3(x − 2) > 2x + 1. (b) Simplify (9p⁴q⁻²)^½ × 2p⁻³q⁵, giving your answer in positive index form.');
    expect(p).toContain('giving your answer in');
    expect(p.every(x => /^[a-z ]+$/.test(x))).toBe(true);
    expect(keyPhrases('x² + 3x = 10')).toEqual([]);
  });
  it('a row needs two phrases; boilerplate phrases are dropped; one phrase alone must be near-unique', () => {
    const many = Array.from({ length: 25 }, (_, i) => `b${i}`);
    expect(pickKeyRows([['a', 'b'], ['a'], many], 25)).toEqual(['a']);
    expect(pickKeyRows([['a', 'b', 'c', 'd']], 25)).toEqual([]);
    expect(pickKeyRows([['a']], 25)).toEqual(['a']);
  });
  it('the answer key goes into the prompt, and the marker is told never to name a source', () => {
    const p = buildCheckPagePrompt(sent, [{ text: 'Solve 2x > 4.', answer: 'x > 2', solution: '' }]);
    expect(p).toContain('Correct answer: x > 2');
    expect(p).toMatch(/Never mention these records/);
    expect(buildCheckPagePrompt(sent)).not.toContain('Our records');
  });
});
