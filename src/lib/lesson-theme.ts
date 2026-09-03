// Stage themes for the lesson player (pure tokens — the player turns them into
// CSS custom properties on its root; the CSS block in lesson-player.tsx reads
// `--lsn-*` and nothing else, so a theme is a row here, never a fork).
//
//   slide  the original card: white board, navy ink, portal amber pen. Its
//          tokens ARE the values the player used before themes existed, so a
//          script without `theme` renders byte-identically.
//   chalk  a dark green-black board with chalk-white ink, chalk-coloured
//          tints, a handwriting face for prose, and a pen that leads.
//   paper  the same mechanics on a light ruled ground with ink-blue prose.
//
// Pure module: no I/O, no React.

import type { LessonTheme } from './lesson-script';

export interface ThemeTokens {
  /** The card / board ground. */
  board: string;
  /** A texture painted over the board (CSS background-image), or 'none'. */
  texture: string;
  /** Hairline round the board. */
  edge: string;
  /** Headline ink (titles, equation tokens). */
  ink: string;
  /** Body ink (prose). */
  ink2: string;
  /** Quiet ink (headings, hints, tick labels). */
  muted: string;
  /** The pen: marks, the cursor's sweep, the ribbon rule. */
  pen: string;
  /** A halo round the pen tip. */
  penSoft: string;
  /** Font stack for prose and notes ('inherit' keeps the portal sans). */
  hand: string;
  /** Prose size multiplier — handwriting faces run small at the same px. */
  handScale: number;
  /** Graph paper. */
  grid: string;
  axis: string;
  curve: string;
  ghost: string;
  /** Highlight pills behind tokens, per tone. */
  hl: Record<'amber' | 'sky' | 'rose' | 'emerald', string>;
  /** Callout chips, per tone: background / border / text. */
  chip: Record<'amber' | 'sky' | 'rose' | 'emerald', { bg: string; border: string; text: string }>;
  /** The check's question box. */
  well: string;
  wellEdge: string;
  /** The spoken-line ribbon's resting and lit word colours. */
  ribbon: string;
  ribbonLit: string;
}

/** Grain for the chalk board: an SVG noise tile (no external image). */
const CHALK_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.055 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";

/** Ruled lines for the paper board: one rule every 28 px, a faint margin. */
const PAPER_RULES =
  'repeating-linear-gradient(180deg, transparent 0 27px, rgba(30, 64, 140, 0.13) 27px 28px), linear-gradient(90deg, transparent 0 42px, rgba(220, 80, 90, 0.22) 42px 43px, transparent 43px)';

const HAND_FONT = "'Caveat', 'Segoe Print', 'Bradley Hand', cursive";

export const THEME_TOKENS: Record<LessonTheme, ThemeTokens> = {
  slide: {
    board: '#ffffff',
    texture: 'none',
    edge: 'transparent',
    ink: 'hsl(220, 60%, 20%)',
    ink2: '#334155',
    muted: '#94a3b8',
    pen: 'hsl(40, 85%, 52%)',
    penSoft: 'rgba(245, 158, 11, 0.25)',
    hand: 'inherit',
    handScale: 1,
    grid: '#e2e8f0',
    axis: '#94a3b8',
    curve: 'hsl(220, 60%, 20%)',
    ghost: '#cbd5e1',
    hl: { amber: '#fef3c7', sky: '#e0f2fe', rose: '#ffe4e6', emerald: '#d1fae5' },
    chip: {
      amber: { bg: '#fffbeb', border: '#fde68a', text: '#78350f' },
      sky: { bg: '#f0f9ff', border: '#bae6fd', text: '#0c4a6e' },
      rose: { bg: '#fff1f2', border: '#fecdd3', text: '#881337' },
      emerald: { bg: '#ecfdf5', border: '#a7f3d0', text: '#064e3b' },
    },
    well: '#f8fafc',
    wellEdge: '#e2e8f0',
    ribbon: '#94a3b8',
    ribbonLit: 'hsl(220, 60%, 20%)',
  },
  chalk: {
    board: 'hsl(158, 14%, 13%)',
    texture: `radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.045), transparent 60%), ${CHALK_NOISE}`,
    edge: 'rgba(255, 255, 255, 0.08)',
    ink: '#f3efe3',
    ink2: '#e2ddd0',
    muted: '#9aa89f',
    pen: '#f5c96a',
    penSoft: 'rgba(245, 201, 106, 0.35)',
    hand: HAND_FONT,
    handScale: 1.28,
    grid: 'rgba(255, 255, 255, 0.09)',
    axis: 'rgba(243, 239, 227, 0.55)',
    curve: '#f3efe3',
    ghost: 'rgba(243, 239, 227, 0.35)',
    hl: { amber: 'rgba(245, 201, 106, 0.22)', sky: 'rgba(143, 211, 244, 0.20)', rose: 'rgba(244, 163, 181, 0.22)', emerald: 'rgba(155, 227, 184, 0.22)' },
    chip: {
      amber: { bg: 'rgba(245, 201, 106, 0.10)', border: 'rgba(245, 201, 106, 0.38)', text: '#f6e2b3' },
      sky: { bg: 'rgba(143, 211, 244, 0.10)', border: 'rgba(143, 211, 244, 0.38)', text: '#cfeafa' },
      rose: { bg: 'rgba(244, 163, 181, 0.10)', border: 'rgba(244, 163, 181, 0.38)', text: '#f8d0d9' },
      emerald: { bg: 'rgba(155, 227, 184, 0.10)', border: 'rgba(155, 227, 184, 0.38)', text: '#d2f2df' },
    },
    well: 'rgba(255, 255, 255, 0.06)',
    wellEdge: 'rgba(255, 255, 255, 0.12)',
    ribbon: '#8e9a93',
    ribbonLit: '#f3efe3',
  },
  paper: {
    board: '#fdfcf7',
    texture: PAPER_RULES,
    edge: '#e6e2d6',
    ink: 'hsl(220, 60%, 20%)',
    ink2: '#243a6b',
    muted: '#8a93a6',
    pen: 'hsl(40, 80%, 42%)',
    penSoft: 'rgba(214, 143, 26, 0.25)',
    hand: HAND_FONT,
    handScale: 1.28,
    grid: '#e3e6ee',
    axis: '#8a93a6',
    curve: 'hsl(220, 60%, 20%)',
    ghost: '#c5cbd8',
    hl: { amber: 'rgba(253, 230, 138, 0.55)', sky: 'rgba(186, 230, 253, 0.55)', rose: 'rgba(254, 205, 211, 0.55)', emerald: 'rgba(167, 243, 208, 0.55)' },
    chip: {
      amber: { bg: 'rgba(255, 251, 235, 0.9)', border: '#fde68a', text: '#78350f' },
      sky: { bg: 'rgba(240, 249, 255, 0.9)', border: '#bae6fd', text: '#0c4a6e' },
      rose: { bg: 'rgba(255, 241, 242, 0.9)', border: '#fecdd3', text: '#881337' },
      emerald: { bg: 'rgba(236, 253, 245, 0.9)', border: '#a7f3d0', text: '#064e3b' },
    },
    well: 'rgba(255, 255, 255, 0.85)',
    wellEdge: '#e3e0d4',
    ribbon: '#8a93a6',
    ribbonLit: 'hsl(220, 60%, 20%)',
  },
};

export const DEFAULT_THEME: LessonTheme = 'slide';

/** Coerce a script's theme (undefined / unknown → slide). */
export function normalizeTheme(v: unknown): LessonTheme {
  return v === 'chalk' || v === 'paper' ? v : DEFAULT_THEME;
}

/** Google Fonts stylesheet for the handwriting face (the repo loads fonts by <link>). */
export const HAND_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&display=swap';

/** Does a theme need the handwriting face loaded? */
export function needsHandFont(theme: LessonTheme): boolean {
  return THEME_TOKENS[theme].hand !== 'inherit';
}

/** The theme as `--lsn-*` custom properties, ready for a style attribute. */
export function themeCssVars(theme: LessonTheme): Record<string, string> {
  const t = THEME_TOKENS[theme];
  const vars: Record<string, string> = {
    '--lsn-board': t.board,
    '--lsn-texture': t.texture,
    '--lsn-edge': t.edge,
    '--lsn-ink': t.ink,
    '--lsn-ink-2': t.ink2,
    '--lsn-muted': t.muted,
    '--lsn-pen': t.pen,
    '--lsn-pen-soft': t.penSoft,
    '--lsn-hand': t.hand,
    '--lsn-hand-scale': String(t.handScale),
    '--lsn-grid': t.grid,
    '--lsn-axis': t.axis,
    '--lsn-curve': t.curve,
    '--lsn-ghost': t.ghost,
    '--lsn-well': t.well,
    '--lsn-well-edge': t.wellEdge,
    '--lsn-ribbon': t.ribbon,
    '--lsn-ribbon-lit': t.ribbonLit,
  };
  for (const tone of ['amber', 'sky', 'rose', 'emerald'] as const) {
    vars[`--lsn-hl-${tone}`] = t.hl[tone];
    vars[`--lsn-chip-${tone}-bg`] = t.chip[tone].bg;
    vars[`--lsn-chip-${tone}-border`] = t.chip[tone].border;
    vars[`--lsn-chip-${tone}-text`] = t.chip[tone].text;
  }
  return vars;
}

// ── Contrast (for the tests: every theme's ink must read on its board) ───────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** sRGB → relative luminance. Accepts #rgb, #rrggbb, rgb(a)(…) and hsl(…). */
export function relativeLuminance(color: string): number {
  const c = color.trim();
  let r = 0, g = 0, b = 0;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else if (/^rgba?\(/i.test(c)) {
    const parts = c.replace(/^rgba?\(|\)$/gi, '').split(',').map(Number);
    [r, g, b] = parts;
  } else if (/^hsla?\(/i.test(c)) {
    const [h, s, l] = c.replace(/^hsla?\(|\)$|%/gi, '').split(',').map(Number);
    const S = s / 100, L = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = S * Math.min(L, 1 - L);
    const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    r = Math.round(f(0) * 255); g = Math.round(f(8) * 255); b = Math.round(f(4) * 255);
  } else throw new Error(`unparsed colour "${color}"`);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
