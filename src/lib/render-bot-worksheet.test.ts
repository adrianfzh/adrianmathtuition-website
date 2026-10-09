import { describe, it, expect } from 'vitest';
import { buildBotWorksheetHTML, tinosInlineStyle, type BotWorksheetInput } from './render-bot-worksheet';

const base: BotWorksheetInput = {
  title: 'Selected Questions',
  levelLabel: 'A Math',
  topic: 'Binomial Theorem',
  tier: null,
  dateLabel: '26 Aug 2026',
  answers: false,
  questions: [
    { id: 'q1', markdown: 'Expand $(1+x)^5$.', marks: 3, figureUrl: null, imageUrls: [], answer: '—' },
    { id: 'q2', markdown: 'Find the term independent of $x$.', marks: 4, figureUrl: null, imageUrls: [], answer: '—' },
  ],
};

describe('buildBotWorksheetHTML workspace option', () => {
  it('renders marks-proportional working space by default', () => {
    const html = buildBotWorksheetHTML(base);
    expect(html).toContain('ws-answer-space" style=');
    expect(html).not.toContain('class="ws-compact"');
  });

  it('workspace:false renders a compact list — no working-space divs, ws-compact on body', () => {
    const html = buildBotWorksheetHTML({ ...base, workspace: false });
    expect(html).not.toContain('ws-answer-space" style=');
    expect(html).toContain('class="ws-compact"');
  });

  it('workspace:false still keeps the questions and answers page wiring', () => {
    const html = buildBotWorksheetHTML({ ...base, workspace: false, answers: true });
    expect(html).toContain('Expand $(1+x)^5$');
    expect(html).toContain('ws-answers');
  });

  it('touches no CDN: Tinos and KaTeX are inlined, auto-render stamps __katexDone', () => {
    const html = buildBotWorksheetHTML(base);
    expect(html).not.toContain('jsdelivr');
    expect(html).not.toContain('googleapis');
    expect(html).toContain('@font-face{font-family:Tinos;font-style:normal;font-weight:400');
    expect(html).toContain('@font-face{font-family:Tinos;font-style:italic;font-weight:700');
    expect(html).toContain('window.__katexDone = true');
    expect(tinosInlineStyle().length).toBeGreaterThan(80_000);
  });
});

// One stylesheet for every door, measured against the create-worksheet house
// file (worksheet_lib.py) and the picker's Word builder (9 Oct 2026).
describe('buildBotWorksheetHTML — the house layout', () => {
  const sheet: BotWorksheetInput = {
    ...base,
    questions: [
      { id: 'q1', markdown: 'A plane $\\pi_1$.\n\n**(i)** Find a normal. [2]\n\n**(ii)** Find the angle. [2]', marks: 4, figureUrl: null, imageUrls: [], answer: '(i) $x$; (ii) $49.2°$' },
      { id: 'q2', markdown: '**(a)** Differentiate. [2]\n\n**(b)** The diagram shows the curve.\n\n**(b)(i)** Write down $N$. [1]\n\n**(b)(ii)** Find the area. [3]', marks: 6, figureUrl: 'https://x/fig.png', imageUrls: [], answer: '—' },
      { id: 'q3', markdown: 'Find $\\alpha$.', marks: 5, figureUrl: null, imageUrls: [], answer: '$\\alpha = 4$' },
      { id: 'q4', markdown: 'Kiosk flattening.\n\n**(a)** Go <span class="ws-mk">[3]</span>\n\n<div class="ws-sp" style="height:36mm"></div>', marks: 3, figureUrl: null, imageUrls: [], answer: '7' },
    ],
  };
  const html = buildBotWorksheetHTML({ ...sheet, plain: { subtitle: 'JC2 / Sec 4 A Math' }, answersInline: true });

  it('regular title block only: 12 pt navy title, 10 pt italic subtitle, no masthead, name bar or footer', () => {
    expect(html).toContain('<div class="ws-title">Selected Questions</div>');
    expect(html).toContain('<div class="ws-sub">JC2 / Sec 4 A Math</div>');
    expect(html).toMatch(/\.ws-title\{[^}]*font-size:12pt/);
    expect(html).toMatch(/\.ws-sub\{[^}]*font-style:italic;font-size:10pt/);
    for (const gone of ['ws-brand', 'ws-namebar', 'ws-footer', 'ws-header', 'ws-topic']) expect(html).not.toContain(gone);
  });
  it('page and body: A4 with 20 / 25 / 10 / 25 mm margins, 9.5 pt at 1.5 lines', () => {
    expect(html).toContain('@page{size:A4;margin:20mm 25mm 10mm 25mm}');
    expect(html).toMatch(/body\{[^}]*font-size:9\.5pt;line-height:1\.5/);
  });
  it('"1." at the margin with its text at 1.0 cm; parts at 1.0 / 2.0 cm; a sub-part one tab further showing only "(i)"', () => {
    expect(html).toMatch(/\.ws-questions\{[^}]*padding-left:10mm/);
    expect(html).toMatch(/\.ws-qnum\{display:inline-block;width:10mm;margin-left:-10mm\}/);
    expect(html).toContain('<p><span class="ws-qnum">1.</span>A plane');                    // the number shares the first line
    expect(html).toContain('<p class="ws-qline"><span class="ws-qnum">2.</span></p><img');  // a figure-first question: bare number line
    const stemless = buildBotWorksheetHTML({ ...base, questions: [{ id: 's', markdown: '**(a)** Simplify. [1]', marks: 1, figureUrl: null, imageUrls: [], answer: '—' }] });
    expect(stemless).toContain('<p class="ws-part ws-d0"><span class="ws-qnum">1.</span><span class="ws-pnum">(a)</span>Simplify.');
    expect(html).toContain('<p class="ws-part ws-d0"><span class="ws-pnum">(i)</span>Find a normal.');
    expect(html).toContain('<p class="ws-part ws-d1"><span class="ws-pnum">(i)</span>Write down');
    expect(html).toContain('<p class="ws-part ws-d1"><span class="ws-pnum">(ii)</span>Find the area.');
    expect(html).toMatch(/\.ws-part\.ws-d1\{padding-left:20mm\}/);
  });
  it('marks "[n]" float right, 5 mm inside the right margin, and the marked line stops 14 mm short', () => {
    expect(html).toContain('Find a normal. <span class="ws-mk">[2]</span></p>');
    expect(html).toContain('Find $\\alpha$.<span class="ws-mk">[5]</span></p>');   // stem-only: the total, bare "[5]"
    expect(html).not.toContain('marks]');
    expect(html).toMatch(/\.ws-mk\{float:right;[^}]*margin-right:-9mm\}/);
    expect(html).toContain('.ws-q-body p:has(> .ws-mk){padding-right:14mm}');
  });
  it('working space is 4 blank lines a mark (5 for a [1]) at 14.25 pt a line, under each part or under a stem-only question', () => {
    expect(html).toContain('<span class="ws-mk">[2]</span></p><div class="ws-answer-space" style="height:114pt"></div>');
    expect(html).toContain('<span class="ws-mk">[1]</span></p><div class="ws-answer-space" style="height:71.25pt"></div>');
    expect(html).toMatch(/<span class="ws-mk">\[5\]<\/span><\/p><\/div>\s*<div class="ws-keep"><div class="ws-answer-space" style="height:285pt"><\/div>/);
    // the kiosk's own span + mm spacer are read the same way
    expect(html).toContain('Go <span class="ws-mk">[3]</span></p><div class="ws-answer-space" style="height:171pt"></div>');
    expect(html).not.toContain('class="ws-sp"');
  });
  it('figures at most 10.5 x 8 cm, centred, 4 pt above and below', () => {
    expect(html).toMatch(/\.ws-figure,\.ws-q-body img\{[^}]*max-width:105mm;max-height:80mm;margin:4pt auto\}/);
  });
  it('ONE orange right-aligned [Ans: …] line per question; a "—" answer prints none', () => {
    expect(html).toContain('<div class="ws-ans">[Ans: (i) $x$; (ii) $49.2°$]</div>');
    expect(html).toContain('<div class="ws-ans">[Ans: $\\alpha = 4$]</div>');
    expect((html.match(/class="ws-ans"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('<section class="ws-answers">');
  });
  it('a part and its space are one block, the [Ans:] line rides in the last block, a stem-only question keeps its space and answer together', () => {
    expect(html).toMatch(/<div class="ws-keep"><p class="ws-part ws-d0"><span class="ws-pnum">\(i\)<\/span>Find a normal\. <span class="ws-mk">\[2\]<\/span><\/p><div class="ws-answer-space" style="height:114pt"><\/div><\/div><!--keep-->/);
    expect(html).toMatch(/<div class="ws-answer-space" style="height:114pt"><\/div><div class="ws-ans">\[Ans: \(i\) \$x\$; \(ii\) \$49\.2°\$\]<\/div><\/div><!--keep-->/);
    expect(html).toMatch(/<div class="ws-keep"><div class="ws-answer-space" style="height:285pt"><\/div><div class="ws-ans">\[Ans: \$\\alpha = 4\$\]<\/div><\/div>/);
    expect(html).toContain('.ws-keep{break-inside:avoid}');
  });
  it('with working space every later question starts on a fresh page; compact sheets flow', () => {
    expect(html).toContain('body:not(.ws-compact) .ws-q + .ws-q{break-before:page;page-break-before:always}');
    expect(html).toContain('<body class="">');
    expect(buildBotWorksheetHTML({ ...sheet, workspace: false })).toContain('<body class="ws-compact">');
  });
  it('a bank-made sheet (no plain option) builds its subtitle from level · topic · tier · date · marks and keeps the Answers page', () => {
    const h = buildBotWorksheetHTML({ ...sheet, tier: 'standard', answers: true });
    expect(h).toContain('<div class="ws-sub">A Math · Binomial Theorem · Standard · 26 Aug 2026 · 18 marks</div>');
    expect(h).toContain('<section class="ws-answers">');
    expect(h).not.toContain('class="ws-ans"');
  });
});

describe('the brand header switch (lib/render-brand-masthead)', () => {
  const am = { ...base, topic: 'Binomial Theorem' };
  it('absent = the regular sheet, the same HTML as before', () => {
    expect(buildBotWorksheetHTML({ ...am, brand: undefined })).toBe(buildBotWorksheetHTML(am));
    expect(buildBotWorksheetHTML(am)).toContain('<div class="ws-title">');
    expect(buildBotWorksheetHTML(am)).not.toContain('class="bm"');
  });
  it('colour: the masthead replaces the title block; PRACTICE · n · marks, Name / Date, the series block and the page margins for the footer', () => {
    const html = buildBotWorksheetHTML({ ...am, brand: { mode: 'colour', level: 'AM' } });
    expect(html).not.toContain('<div class="ws-title">');
    expect(html).toContain('<table class="bm">');
    expect(html).toContain('<div class="bm-tag">A MATH</div>');
    expect(html).toContain('<div class="bm-small">SEC 4</div>');
    expect(html).toContain('Sec 4 Additional Mathematics');
    expect(html).toContain('<div class="bm-topic">Binomial Theorem</div>');
    expect(html).toMatch(/<b>PRACTICE<\/b>&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;2 questions&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;7 marks/);
    expect(html).toContain('Name <span>______');
    expect(html).toContain('.bm td{padding:8.5pt 0;vertical-align:middle;border:none;background:#1B2A4A;}');   // the navy band
    expect(html).toContain('.bm td.bm-block{text-align:center;background:#E08A3A;}');                                                  // the orange block
    expect(html).toContain('@page{margin:24mm 25mm 17mm 25mm}');
    expect(html).toContain('@page :first{margin-top:20mm}');
    expect(html).toContain('font-family:Gelasio,Georgia,serif;font-size:19pt');
    expect(html).toContain('font-family:Arimo;font-style:normal;font-weight:700');
    expect(html).toMatch(/<img src="data:image\/png;base64,/);
    expect(html).toContain('.ws-ans{text-align:right;color:#843C0C;clear:both}');
  });
  it('black and white: no fill, the outline logo, [Ans:] drained to 404040; JC has the left bar', () => {
    const html = buildBotWorksheetHTML({ ...am, brand: { mode: 'mono', level: 'JC' } });
    expect(html).toContain('.ws-ans{text-align:right;color:#404040;clear:both}');
    expect(html).not.toMatch(/background:#(?!FFFFFF|F2F2F2)[0-9A-F]{6}/);
    expect(html).toContain('border-left:4.5pt solid #1A1A1A');
    expect(html).toContain('<div class="bm-tag">JC H2</div>');
    expect(html).toContain('border-left:3pt solid #1A1A1A');   // the box's heavy left rule
  });
  it('a level with no design prints the regular format', () => {
    expect(buildBotWorksheetHTML({ ...am, brand: { mode: 'colour', level: 'IB' } })).toBe(buildBotWorksheetHTML(am));
  });
});
