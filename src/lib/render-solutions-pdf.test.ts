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

// Readability (Adrian, 29 Sep 2026: "better readability has to apply to all solutions").
import { markNotesToCodes, splitSolution, isAsideLine, solutionLinesHtml as linesHtml } from './render-solutions-pdf';

describe('readable solutions', () => {
  it('shrinks a bracketed mark note to its codes', () => {
    const out = markNotesToCodes('$= 4(k-2)(k-7)$ [M1 for the discriminant formed]');
    expect(out).toBe('$= 4(k-2)(k-7)$ \u0001M1\u0002');
    expect(markNotesToCodes('[B1, a separate mark that can be earned by itself]')).toBe('\u0001B1\u0002');
    expect(markNotesToCodes('ok [M1 A1]')).toBe('ok \u0001M1 A1\u0002');
  });
  it('leaves maths brackets alone', () => {
    expect(markNotesToCodes('$4(k-2)\\left[4(k-2)-(3k-1)\\right]$')).toBe('$4(k-2)\\left[4(k-2)-(3k-1)\\right]$');
    expect(markNotesToCodes('the interval [2, 7]')).toBe('the interval [2, 7]');
  });
  it('drops the Mark scheme paragraph and moves the alternative below', () => {
    const r = splitSolution('Line one.\n\nAlternative route: $f(x) = (x+2)^2$.\n\nCombining: $2 \\le k < 7$.\n\nMark scheme: B1 …; M1 …');
    expect(r.main).toBe('Line one.\n\nCombining: $2 \\le k < 7$.');
    expect(r.alternatives).toEqual(['$f(x) = (x+2)^2$.']);
  });
  it('greys a whole-line aside but not a part label', () => {
    expect(isAsideLine('(or expanded: $16k^2 - 64k$).')).toBe(true);
    expect(isAsideLine('(a) Completing the square: $x^2$')).toBe(false);
    expect(isAsideLine('(ii) $x = 3$')).toBe(false);
  });
  it('renders the chip, the label and the Another way box', () => {
    const h = linesHtml('(a) Completing the square [M1]\n\nAlternatively, use calculus.\n\nMark scheme: M1 A1');
    expect(h).toContain('<span class="sol-inlabel">(a)</span>');
    expect(h).toContain('<span class="sol-mk">M1</span>');
    expect(h).toContain('class="sol-alt"');
    expect(h).not.toContain('Mark scheme');
    expect(h).not.toContain('[M1]');
  });
});

describe('one-block solution closes with the Answer line', () => {
  it('prints the stored answer after the working', async () => {
    const { buildSolutionsHTML } = await import('./render-solutions-pdf');
    const h = buildSolutionsHTML({ title: 't', items: [{ qnum: '1', questionText: 'q', solution: 'work', answer: '$2 \\le k < 7$', parts: null, solutionImages: [] }] });
    expect(h).toMatch(/work[\s\S]*sol-final[\s\S]*Answer:<\/span> \$2 \\le k &lt; 7\$/);
  });
});

describe('a scheme or alternative line inside a paragraph', () => {
  it('drops a Mark scheme line and moves an Alternative line, without a blank line before them', async () => {
    const { splitSolution: split } = await import('./render-solutions-pdf');
    const r = split('Width = 30 + 1.5h\nAnswer 3 cm per minute.\nMark scheme: M1 width; A1 3');
    expect(r.main).toBe('Width = 30 + 1.5h\nAnswer 3 cm per minute.');
    const r2 = split('Step one\nAlternatively: use the chain rule.\nit gives 3');
    expect(r2.main).toBe('Step one');
    expect(r2.alternatives).toEqual(['use the chain rule.\nit gives 3']);
  });
});

describe('"Mark scheme for (c):"', () => {
  it('is dropped like a plain Mark scheme line', async () => {
    const { splitSolution: split } = await import('./render-solutions-pdf');
    expect(split('Working\n\nMark scheme for (c): any complete route; B1 …').main).toBe('Working');
    expect(split('Marks for part (b): M1 A1').main).toBe('');
  });
});
