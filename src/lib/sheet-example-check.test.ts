import { describe, it, expect } from 'vitest';
import { docxXmlToText, extractExamples, buildCheckPrompt, parseCheck, runExampleCheck } from './sheet-example-check';

const SHEET = [
  'PRACTICE AGAIN — Learn from A Math 2022 Paper 1', 'For Rainie Cheng',
  'Displacement → velocity → acceleration: you DIFFERENTIATE',
  'Example 1', 'A dot moves so that x = 50 sin(πt/2).', '(b) Obtain the velocity. [3]',
  'Solution:', '(b) | v = dx/dt = 25π cos(πt/2)',
  'Practice 1', 'A dot moves so that x = 18 cos(πt/6). [3]', '[Ans: v = −3π sin(πt/6)]',
  'Example 2', 'Find the coefficient of x³ in (1 + 2x)(3 − x)⁴.',
  'Solution:', '(3 − x)⁴ = 81 − 108x + 54x² − 12x³ + x⁴', 'coefficient = 1(−12) + 2(54) = 96',
  'Practice 2', 'Find the coefficient of x³ in (2 − 3x)(1 + 2x)⁵. [3]', '[Ans: 40]',
].join('\n');

describe('extractExamples', () => {
  it('finds each Example with its question and solution, ignoring Practice blocks', () => {
    const ex = extractExamples(SHEET);
    expect(ex.map(e => e.n)).toEqual([1, 2]);
    expect(ex[0].question).toContain('Obtain the velocity');
    expect(ex[0].solution).toContain('25π cos');
    expect(ex[1].solution).toContain('= 96');
    expect(ex[1].question).not.toContain('Practice');
  });
  it('docxXmlToText keeps table cells on one line with a separator', () => {
    const xml = '<w:body><w:p><w:r><w:t>Example 1</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>(a)</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>x = 5</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body>';
    expect(docxXmlToText(xml)).toBe('Example 1\n(a) | x = 5');
  });
});

describe('parseCheck', () => {
  it('a different final answer is a disagreement even if the model says agree', () => {
    const v = parseCheck('{"verdicts":[{"example":1,"agree":true,"final_answer_matches":false,"issue":"x"},{"example":2,"agree":true,"final_answer_matches":true,"issue":""}]}', [1, 2]);
    expect(v[0].agree).toBe(false);
    expect(v[1].agree).toBe(true);
  });
  it('a missing verdict defaults to agree and says so; garbage yields []', () => {
    expect(parseCheck('{"verdicts":[]}', [1])[0]).toMatchObject({ example: 1, agree: true, issue: 'no verdict returned' });
    expect(parseCheck('nonsense', [1])).toEqual([]);
  });
});

describe('runExampleCheck', () => {
  it('holds on a disagreement and is fail-open on a model error', async () => {
    const ex = extractExamples(SHEET);
    const bad = await runExampleCheck(ex, async () => '{"verdicts":[{"example":1,"agree":true,"final_answer_matches":true},{"example":2,"agree":false,"final_answer_matches":false,"issue":"1(−12)+2(54) is 96, but the x³ pairing 2x × 54x² gives 108x³ and the sum should be 96 — fine; the (3 − x)⁴ expansion is wrong: the x² term is +54x²"}]}', 'm');
    expect(bad.checked).toBe(2);
    expect(bad.disagreements.map(d => d.example)).toEqual([2]);
    const boom = await runExampleCheck(ex, async () => { throw new Error('boom'); }, 'm');
    expect(boom.skipped).toMatch(/boom/);
    expect(boom.disagreements).toEqual([]);
    expect(buildCheckPrompt(ex)).toContain('### Example 2');
  });
});
