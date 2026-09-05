import { describe, it, expect } from 'vitest';
import {
  THEME_TOKENS, DEFAULT_THEME, TIP_STYLES, normalizeTheme, themeCssVars, needsHandFont, contrastRatio, relativeLuminance,
  fluidPx, fluidPxAt, FLUID_MIN_VW, FLUID_MAX_VW,
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
    // The slide's pen dot predates the board themes and is part of its draw-on.
    expect(s.tip).toBe('stick');
    expect(s.tipColor).toBe('hsl(40, 85%, 52%)');
    // Marks were one amber before per-kind chalk colours existed.
    expect(new Set(Object.values(s.mark))).toEqual(new Set([s.pen]));
  });

  it('chalk is a dark board with light ink; paper a light ground with dark ink — both legible', () => {
    const c = THEME_TOKENS.chalk;
    // The slate is a RADIAL: the guards run against its LIGHTEST point, which
    // is the hardest ground the chalk has to read on. The 2026-09-06 re-cut
    // darkened and evened the base (#3d4c45 → #313d38 at its lightest) and
    // whitened the chalk (#f3f1e6 → #fbfaf3), so body ink now measures
    // 10.8 : 1 there instead of 8.0 : 1 — the halo that used to fake
    // brightness is gone, so the colour has to carry it.
    expect(relativeLuminance(c.board)).toBeLessThan(0.04);
    expect(relativeLuminance(c.boardLit)).toBeLessThan(0.05);
    expect(relativeLuminance(c.ink)).toBeGreaterThan(0.85);
    expect(contrastRatio(c.ink, c.boardLit)).toBeGreaterThan(10);    // the brief's ≥ 7 : 1, with room
    expect(contrastRatio(c.ink2, c.boardLit)).toBeGreaterThan(9);
    expect(contrastRatio(c.pen, c.boardLit)).toBeGreaterThan(8);
    expect(contrastRatio(c.muted, c.boardLit)).toBeGreaterThan(6);
    expect(contrastRatio(c.heading, c.boardLit)).toBeGreaterThan(7);
    // Every chalk stick has to read on the lightest part of the board too, and
    // VIVIDLY — no bloom is drawn round them any more.
    for (const tone of Object.values(c.hl)) expect(contrastRatio(tone, c.boardLit)).toBeGreaterThan(7);
    for (const kind of Object.values(c.mark)) expect(contrastRatio(kind, c.boardLit)).toBeGreaterThan(7);
    // The board is EVEN: lit centre to frame is a whisper, not a tunnel.
    expect(relativeLuminance(c.boardLit) - relativeLuminance(c.board)).toBeLessThan(0.02);
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

  it('no pen by default — the ink appearing is the cue (Adrian, 2026-09-06)', () => {
    expect(THEME_TOKENS.chalk.tip).toBe('none');
    expect(THEME_TOKENS.paper.tip).toBe('none');
    for (const t of LESSON_THEMES) expect(TIP_STYLES).toContain(THEME_TOKENS[t].tip);
    // The stick's colour survives for the themes that choose to draw one.
    for (const t of LESSON_THEMES) expect(THEME_TOKENS[t].tipColor).toMatch(/^(#|rgb|hsl)/);
    expect(themeCssVars('chalk')['--lsn-tip-style']).toBe('none');
    expect(themeCssVars('slide')['--lsn-tip-style']).toBe('stick');
  });

  it('prose is fluid: ~20 px Kalam on a 390 px phone, 24 px on a full-width board', () => {
    // 24 px measured ~22 characters a line at 390 px and ran off the slate.
    expect(fluidPxAt(24, 390)).toBeCloseTo(20.4, 2);
    expect(fluidPxAt(24, FLUID_MAX_VW)).toBeCloseTo(24, 2);
    expect(fluidPxAt(24, 1280)).toBeCloseTo(24, 2);        // clamped: the card stops at max-w-lg
    expect(fluidPxAt(24, 320)).toBeCloseTo(20.4, 2);       // clamped the other way
    expect(fluidPxAt(24, 455)).toBeCloseTo(22.2, 1);       // linear in between
    // The CSS the helper emits is one clamp() that agrees with the arithmetic.
    const css = fluidPx(24);
    expect(css).toMatch(/^clamp\(20\.4px, calc\(9\.6px \+ 2\.7692vw\), 24px\)$/);
    for (const [k, vw] of [[FLUID_MIN_VW, 390], [FLUID_MAX_VW, 520]] as const) expect(k).toBe(vw);
    // Every themed role rides it; the slide theme never reads these vars.
    const v = themeCssVars('chalk');
    expect(v['--lsn-hand-body']).toBe(fluidPx(24));
    expect(v['--lsn-hand-label']).toBe(fluidPx(21.6));
    expect(v['--lsn-hand-small']).toBe(fluidPx(19.84));
    // Rounded, not raw binary floating point: 12.4 * 1.6 = 19.840000000000003.
    expect(v['--lsn-hand-small']).not.toMatch(/\d\.\d{4}px/);
    for (const css of Object.values(v)) expect(css).not.toMatch(/\d{6,}px/);
    expect(v['--lsn-line-px']).toBe(fluidPx(19.38, 0.87));
    expect(fluidPxAt(19.38, 390, 0.87)).toBeCloseTo(16.86, 1);
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
      for (const k of ['--lsn-board', '--lsn-board-lit', '--lsn-ink', '--lsn-ink-2', '--lsn-muted', '--lsn-pen', '--lsn-pen-soft', '--lsn-hand', '--lsn-title', '--lsn-heading', '--lsn-hand-scale', '--lsn-math-scale', '--lsn-hand-body', '--lsn-hand-label', '--lsn-hand-small', '--lsn-title-px', '--lsn-heading-px', '--lsn-line-px', '--lsn-tip-style', '--lsn-tip-color', '--lsn-grid', '--lsn-axis', '--lsn-curve', '--lsn-ghost', '--lsn-well', '--lsn-ribbon', '--lsn-ribbon-lit', '--lsn-hl-amber', '--lsn-mark-underline', '--lsn-mark-circle', '--lsn-mark-box', '--lsn-chip-emerald-text']) {
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
