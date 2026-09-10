import { describe, it, expect } from 'vitest';
import { frontPageHtml, chooseThemes, type FrontPageInput, oLevelGrade } from './front-page-html';
import { changedPartCount } from './front-page-build';
import type { Theme } from './paper-analysis';

const theme = (over: Partial<Theme> = {}): Theme => ({
  key: 'shape', title: 'Mensuration — volume, surface area, arcs and sectors',
  marks: 7, occasions: 3, papers: 1, live: true, latestMarks: 7,
  examples: [{ paperName: 'p', question: 'Q5', why: 'Volume of a half cylinder is ½πr²h.' }],
  ...over,
});

const base: FrontPageInput = {
  studentName: 'Eva Isabelle Wong', paperName: 'E-Maths TYS 2022 Paper 2',
  markedOn: '30 Aug 2026', awarded: 60, max: 90,
  themes: [theme()], worstQuestions: [{ question: 'Q5', lost: 7, max: 7 }],
};

// Every phrase the multi-paper version used. None may come back (Adrian, 2 Sep
// 2026: "just analyze that particular exam paper, not across 5 papers").
const HISTORY = /over \d+ papers|\d+ papers|marked papers|still doing|\bfixed\b|Not once|paper alone|first one you have had|bad day/;

describe('frontPageHtml', () => {
  it('leads with the score and the one thing worth their time', () => {
    const h = frontPageHtml(base);
    expect(h).toContain('60');
    expect(h).toContain('/90');
    expect(h).toContain('67%');
    expect(h).toContain('mensuration');       // lowercased topic, not the marker's category
    expect(h).toContain('cost you 7 marks on this paper');
  });

  it('never explains a multi-paper read — there is none', () => {
    const h = frontPageHtml(base);
    expect(h).not.toContain('class="why"');
    expect(h).not.toMatch(HISTORY);
  });

  it('reads the same whatever papersRead a caller still sends', () => {
    const one = frontPageHtml({ ...base, papersRead: 1 });
    const five = frontPageHtml({ ...base, papersRead: 5 });
    expect(one).toBe(five);
    expect(five).not.toMatch(HISTORY);
    expect(five).toContain('this paper');
  });

  it('tallies each theme as a plain loss — no "this paper" suffix (Adrian, 5 Sep 2026), never a run of papers', () => {
    const h = frontPageHtml({ ...base, themes: [theme({ marks: 5, papers: 4 })] });
    expect(h).toMatch(/&minus;5<\/b> marks<\/span>/);
    expect(h).not.toMatch(/marks &middot; this paper/);
    expect(h).not.toMatch(/4 papers/);
  });

  it('never prints a theme that is not live on this paper', () => {
    const h = frontPageHtml({ ...base, themes: [
      theme(), theme({ key: 'blank', title: 'Questions you left blank', live: false, marks: 37 }),
    ] });
    expect(h).not.toContain('Questions you left blank');
    expect(h).not.toContain('eased');
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

  it('draws each question bar as ABSOLUTE marks lost, scaled to the worst question (Adrian, 5 Sep 2026)', () => {
    const h = frontPageHtml({ ...base, worstQuestions: [
      { question: 'Q5', lost: 7, max: 7 }, { question: 'Q10', lost: 6, max: 8 }, { question: 'Q3', lost: 1, max: 4 },
    ] });
    expect(h).toContain('width:100%');   // 7 lost — the longest bar
    expect(h).toContain('width:86%');    // 6 of the worst 7, not 75% of its own 8
    expect(h).toContain('width:14%');    // 1 of 7 — a short bar, not 25% of 4
    expect(h).toMatch(/&minus;7<\/b> marks <span class="q-of">of 7/);
    expect(h).toMatch(/&minus;1<\/b> mark <span class="q-of">of 4/);
  });

  it('prints the topic beside each bar when the run carries one (Adrian, 3 Sep 2026: "say what topic Q9 is")', () => {
    const h = frontPageHtml({ ...base, worstQuestions: [
      { question: 'Q9', lost: 1, max: 5, topic: 'Differentiation' },
      { question: 'Q3', lost: 1, max: 5 },
    ] });
    expect(h).toContain('class="questions with-topics"');
    expect(h).toContain('<span class="q-topic">Differentiation</span>');
    // A row without a topic keeps the column so the bars still line up.
    expect(h).toContain('<span class="q-topic"></span>');
  });

  it('renders a run from before the topic field exactly as it did — no column, no class', () => {
    const h = frontPageHtml({ ...base, worstQuestions: [{ question: 'Q5', lost: 7, max: 7 }] });
    // The stylesheet names both; no element carries them.
    expect(h).not.toContain('class="questions with-topics"');
    expect(h).not.toContain('class="q-topic"');
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

  it('uses no emoji — the Chromium on Vercel has no emoji font', () => {
    expect(frontPageHtml(base)).not.toMatch(/\p{Extended_Pictographic}/u);
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

  it('prints at most three themes, biggest first, and only live ones', () => {
    const live = (n: number) => ({ ...base.themes[0], key: `l${n}`, title: `Live ${n}`, live: true, marks: 10 - n });
    const stale = { ...base.themes[0], key: 'blank', title: 'Questions you left blank', live: false, marks: 37 };
    const out = chooseThemes([live(1), live(2), live(3), live(4), live(5), stale]);
    expect(out.map(t => t.key)).toEqual(['l1', 'l2', 'l3']);
    expect(out.every(t => t.live)).toBe(true);
  });

  it('drops a live theme that cost nothing', () => {
    const out = chooseThemes([theme({ key: 'a', marks: 0 }), theme({ key: 'b', marks: 2 })]);
    expect(out.map(t => t.key)).toEqual(['b']);
  });

  // ── themes from the self-study sheet's diagnosis (Adrian, 2 Sep 2026: "the
  //    sheet's diagnosis should drive the cover, not the cover the sheet") ────

  const sheetThemes = (): Theme[] => [
    theme({ key: 'sheet-1', title: 'Master Finding Area Using Integration', marks: 6, tier: 'teach',
      questions: ['Q11(a)', 'Q20'], examples: [{ paperName: 'p', question: 'Q11(a)', why: 'Area under a curve is $\\int y\\,dx$.' }] }),
    theme({ key: 'sheet-2', title: 'Carrying A Constant Through A Derivative', marks: 4, tier: 'teach',
      questions: ['Q7'], examples: [{ paperName: 'p', question: 'Q7', why: 'The 2.4 survives.' }] }),
    theme({ key: 'sheet-3', title: 'Sign Slip When Dividing By A Negative', marks: 2, tier: 'show',
      questions: ['Q3'], examples: [{ paperName: 'p', question: 'Q3', why: 'Both terms flip.' }] }),
    theme({ key: 'sheet-4', title: 'Trigonometric Identities', marks: 3, tier: 'optional',
      questions: ['Q15(b)'], examples: [{ paperName: 'p', question: 'Q15(b)', why: 'If you have time.' }] }),
  ];

  it('keeps a show-tier slip out of the top three while there is something to learn', () => {
    const out = chooseThemes(sheetThemes());
    expect(out.map(t => t.key)).toEqual(['sheet-1', 'sheet-2', 'sheet-4']);
  });

  it('prints a show-tier slip only when the sheet has nothing else', () => {
    const only = sheetThemes().filter(t => t.tier === 'show');
    expect(chooseThemes(only).map(t => t.key)).toEqual(['sheet-3']);
  });

  it('prints the sheet’s sections in the sheet’s order, not by marks', () => {
    const h = frontPageHtml({ ...base, themes: sheetThemes(), themesSource: 'sheet' });
    const i1 = h.indexOf('Master Finding Area Using Integration');
    const i2 = h.indexOf('Carrying A Constant Through A Derivative');
    const i4 = h.indexOf('Trigonometric Identities');
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i4);
    expect(h).not.toContain('Sign Slip When Dividing By A Negative');
    expect(h).toContain('cost you 6 marks on this paper');
  });

  it('says the practice sheet follows the same order when the themes came from it', () => {
    const h = frontPageHtml({ ...base, themes: sheetThemes(), themesSource: 'sheet' });
    expect(h).toContain('works through these in the same order');
    expect(h).toContain('In the order your practice sheet takes them');
    expect(h).not.toContain('drills exactly that');
  });

  it('keeps the classifier wording when there is no diagnosis (the fallback)', () => {
    for (const src of [undefined, 'marker'] as const) {
      const h = frontPageHtml({ ...base, themesSource: src });
      expect(h).toContain('drills exactly that');
      expect(h).toContain('Ordered by what cost you most, with the marker');
      expect(h).not.toContain('same order');
    }
  });

  it('ties the closing line to every question the sheet named, not only the printed one', () => {
    const h = frontPageHtml({ ...base, themes: sheetThemes(), themesSource: 'sheet', worstQuestions: [
      { question: 'Q20', lost: 5, max: 6 }, { question: 'Q11', lost: 4, max: 8 },
    ] });
    expect(h).toContain('Start with <b>Q20</b> and <b>Q11</b>');
    expect(h).toContain('Both sit under <b>master finding area using integration</b> above');
  });
});

// ── "Marks lost" by kind of error (Adrian, 3 Sep 2026: "labelling errors like
//    arithmetic errors … beside the crosses … okay then build it") ───────────

import { errorKindTotals, emptyErrorKindTotals } from './error-kinds';

const labelled = () => {
  const t = emptyErrorKindTotals();
  t.byKind.concept = 7; t.byKind.misread = 2;
  t.byKind.arithmetic = 4; t.byKind.transfer = 2; t.byKind.sign = 1;
  t.byKind.incomplete = 3;
  t.concept = 9; t.careless = 7; t.incomplete = 3; t.lostTotal = 19;
  return t;
};

describe('frontPageHtml — marks lost by kind', () => {
  it('prints one compact row: the buckets, with the careless slips itemised', () => {
    const h = frontPageHtml({ ...base, errorKinds: labelled() });
    const row = h.slice(h.indexOf('<div class="kinds">'), h.indexOf('</div>', h.indexOf('<div class="kinds">')));
    const text = row.replace(/<[^>]+>/g, '').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();
    expect(text).toBe('Marks lost concept 9 (concept 7, misread 2) · careless 7 (arithmetic 4, copied wrongly 2, sign 1) · incomplete 3');
  });

  it('says the careless bucket the encouraging way — one short sub-line', () => {
    const h = frontPageHtml({ ...base, errorKinds: labelled() });
    expect(h).toContain('7 marks were careless slips &mdash; the method was right.');
    expect(h.match(/kinds-sub"/g)).toHaveLength(1);
  });

  it('gets the grammar right for a single careless mark', () => {
    const t = emptyErrorKindTotals();
    t.byKind.sign = 1; t.careless = 1; t.lostTotal = 1;
    expect(frontPageHtml({ ...base, errorKinds: t })).toContain('1 mark was a careless slip &mdash; the method was right.');
  });

  it('has no sub-line and no "concept" cell when only a method gap cost marks', () => {
    const t = emptyErrorKindTotals();
    t.byKind.concept = 5; t.concept = 5; t.lostTotal = 5;
    const h = frontPageHtml({ ...base, errorKinds: t });
    expect(h).toContain('<b>concept</b> 5');
    expect(h).not.toContain('(concept');          // no misread → no breakdown
    expect(h).not.toContain('careless');
    expect(h).not.toContain('class="kinds-sub"');
  });

  it('keeps the row honest about marks the marker left untagged', () => {
    const t = emptyErrorKindTotals();
    t.byKind.arithmetic = 2; t.careless = 2; t.unlabelled = 3; t.lostTotal = 5;
    expect(frontPageHtml({ ...base, errorKinds: t })).toContain('<b>other</b> 3');
  });

  it('sits under the score and above "What to work on"', () => {
    const h = frontPageHtml({ ...base, errorKinds: labelled() });
    const row = h.indexOf('<div class="kinds">');
    expect(row).toBeGreaterThan(h.indexOf('class="verdict"'));
    expect(row).toBeLessThan(h.indexOf('class="sec-work"'));
  });

  it('renders an unlabelled run BYTE-IDENTICAL to a run with no kinds at all', () => {
    // Older runs (and runs whose marker tagged nothing) must not gain a line, a
    // style, or a byte: the page they print today is the page they print tomorrow.
    const today = frontPageHtml(base);
    const untouched = emptyErrorKindTotals();
    untouched.unlabelled = 12; untouched.lostTotal = 12;
    expect(frontPageHtml({ ...base, errorKinds: untouched })).toBe(today);
    expect(frontPageHtml({ ...base, errorKinds: null })).toBe(today);
    expect(frontPageHtml({ ...base, errorKinds: emptyErrorKindTotals() })).toBe(today);
    expect(today).not.toContain('Marks lost');
    expect(today).not.toContain('kinds');
  });

  it('ignores the old free-text tags end to end — no row for a pre-contract run', () => {
    const results = [{ marking_output: { parts: [
      { label: '(a)', max: 3, awarded: 0, error_kind: 'arithmetic_slip' },
      { label: '(b)', max: 2, awarded: 1, error_type: 'wrong_setup' },
    ] } }];
    expect(frontPageHtml({ ...base, errorKinds: errorKindTotals(results) })).toBe(frontPageHtml(base));
  });

  it('uses student words, not the marker\'s codes', () => {
    const h = frontPageHtml({ ...base, errorKinds: labelled() });
    expect(h).toContain('copied wrongly 2');
    expect(h).not.toMatch(/\btransfer\b/);
  });

  it('still uses no emoji with the row in place', () => {
    expect(frontPageHtml({ ...base, errorKinds: labelled() })).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

// ── a score above the paper total (Adrian, 3 Sep 2026, Kassandra's 92/90 —
//    parts summed to 94 against a registry 90: "92 out of 90 is not possible …
//    build it") ─────────────────────────────────────────────────────────────

describe('frontPageHtml — a score above the paper total', () => {
  const over: FrontPageInput = { ...base, awarded: 92, max: 90 };

  it('prints "92 of 90" with a red check tag where the percentage was', () => {
    const h = frontPageHtml(over);
    expect(h).toContain('<div class="score">92<span class="of"> of 90</span></div>');
    expect(h).toContain('<div class="check-tag">needs a check</div>');
    expect(h).not.toContain('class="pct"');
    expect(h).not.toMatch(/>\d+%</);          // no percentage anywhere a student reads one
    expect(h).not.toContain('92/90');
    expect(h).not.toContain('/90<');
  });

  it('tells the student the pages are right and the total is not final', () => {
    const h = frontPageHtml(over);
    expect(h).toContain('<p class="verdict">The marks add up to more than this paper holds, so this score is being checked — the marked pages are right; the total is not final.</p>');
    expect(h).not.toContain('The one thing worth your time');
    expect(h).not.toContain('scattered rather than concentrated');
  });

  it('styles the tag in the verdict red — mono, uppercase, letter-spaced, at most .6rem', () => {
    const h = frontPageHtml(over);
    const css = h.slice(h.indexOf('.check-tag{'), h.indexOf('}', h.indexOf('.check-tag{')));
    expect(css).toContain('IBM Plex Mono');
    expect(css).toContain('color:var(--verdict)');
    expect(css).toContain('text-transform:uppercase');
    expect(css).toMatch(/letter-spacing:\.\d+em/);
    const size = Number(css.match(/font-size:(\.\d+)rem/)![1]);
    expect(size).toBeLessThanOrEqual(0.6);
  });

  it('changes the badge and the verdict line, and nothing else on the page', () => {
    const rest = (h: string) => h
      .replace(/<style>\n\.check-tag[\s\S]*?<\/style>/, '')
      .replace(/<div class="badge">[\s\S]*?<\/div><\/div>/, '')
      .replace(/<p class="verdict">[\s\S]*?<\/p>/, '');
    expect(rest(frontPageHtml(over))).toBe(rest(frontPageHtml(base)));
    expect(rest(frontPageHtml(over))).not.toBe('');
  });

  it('keeps the page on paper: one palette, no emoji', () => {
    const h = frontPageHtml(over);
    expect(h).not.toContain('prefers-color-scheme');
    expect(h).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('renders every normal score BYTE-IDENTICAL to today — no tag, no style, no "of"', () => {
    // Full marks is normal, zero is normal; only awarded > max is the case above.
    for (const [awarded, max] of [[60, 90], [90, 90], [0, 90], [100, 100]] as const) {
      const h = frontPageHtml({ ...base, awarded, max });
      expect(h).not.toContain('check-tag');
      expect(h).not.toContain('needs a check');
      expect(h).not.toContain('being checked');
      expect(h).not.toContain('<span class="of"> of');
      expect(h).toContain(`<div class="score">${awarded}<span class="of">/${max}</span></div>`);
      expect(h).toContain(`<div class="pct">${Math.round((awarded / max) * 100)}%</div>`);
      expect(h).toContain('The one thing worth your time');
    }
  });

  it('is identical whether the over-count arrives with or without the kinds row', () => {
    // The two opt-in blocks must not interfere: each carries its own style.
    const h = frontPageHtml({ ...over, errorKinds: labelled() });
    expect(h).toContain('<div class="check-tag">needs a check</div>');
    expect(h).toContain('<div class="kinds">');
    expect(h.match(/\.check-tag\{/g)).toHaveLength(1);
  });
});

// Adrian, 10 Sep 2026: when every lost mark went to a slip inside a right
// method there is no "one thing worth your time" — the cover says so and keeps
// the marks-lost magnitude on its own row.
describe('a cover with only slips on it', () => {
  it('leads with "your method was right" instead of naming a theme, and still lists the theme', () => {
    const slip = theme({ marks: 6, title: 'Differentiating A Cubic', tier: 'show' });
    const h = frontPageHtml({ ...base, themes: [slip], themesSource: 'sheet' });
    expect(h).toMatch(/method was right on every question/);
    expect(h).not.toMatch(/one thing worth your time/);
    expect(h).toMatch(/Differentiating A Cubic/);
  });

  it('a teach theme beside the slip still takes the lead', () => {
    const h = frontPageHtml({ ...base, themes: [
      theme({ marks: 6, title: 'Differentiating A Cubic', tier: 'show' }),
      theme({ marks: 2, title: 'Reading The Angle', tier: 'teach', key: 't2' }),
    ], themesSource: 'sheet' });
    expect(h).toMatch(/one thing worth your time is <strong>reading the angle/);
  });
});

// ── the careless slips carry the score they cost (Adrian, 10 Sep 2026) ────────
describe('frontPageHtml — careless slips and the grade they cost', () => {
  it('a small share keeps the one-line form, with the score without them', () => {
    const t = emptyErrorKindTotals();
    t.byKind.concept = 7; t.byKind.misread = 4; t.byKind.arithmetic = 2; t.byKind.transfer = 1; t.byKind.sign = 1;
    t.concept = 11; t.careless = 4; t.lostTotal = 23;
    const h = frontPageHtml({ ...base, awarded: 67, max: 90, errorKinds: t });
    expect(h).toContain('4 marks were careless slips &mdash; the method was right. Without them: <b>71/90</b> (79%).');
    expect(h).not.toContain('class="kinds-big');
  });
  it('a third or more of the marks lost becomes the highlighted box with the grade move', () => {
    const t = emptyErrorKindTotals();
    t.byKind.concept = 2; t.byKind.arithmetic = 3; t.byKind.transfer = 2; t.byKind.sign = 1;
    t.concept = 2; t.careless = 6; t.lostTotal = 8;
    const h = frontPageHtml({ ...base, paperName: 'isabelle TYS AM 2025 P1', awarded: 73, max: 90, errorKinds: t });
    expect(h).toContain('class="kinds-big kinds-sub"');
    expect(h).toContain('Careless slips');
    expect(h).toContain('6 marks were careless slips &mdash; the method was right. That is 6 of the 8 marks you lost (75%) &mdash; arithmetic 3, copied wrongly 2, sign 1. Without them: <b>79/90</b> (88%) &mdash; from A1 to <b>A1</b>'.replace(' &mdash; from A1 to <b>A1</b>', ' &mdash; still A1, but every one of those marks is yours to keep.'));
    expect(h).toContain('Avoiding those alone lifts the grade.');
    expect(h.match(/kinds-sub"/g)).toHaveLength(1);
  });
  it('names the band it moves to, and leaves the band off a JC paper', () => {
    const t = emptyErrorKindTotals();
    t.byKind.arithmetic = 4; t.byKind.sign = 1; t.careless = 5; t.byKind.concept = 3; t.concept = 3; t.lostTotal = 8;
    const o = frontPageHtml({ ...base, paperName: 'em tys 2025 p1', awarded: 61, max: 90, errorKinds: t });
    expect(o).toContain('Without them: <b>66/90</b> (73%) &mdash; from B3 to <b>A2</b>.');
    const jc = frontPageHtml({ ...base, paperName: 'JC2 H2 Math Prelim P1', awarded: 61, max: 90, errorKinds: t });
    expect(jc).toContain('Without them: <b>66/90</b> (73%).');
    expect(jc).not.toContain('from B3');
  });
  it('oLevelGrade bands', () => {
    expect([80, 72, 66, 60, 57, 52, 47, 41, 30].map(oLevelGrade)).toEqual(['A1', 'A2', 'B3', 'B4', 'C5', 'C6', 'D7', 'E8', 'F9']);
  });
});

// ── a re-marked paper wears the badge and says the changes are in purple (10 Sep 2026) ──
describe('frontPageHtml — REMARKED', () => {
  it('badge + line with the pages and the date; the whole paper when no pages; nothing when not re-marked', () => {
    const one = frontPageHtml({ ...base, remarked: { pages: [3], at: '2026-09-10T05:00:00Z' } });
    expect(one).toContain('class="remark-badge">Remarked</span>');
    expect(one).toContain('Re-marked on 10 Sep 2026: page 3. What changed since the last marking is in <b>purple</b>.');
    const whole = frontPageHtml({ ...base, remarked: { pages: null, at: null } });
    expect(whole).toContain('Re-marked: the whole paper.');
    const many = frontPageHtml({ ...base, remarked: { pages: [7, 3], at: 'junk' } });
    expect(many).toContain('Re-marked: pages 3, 7.');
    expect(frontPageHtml({ ...base })).not.toContain('remark-badge');
  });
  it('a re-mark that moved no mark says so instead of promising purple ink', () => {
    const same = frontPageHtml({ ...base, remarked: { pages: [1], at: '2026-09-10T12:00:00Z', changed: 0 } });
    expect(same).toContain('Re-marked on 10 Sep 2026: page 1. No marks changed — the page was marked again and the notes redrawn.');
    expect(same).not.toContain('purple');
    const moved = frontPageHtml({ ...base, remarked: { pages: [1], at: '2026-09-10T12:00:00Z', changed: 2 } });
    expect(moved).toContain('in <b>purple</b>');
    const unknown = frontPageHtml({ ...base, remarked: { pages: [1], at: null, changed: null } });
    expect(unknown).toContain('in <b>purple</b>');
  });
});

describe('changedPartCount', () => {
  const row = (q: string, parts: Array<[string, number]>, extra: Record<string, unknown> = {}) =>
    ({ question_number: q, marking: { parts: parts.map(([label, awarded]) => ({ label, awarded })) }, ...extra });
  it('counts parts whose awarded mark moved, appeared or vanished; ignores rows the audit added', () => {
    const prev = [row('1', [['', 3]]), row('2', [['', 3]]), row('3', [['(a)(i)', 1], ['(a)(ii)', 2]])];
    const same = [row('1', [['', 3]]), row('2', [['', 3]]), row('3', [['(a)(i)', 1], ['(a)(ii)', 2]]), row('12', [['', 0]], { added_by_audit: true })];
    expect(changedPartCount(prev, same)).toBe(0);
    const moved = [row('1', [['', 3]]), row('2', [['', 4]]), row('3', [['(a)(i)', 1]])];
    expect(changedPartCount(prev, moved)).toBe(2);
    expect(changedPartCount(null, same)).toBeNull();
    expect(changedPartCount(prev, 'junk')).toBeNull();
  });
});
