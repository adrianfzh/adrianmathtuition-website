import { describe, it, expect } from 'vitest';
import { parseCheckPageRequest, parseCheckPageReply, buildCheckPagePrompt, type PageLine } from './app-check-page';

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
      {"n":1,"mark":"tick","note":"nice"},{"n":2,"mark":"cross","note":"should be ≤"},
      {"n":2,"mark":"tick","note":""},{"n":9,"mark":"cross","note":"ghost"},{"n":3,"mark":"maybe"}],
      "questions":[{"label":"Q3","verdict":"partial","wrong":"Sign kept when dividing by −4.","fix":"Flip the sign.","answer":"−1 ≤ k ≤ 4"}]}`, sent);
    expect(r.lines).toEqual([{ n: 1, mark: 'tick', note: '' }, { n: 2, mark: 'cross', note: 'should be ≤' }]);
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
