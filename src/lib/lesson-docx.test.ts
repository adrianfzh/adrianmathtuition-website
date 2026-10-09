// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { latexToOMML } from './lesson-docx';

describe('latexToOMML', () => {
  it('a column vector gets growing brackets (m:d), not plain "(" ")" runs', () => {
    const o = latexToOMML(String.raw`\mathbf{r}\cdot\begin{pmatrix}2\\-3\\1\end{pmatrix}=25`);
    expect(o).toContain('<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e><m:m>');
    expect(o.match(/<m:mr>/g)?.length).toBe(3);
    expect(o).not.toMatch(/<m:r><m:t[^>]*>\(<\/m:t><\/m:r>/);
  });
  it('\\left( … \\right) also becomes a delimiter', () => {
    const o = latexToOMML(String.raw`\left(\frac{a}{b}\right)`);
    expect(o).toContain('<m:begChr m:val="("/>');
    expect(o).toContain('<m:f>');
  });
  it('ordinary brackets stay as typed', () => {
    const o = latexToOMML(String.raw`(x+1)^2`);
    expect(o).not.toContain('<m:d>');
    expect(o).toContain('<m:sSup>');
  });
});
