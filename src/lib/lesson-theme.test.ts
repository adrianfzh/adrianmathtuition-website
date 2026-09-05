import { describe, it, expect } from 'vitest';
import {
  THEME_TOKENS, DEFAULT_THEME, normalizeTheme, themeCssVars, needsHandFont, contrastRatio, relativeLuminance,
  HAND_FONT_FACES, HAND_FONT_URL, TITLE_FONT_URL, HAND_FONT_FAMILY, TITLE_FONT_FAMILY,
} from './lesson-theme';
import { LESSON_THEMES } from './lesson-script';

/** How many comma-separated layers a CSS list has (commas inside url()/gradient() don't count). */
function topLevelCommas(css: string): number {
  let depth = 0, n = 1;
  for (const ch of css) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) n++;
  }
  return n;
}

describe('lesson themes', () => {
  it('has tokens for every theme the schema admits, slide by default', () => {
    for (const t of LESSON_THEMES) expect(THEME_TOKENS[t]).toBeDefined();
    expect(DEFAULT_THEME).toBe('slide');
    expect(normalizeTheme(undefined)).toBe('slide');
    expect(normalizeTheme('chalk')).toBe('chalk');
    expect(normalizeTheme('paper')).toBe('paper');
    expect(normalizeTheme('neon')).toBe('slide');
  });

  it("slide's tokens ARE the values the player always used (an unthemed script renders as before)", () => {
    const s = THEME_TOKENS.slide;
    expect(s.board).toBe('#ffffff');
    expect(s.ink).toBe('hsl(220, 60%, 20%)');      // text-navy
    expect(s.pen).toBe('hsl(40, 85%, 52%)');       // the cursor's amber sweep
    expect(s.grid).toBe('#e2e8f0');                // gridline stroke
    expect(s.axis).toBe('#94a3b8');
    expect(s.curve).toBe('hsl(220, 60%, 20%)');
    expect(s.ghost).toBe('#cbd5e1');
    expect(s.hl).toEqual({ amber: '#fef3c7', sky: '#e0f2fe', rose: '#ffe4e6', emerald: '#d1fae5' });
    expect(s.hand).toBe('inherit');
    expect(s.title).toBe('inherit');
    expect(s.handScale).toBe(1);
    expect(s.mathScale).toBe(1);
    expect(s.texture).toBe('none');
    expect(needsHandFont('slide')).toBe(false);
    // Marks were one amber before per-kind chalk colours existed.
    expect(new Set(Object.values(s.mark))).toEqual(new Set([s.pen]));
  });

  it('chalk is a dark board with light ink; paper a light ground with dark ink — both legible', () => {
    const c = THEME_TOKENS.chalk;
    // The slate is a RADIAL: the guards run against its lightest point, which
    // is the hardest ground the chalk has to read on (measured 9.2 : 1 — the
    // near-black board this replaced managed 12 : 1 and looked like a void:
    // 8.0 : 1 on the lit centre, 10.1 : 1 at the frame.
    expect(relativeLuminance(c.board)).toBeLessThan(0.05);
    expect(relativeLuminance(c.boardLit)).toBeLessThan(0.07);
    expect(relativeLuminance(c.ink)).toBeGreaterThan(0.8);
    expect(contrastRatio(c.ink, c.boardLit)).toBeGreaterThan(7.5);   // AAA body text
    expect(contrastRatio(c.ink2, c.boardLit)).toBeGreaterThan(7);
    expect(contrastRatio(c.pen, c.boardLit)).toBeGreaterThan(7);
    expect(contrastRatio(c.muted, c.boardLit)).toBeGreaterThan(4.5); // AA, and quiet on purpose
    // Every chalk stick has to read on the lightest part of the board too.
    for (const tone of Object.values(c.hl)) expect(contrastRatio(tone, c.boardLit)).toBeGreaterThan(5.5);
    for (const kind of Object.values(c.mark)) expect(contrastRatio(kind, c.boardLit)).toBeGreaterThan(5.5);
    const p = THEME_TOKENS.paper;
    expect(relativeLuminance(p.board)).toBeGreaterThan(0.9);
    expect(contrastRatio(p.ink, p.board)).toBeGreaterThan(12);
    expect(contrastRatio(p.ink2, p.board)).toBeGreaterThan(7);
    // Kalam is the WRITTEN face: prose at 24 px on a 15 px base (1.6×), with
    // typeset maths pulled back up so it does not read small beside it.
    for (const t of ['chalk', 'paper'] as const) {
      expect(THEME_TOKENS[t].hand).toMatch(/Kalam/);
      expect(THEME_TOKENS[t].title).toMatch(/Permanent Marker/);
      expect(THEME_TOKENS[t].handScale).toBeGreaterThan(1.4);
      expect(THEME_TOKENS[t].mathScale).toBeGreaterThan(1.1);
      expect(needsHandFont(t)).toBe(true);
    }
    expect(THEME_TOKENS.chalk.handScale * 15).toBeCloseTo(24, 5);
  });

  it('the handwriting faces are self-hosted subsets (the writer reads the face the CSS laid out)', () => {
    for (const url of [HAND_FONT_URL, TITLE_FONT_URL]) {
      expect(url).toMatch(/^\/lessons\/fonts\/.+\.woff$/);        // same origin, one file each
      expect(HAND_FONT_FACES).toContain(url);
    }
    expect(HAND_FONT_FACES).not.toMatch(/https?:/);                // no third-party stylesheet
    expect(HAND_FONT_FACES).toContain(`font-family: '${HAND_FONT_FAMILY}'`);
    expect(HAND_FONT_FACES).toContain(`font-family: '${TITLE_FONT_FAMILY}'`);
    expect(THEME_TOKENS.chalk.hand).toContain(`'${HAND_FONT_FAMILY}'`);
  });

  it('textures are CSS-only (no external image files)', () => {
    for (const t of LESSON_THEMES) {
      const tex = THEME_TOKENS[t].texture;
      expect(tex).not.toMatch(/url\(\s*["']?https?:/); // only data: URIs and in-SVG #refs
      expect(tex).not.toMatch(/\.(png|jpe?g|webp)/);
      // background-image / -blend-mode / -size must describe the SAME stack.
      const layers = topLevelCommas(THEME_TOKENS[t].texture);
      expect(topLevelCommas(THEME_TOKENS[t].textureBlend), `${t} blend layers`).toBe(layers);
      expect(topLevelCommas(THEME_TOKENS[t].textureSize), `${t} size layers`).toBe(layers);
    }
    expect(THEME_TOKENS.chalk.texture).toMatch(/feTurbulence/);
    expect(THEME_TOKENS.chalk.textureBlend).toContain('overlay');   // the probe's grain pass
    expect(THEME_TOKENS.paper.texture).toMatch(/repeating-linear-gradient/);
  });

  it('themeCssVars emits one --lsn-* property per token, for every theme', () => {
    for (const t of LESSON_THEMES) {
      const vars = themeCssVars(t);
      for (const k of ['--lsn-board', '--lsn-board-lit', '--lsn-ink', '--lsn-ink-2', '--lsn-muted', '--lsn-pen', '--lsn-pen-soft', '--lsn-hand', '--lsn-title', '--lsn-hand-scale', '--lsn-math-scale', '--lsn-tip', '--lsn-grid', '--lsn-axis', '--lsn-curve', '--lsn-ghost', '--lsn-well', '--lsn-ribbon', '--lsn-ribbon-lit', '--lsn-hl-amber', '--lsn-mark-underline', '--lsn-mark-circle', '--lsn-mark-box', '--lsn-chip-emerald-text']) {
        expect(vars[k], `${t} ${k}`).toBeTruthy();
      }
      for (const k of Object.keys(vars)) expect(k.startsWith('--lsn-')).toBe(true);
    }
    expect(themeCssVars('slide')['--lsn-hand']).toBe('inherit');
    expect(themeCssVars('chalk')['--lsn-hand-scale']).toBe('1.6');
    expect(themeCssVars('chalk')['--lsn-mark-box']).toBe(THEME_TOKENS.chalk.mark.box);
  });

  it('contrastRatio reads hex, rgb and hsl', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
    expect(contrastRatio('rgb(255, 255, 255)', 'hsl(0, 0%, 0%)')).toBeCloseTo(21, 1);
    expect(() => relativeLuminance('chalk')).toThrow();
  });
});
