import { describe, it, expect } from 'vitest';
import { frontPageHtml, chooseThemes, type FrontPageInput } from './front-page-html';
import type { Theme } from './paper-analysis';

const theme = (over: Partial<Theme> = {}): Theme => ({
  key: 'shape', title: 'Mensuration — volume, surface area, arcs and sectors',
  marks: 18, occasions: 10, papers: 5, live: true, latestMarks: 7,
  examples: [{ paperName: 'p', question: 'Q5', why: 'Volume of a half cylinder is ½πr²h.' }],
  ...over,
});

const base: FrontPageInput = {
  studentName: 'Eva Isabelle Wong', paperName: 'E-Maths TYS 2022 Paper 2',
  markedOn: '30 Aug 2026', awarded: 60, max: 90, papersRead: 5,
  themes: [theme()], worstQuestions: [{ question: 'Q5', lost: 7, max: 7 }],
};

describe('frontPageHtml', () => {
  it('leads with the score and the one thing worth their time', () => {
    const h = frontPageHtml(base);
    expect(h).toContain('60');
    expect(h).toContain('/90');
    expect(h).toContain('67%');
    expect(h).toContain('mensuration');       // lowercased topic, not the marker's category
  });

  it('explains why it read more than one paper', () => {
    expect(frontPageHtml(base)).toMatch(/last\s+<b>5<\/b>\s+marked papers/);
    expect(frontPageHtml(base)).toMatch(/bad day/);
  });

  it('drops that explanation when there is only one paper to go on', () => {
    const h = frontPageHtml({ ...base, papersRead: 1 });
    expect(h).not.toContain('class="why"');
    expect(h).toContain('this paper alone');   // and says so, in words
  });

  it('marks an eased weakness as fixed and gives credit for it', () => {
    const h = frontPageHtml({ ...base, themes: [
      theme(), theme({ key: 'blank', title: 'Questions you left blank', live: false, marks: 37, papers: 4, latestMarks: 0 }),
    ] });
    expect(h).toContain('>fixed<');
    expect(h).toContain('Not once on this paper');
    expect(h).toContain('class="theme eased"');
  });

  it('ties the closing line to the top weakness and the worst questions', () => {
    const h = frontPageHtml({ ...base, worstQuestions: [
      { question: 'Q5', lost: 7, max: 7 }, { question: 'Q7', lost: 6, max: 7 },
    ] });
    expect(h).toContain('Start with <b>Q5</b> and <b>Q7</b>');
    expect(h).toContain('practice sheet');
  });

  it('says so honestly when nothing is live', () => {
    const h = frontPageHtml({ ...base, themes: [theme({ live: false })] });
    expect(h).toMatch(/scattered rather than concentrated/);
  });

  it('draws each question bar in proportion to what it cost', () => {
    const h = frontPageHtml({ ...base, worstQuestions: [
      { question: 'Q5', lost: 7, max: 7 }, { question: 'Q10', lost: 6, max: 8 },
    ] });
    expect(h).toContain('width:100%');
    expect(h).toContain('width:75%');
  });

  it('escapes anything that came from the marker', () => {
    const h = frontPageHtml({ ...base, studentName: 'A <script>alert(1)</script> B',
      themes: [theme({ examples: [{ paperName: 'p', question: 'Q1', why: 'a < b & c' }] })] });
    expect(h).not.toContain('<script>alert');
    expect(h).toContain('&lt;script&gt;');
    expect(h).toContain('&lt; b &amp; c');
  });

  it('survives an empty analysis rather than rendering a broken page', () => {
    const h = frontPageHtml({ ...base, themes: [], worstQuestions: [] });
    expect(h).toContain('<body');
    expect(h).toContain('</html>');
    expect(h).toMatch(/scattered/);
  });

  it('is A4-wide and commits to one palette — it is going on paper', () => {
    const h = frontPageHtml(base);
    expect(h).toContain('210mm');
    expect(h).not.toContain('prefers-color-scheme');
  });

  // ── the two defects the first live render on Eva's paper exposed ──────────

  it('typesets the marker\'s TeX instead of printing it at a student', () => {
    const h = frontPageHtml({ ...base, themes: [{ ...base.themes[0],
      examples: [{ paperName: 'p', question: 'Q5', why: 'Volume is $\\frac{1}{2}\\pi r^2 h$ here.' }] }] });
    expect(h).not.toContain('\\frac{1}{2}');   // the raw TeX must not survive
    expect(h).toContain('katex');                // ...because KaTeX consumed it
  });

  it('never cuts a quote inside a $…$ span — an unclosed $ eats the sentence', () => {
    const long = 'The area is ' + 'x'.repeat(140) + ' and $\\frac{a}{b} = 7$ exactly.';
    const h = frontPageHtml({ ...base, themes: [{ ...base.themes[0],
      examples: [{ paperName: 'p', question: 'Q1', why: long }] }] });
    const note = h.slice(h.indexOf('theme-note'), h.indexOf('</p>', h.indexOf('theme-note')));
    expect((note.match(/\$/g) || []).length % 2).toBe(0);
  });

  it('keeps a slot for what the student has FIXED — a plain slice always cuts it', () => {
    const live = (n: number) => ({ ...base.themes[0], key: `l${n}`, title: `Live ${n}`, live: true, marks: 10 - n });
    const fixed = { ...base.themes[0], key: 'blank', title: 'Questions you left blank', live: false, marks: 37 };
    const out = chooseThemes([live(1), live(2), live(3), live(4), live(5), fixed]);
    expect(out.map(t => t.key)).toContain('blank');
    expect(out.filter(t => t.live).length).toBeLessThanOrEqual(3);
  });

  it('does not invent a fixed row when there is nothing fixed to report', () => {
    const live = (n: number) => ({ ...base.themes[0], key: `l${n}`, live: true, marks: 5 });
    const out = chooseThemes([live(1), live(2)]);
    expect(out.every(t => t.live)).toBe(true);
  });
});
