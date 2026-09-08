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
  it('a heading that names the tool — "Example 1 : Finding The Normal…" — is still an example (Kassandra, 8 Sep 2026)', () => {
    // The real shape of every sheet since the "heading names the TOOL" rule:
    // title after a colon, an (Optional) tag on the last one, and the Optional
    // tail's own line. Zero of these matched the bare-number pattern.
    const real = [
      'PRACTICE AGAIN — Learn from A Math 2021 Paper 1',
      'Example 1 : Finding The Normal To A Curve And The Area It Cuts Off',
      'The curve y = x² − 4x + 3 has a normal at x = 1. Find its equation.',
      'Solution:', 'dy/dx = 2x − 4 = −2 at x = 1, so the normal has gradient ½.', 'y = ½x − ½',
      'Practice 1', 'Practice 1.1 The curve y = x³ … [3]',
      '(Optional) — do this last section only if you have time.',
      'Example 2 : Clearing A Fraction By Multiplying Every Term (Optional)',
      'Solve 3/x + 2 = 5.', 'Solution:', '3 + 2x = 5x, so x = 1.',
      'Practice 2', 'Practice 2.1 Solve 4/x − 1 = 3. [2]',
    ].join('\n');
    const ex = extractExamples(real);
    expect(ex.map(e => e.n)).toEqual([1, 2]);
    expect(ex[0].question).toBe('The curve y = x² − 4x + 3 has a normal at x = 1. Find its equation.');
    expect(ex[0].solution).toContain('y = ½x − ½');
    expect(ex[0].solution).not.toContain('Practice 1.1');
    expect(ex[1].question).toBe('Solve 3/x + 2 = 5.');
    expect(ex[1].solution).toBe('3 + 2x = 5x, so x = 1.');
    // prose that merely starts with the word is not a heading
    expect(extractExamples('Example 3 shows the idea.\nSolution:\nx = 2').length).toBe(0);
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
  it('a narrated first reply is followed by one JSON-only retry, and the verdicts come from that (8 Sep 2026)', async () => {
    const ex = extractExamples(SHEET);
    let calls = 0;
    const out = await runExampleCheck(ex, async (prompt) => {
      calls += 1;
      if (calls === 1) return '**Example 1:** Verified independently: R = 5 … correct.\n\n**Example 2:** the expansion is fine.';
      expect(prompt).toMatch(/OUTPUT ONLY THE JSON OBJECT/);
      return '{"verdicts":[{"example":1,"agree":true,"final_answer_matches":true,"issue":""},{"example":2,"agree":true,"final_answer_matches":true,"issue":""}]}';
    }, 'm');
    expect(calls).toBe(2);
    expect(out.checked).toBe(2);
    expect(out.skipped).toBeUndefined();
  });
  it('a narrated reply with no JSON is a SKIP with a reason, never "0 examples"', async () => {
    const ex = extractExamples(SHEET);
    const prose = await runExampleCheck(ex, async () => 'Looking at each example:\n\n**Example 1:** R = 5 … all correct.\n\n**Example 2:** the derivation is fine', 'm');
    expect(prose.checked).toBe(0);
    expect(prose.skipped).toMatch(/no JSON verdicts/);
    expect(prose.skipped).toMatch(/Looking at each example/);
    expect(buildCheckPrompt(ex)).toMatch(/LAST thing in your reply/);
  });
});
