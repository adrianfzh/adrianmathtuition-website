import { describe, it, expect } from 'vitest';
import { partLabelFromChip, scoreEdits, scoreEditsToOverrides } from './score-edits';
import { parseScoreText, restyleScoreInner, applyScoreText, recordEditsFor, parseLayer } from './layer';

const results = {
  results: [
    { question_number: '1', photo_index: 0, marking: { total_max: 6, parts: [{ label: '(a)', awarded: 0, max: 2 }, { label: '(b)', awarded: 3, max: 4 }] } },
    { question_number: '3', photo_index: 2, marking: { total_max: 4, parts: [{ label: 'a', awarded: 2, max: 2 }, { label: 'b', awarded: 2, max: 2 }] } },
    { question_number: '3', photo_index: 3, marking: { total_max: 4, parts: [{ label: 'a', awarded: 2, max: 2 }, { label: 'b', awarded: 2, max: 2 }] } },
    { question_number: '7', photo_index: 5, marking: { total_max: 5 } },
  ],
};

describe('score chip edits → overrides', () => {
  it('parses a chip caption', () => {
    expect(parseScoreText('Q3(b) 1/2')).toEqual({ awarded: 1, max: 2 });
    expect(parseScoreText('Q3(b) 5/2')).toEqual({ awarded: 2, max: 2 });
    expect(parseScoreText('Q3(b)')).toBeNull();
  });
  it('strips the question from the chip part', () => {
    expect(partLabelFromChip('Q3(b)', '3')).toBe('(b)');
    expect(partLabelFromChip('Q10(ii)', '10')).toBe('(ii)');
    expect(partLabelFromChip('Q3', '3')).toBe('');
    expect(partLabelFromChip('(b)', '3')).toBe('(b)');
  });
  it('matches the question on the edited page and the part by label', () => {
    const { overrides, unmatched } = scoreEditsToOverrides(results, [{ q: '3', part: 'Q3(b)', kind: 'score', awarded: 1, max: 2 }], 3);
    expect(unmatched).toEqual([]);
    expect(overrides).toEqual([{ index: 2, parts: [{ label: 'b', awarded: 1 }], awarded: 0 }]);
  });
  it('groups two parts of one question and keeps the last edit per part', () => {
    const { overrides } = scoreEditsToOverrides(results, [
      { q: '1', part: 'Q1(a)', kind: 'score', awarded: 1, max: 2 },
      { q: '1', part: 'Q1(b)', kind: 'score', awarded: 4, max: 4 },
      { q: '1', part: 'Q1(a)', kind: 'score', awarded: 2, max: 2 },
    ], 0);
    expect(overrides).toEqual([{ index: 0, parts: [{ label: '(b)', awarded: 4 }, { label: '(a)', awarded: 2 }], awarded: 0 }]);
  });
  it('a question with no parts takes a whole-question mark', () => {
    const { overrides } = scoreEditsToOverrides(results, [{ q: '7', part: 'Q7', kind: 'score', awarded: 3, max: 5 }], 5);
    expect(overrides).toEqual([{ index: 3, parts: [], awarded: 3 }]);
  });
  it('drops an edit that names no known question or part', () => {
    const { overrides, unmatched } = scoreEditsToOverrides(results, [
      { q: '9', part: 'Q9(a)', kind: 'score', awarded: 1, max: 2 },
      { q: '1', part: 'Q1(c)', kind: 'score', awarded: 1, max: 2 },
    ], 0);
    expect(overrides).toEqual([]);
    expect(unmatched).toHaveLength(2);
  });
  it('filters the overlay payload to score edits only', () => {
    expect(scoreEdits([{ kind: 'note', q: '1', part: '(a)', text: 'x' }, { kind: 'score', q: '1', part: 'Q1(a)', awarded: 1, max: 2 }, null])).toHaveLength(1);
  });
});

describe('score chip repaint', () => {
  const full = '<rect x="1" y="2" width="60" height="20" rx="3" fill="#1a7f37" stroke="none" opacity="0.90"/><text x="31" y="16" font-size="14" fill="#ffffff" font-family="Patrick Hand" text-anchor="middle" opacity="0.95">Q3(a) 2/2</text>';
  it('a full chip retyped to less turns into the outlined red box', () => {
    const out = applyScoreText(full, 'Q3(a) 1/2');
    expect(out).toContain('fill="none" stroke="#d32424" stroke-width="1.8"');
    expect(out).toContain('fill="#d32424"');
    expect(out).toContain('>Q3(a) 1/2</text>');
    expect(out).not.toContain('#ffffff');
  });
  it('a red chip retyped to full marks goes solid green with white figures', () => {
    const red = '<rect x="1" y="2" width="60" height="20" rx="3" fill="none" stroke="#d32424" stroke-width="2.1" opacity="0.90"/><text x="31" y="16" font-size="14" fill="#d32424" text-anchor="middle">Q1(a) 0/2</text><text x="31" y="30" font-size="10" fill="#d32424" text-anchor="middle">M1 A0</text>';
    const out = applyScoreText(red, 'Q1(a) 2/2');
    expect(out).toContain('fill="#1a7f37" stroke="none"');
    expect(out).toContain('>Q1(a) 2/2</text>');
    expect(out).toContain('>M1 A0</text>');
    expect(out).not.toContain('#d32424');
  });
  it('a purple re-marked chip keeps its ink', () => {
    const purple = full.replace('#1a7f37', '#7c3aed');
    expect(restyleScoreInner(purple, false)).toBe(purple);
  });
  it('recordEditsFor reports a retyped score and ignores an unchanged one', () => {
    const svg = '<g data-obj="score" data-id="s1" data-q="3" data-part="Q3(a)" data-text="Q3(a) 2/2">' + full + '</g>'
      + '<g data-obj="score" data-id="s2" data-q="3" data-part="Q3(b)" data-text="Q3(b) 2/2">' + full.replace('Q3(a)', 'Q3(b)') + '</g>';
    const p = parseLayer(svg);
    p.objects[0].textOverride = 'Q3(a) 1/2';
    p.objects[1].textOverride = 'Q3(b) 2/2';
    expect(recordEditsFor(p)).toEqual([{ q: '3', part: 'Q3(a)', kind: 'score', awarded: 1, max: 2 }]);
  });
});
