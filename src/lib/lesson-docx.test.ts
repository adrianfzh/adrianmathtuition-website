// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { latexToOMML, functionSpaces } from './lesson-docx';

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

// What pandoc gives the Python house file (worksheet_lib.py), matched here so the
// picker's Word file prints the same maths as a create-worksheet sheet.
describe('latexToOMML — house rules shared with the Python builder', () => {
  it('\\begin{cases} is a growing "{" with no closing bracket and left-aligned columns', () => {
    const o = latexToOMML(String.raw`\begin{cases} x+1 & x<0 \\ 2x & x \ge 0 \end{cases}`);
    expect(o).toContain('<m:begChr m:val="{"/><m:endChr m:val=""/>');
    expect(o).toContain('<m:mcJc m:val="left"/>');
    expect(o.match(/<m:mr>/g)?.length).toBe(2);
  });
  it('\\begin{aligned} is an equation array aligned at "=" (m:eqArr with the & mark)', () => {
    const o = latexToOMML(String.raw`\begin{aligned} y &= 2x+1 \\ &= 3 \end{aligned}`);
    expect(o).toContain('<m:eqArr>');
    expect(o.match(/<m:e>/g)?.length).toBe(2);
    expect(o).toMatch(/<m:t>y<\/m:t><\/m:r><m:r><m:t>&amp;<\/m:t><\/m:r>.*<m:t[^>]*>=<\/m:t>/);
    expect(o).not.toContain('<m:m>');
  });
  it('\\mathbf{r} prints bold (m:sty bi), like pandoc', () => {
    const o = latexToOMML(String.raw`\mathbf{r}\cdot\mathbf{a}`);
    expect(o.match(/<m:sty m:val="bi"\/>/g)?.length).toBe(2);
  });
  it('\\text{…} is normal text (m:nor), and \\dfrac a bar fraction', () => {
    const o = latexToOMML(String.raw`3 \text{ cm}^2 \text{ and } \dfrac{a}{b}`);
    expect(o).toMatch(/<m:rPr><m:nor\/><m:sty m:val="p"\/><\/m:rPr><m:t xml:space="preserve">[ \u00a0]cm<\/m:t>/);
    expect(o).toContain('<m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f>');
    expect(o).not.toContain('m:type');
  });
  it('"cos P", not "cosP": a thin space after a function name that runs into a letter — never before a bracket', () => {
    expect(functionSpaces(String.raw`\cos P\cos Q + \sin^2 x + \ln(x) + \tan(\theta)`)).toBe(String.raw`\cos\, P\, \cos\, Q + \sin^2\, x + \ln(x) + \tan(\theta)`);
    const o = latexToOMML(String.raw`\cos P + \sin^2 x + \ln(x)`);
    expect(o).toMatch(/<m:t>cos<\/m:t><\/m:r><m:r>(?:<m:rPr>(?:<m:nor\/>)?<m:sty m:val="p"\/><\/m:rPr>)?<m:t xml:space="preserve">[   ]<\/m:t><\/m:r><m:r><m:t>P<\/m:t>/);
    expect(o).toMatch(/<m:sup><m:r><m:t>2<\/m:t><\/m:r><\/m:sup><\/m:sSup><m:r>(?:<m:rPr>(?:<m:nor\/>)?<m:sty m:val="p"\/><\/m:rPr>)?<m:t xml:space="preserve">[   ]<\/m:t><\/m:r><m:r><m:t>x<\/m:t>/);
    expect(o).toMatch(/<m:t>ln<\/m:t><\/m:r><m:r><m:t xml:space="preserve">\(<\/m:t>/);
    expect(o).not.toContain('⁡');
  });
  it('\\csc is spelt cosec', () => {
    expect(latexToOMML(String.raw`\csc A`)).toContain('<m:t>cosec</m:t>');
  });
  it('a bare "a/b" is stacked as a fraction, binding the way the maths does; a "/" in \\text{} is left alone', () => {
    const o = latexToOMML(String.raw`a+b/c+d`);
    expect(o).toContain('<m:f><m:num><m:r><m:t>b</m:t></m:r></m:num><m:den><m:r><m:t>c</m:t></m:r></m:den></m:f>');
    expect(o).toMatch(/<m:t>a<\/m:t>.*<m:t[^>]*>\+<\/m:t>.*<m:f>.*<\/m:f>.*<m:t[^>]*>\+<\/m:t>.*<m:t>d<\/m:t>/);
    const g = latexToOMML(String.raw`(x+1)/2`);
    expect(g).toMatch(/<m:num><m:r><m:t[^>]*>\(<\/m:t><\/m:r>.*<m:t[^>]*>\)<\/m:t><\/m:r><\/m:num><m:den><m:r><m:t>2<\/m:t>/);
    const t = latexToOMML(String.raw`5 \text{ m/s}`);
    expect(t).not.toContain('<m:f>');
    expect(t).toMatch(/[ \u00a0]m\/s/);
  });
});
