import { describe, it, expect } from 'vitest';
import { partLabel, isCheckLine, displayFractions, solutionLinesHtml, stemText, buildSolutionsHTML } from './render-solutions-pdf';

describe('solutions PDF readability (Adrian, 25 Sep 2026)', () => {
  it('labels sub-parts in full, bracketed', () => {
    expect(partLabel(['a'])).toBe('(a)');
    expect(partLabel(['d', 'ii'])).toBe('(d)(ii)');
    expect(partLabel(['(b)', 'i'])).toBe('(b)(i)');
  });

  it('spots check lines', () => {
    expect(isCheckLine('Check: 1 - 2(-0.1) = 1.2')).toBe(true);
    expect(isCheckLine('Check in (2): 5 + 3 = 8')).toBe(true);
    expect(isCheckLine('Checking account balance')).toBe(false);
    expect(isCheckLine('x = 1')).toBe(false);
  });

  it('prints fractions full size, leaving \\dfrac and \\frac-prefixed macros alone', () => {
    expect(displayFractions('$\\frac{1}{2}$')).toBe('$\\dfrac{1}{2}$');
    expect(displayFractions('$\\dfrac{1}{2}$')).toBe('$\\dfrac{1}{2}$');
    expect(displayFractions('$\\fracx$')).toBe('$\\fracx$');
  });

  it('greys check lines, keeps display maths in one block', () => {
    const h = solutionLinesHtml('$x = 1$\nCheck: $3 = 3$');
    expect(h).toContain('<div class="sol-line">$x = 1$</div>');
    expect(h).toContain('<div class="sol-check">Check: $3 = 3$</div>');
    expect(solutionLinesHtml('$$\nx = 1\n$$')).toContain('class="sol-body"');
  });

  it('drops inline figure markers from the grey question text', () => {
    expect(stemText('Find Q3.\n{{IMG:question_images/x.png}}\nHence')).toBe('Find Q3.\n\nHence');
  });

  it('lays out a per-part row: label, solution, bold answer', () => {
    const html = buildSolutionsHTML({
      title: 'T', includeStems: false,
      items: [{
        qnum: '1', questionText: '', solution: 'x', solutionFromParts: true, answer: '', solutionImages: [],
        parts: [{ label: 'd', subparts: [{ label: 'ii', solution: '$y = 2$', answer: '$y = \\frac{1}{2}$' }] }],
      }],
    });
    expect(html).toContain('<span class="sol-plabel">(d)(ii)</span>');
    expect(html).toContain('<span class="sol-final-k">Answer:</span> $y = \\dfrac{1}{2}$');
    expect(html).not.toContain('<span class="sol-plabel">(d)</span>'); // intro-only parent, no stems → no empty row
  });
});
