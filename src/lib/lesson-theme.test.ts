import { describe, it, expect } from 'vitest';
import { THEME_TOKENS, DEFAULT_THEME, normalizeTheme, themeCssVars, needsHandFont, HAND_FONT_HREF, contrastRatio, relativeLuminance } from './lesson-theme';
import { LESSON_THEMES } from './lesson-script';

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
    expect(s.handScale).toBe(1);
    expect(s.texture).toBe('none');
    expect(needsHandFont('slide')).toBe(false);
  });

  it('chalk is a dark board with light ink; paper a light ground with dark ink — both legible', () => {
    const c = THEME_TOKENS.chalk;
    expect(relativeLuminance(c.board)).toBeLessThan(0.05);
    expect(relativeLuminance(c.ink)).toBeGreaterThan(0.8);
    expect(contrastRatio(c.ink, c.board)).toBeGreaterThan(12);
    expect(contrastRatio(c.ink2, c.board)).toBeGreaterThan(9);
    expect(contrastRatio(c.pen, c.board)).toBeGreaterThan(7);
    const p = THEME_TOKENS.paper;
    expect(relativeLuminance(p.board)).toBeGreaterThan(0.9);
    expect(contrastRatio(p.ink, p.board)).toBeGreaterThan(12);
    expect(contrastRatio(p.ink2, p.board)).toBeGreaterThan(7);
    // the handwriting face, larger to match the sans at the same px
    for (const t of ['chalk', 'paper'] as const) {
      expect(THEME_TOKENS[t].hand).toMatch(/Caveat/);
      expect(THEME_TOKENS[t].handScale).toBeGreaterThan(1.1);
      expect(needsHandFont(t)).toBe(true);
    }
    expect(HAND_FONT_HREF).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Caveat/);
  });

  it('textures are CSS-only (no external image files)', () => {
    for (const t of LESSON_THEMES) {
      const tex = THEME_TOKENS[t].texture;
      expect(tex).not.toMatch(/url\(\s*["']?https?:/); // only data: URIs and in-SVG #refs
      expect(tex).not.toMatch(/\.(png|jpe?g|webp)/);
    }
    expect(THEME_TOKENS.chalk.texture).toMatch(/feTurbulence/);
    expect(THEME_TOKENS.paper.texture).toMatch(/repeating-linear-gradient/);
  });

  it('themeCssVars emits one --lsn-* property per token, for every theme', () => {
    for (const t of LESSON_THEMES) {
      const vars = themeCssVars(t);
      for (const k of ['--lsn-board', '--lsn-ink', '--lsn-ink-2', '--lsn-muted', '--lsn-pen', '--lsn-pen-soft', '--lsn-hand', '--lsn-hand-scale', '--lsn-grid', '--lsn-axis', '--lsn-curve', '--lsn-ghost', '--lsn-well', '--lsn-ribbon', '--lsn-ribbon-lit', '--lsn-hl-amber', '--lsn-chip-emerald-text']) {
        expect(vars[k], `${t} ${k}`).toBeTruthy();
      }
      for (const k of Object.keys(vars)) expect(k.startsWith('--lsn-')).toBe(true);
    }
    expect(themeCssVars('slide')['--lsn-hand']).toBe('inherit');
    expect(themeCssVars('chalk')['--lsn-hand-scale']).toBe('1.28');
  });

  it('contrastRatio reads hex, rgb and hsl', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
    expect(contrastRatio('rgb(255, 255, 255)', 'hsl(0, 0%, 0%)')).toBeCloseTo(21, 1);
    expect(() => relativeLuminance('chalk')).toThrow();
  });
});
