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
