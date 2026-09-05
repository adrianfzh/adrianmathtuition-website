// Stage themes for the lesson player (pure tokens — the player turns them into
// CSS custom properties on its root; the CSS block in lesson-player.tsx reads
// `--lsn-*` and nothing else, so a theme is a row here, never a fork).
//
//   slide  the original card: white board, navy ink, portal amber pen. Its
//          tokens ARE the values the player used before themes existed, so a
//          script without `theme` renders byte-identically.
//   chalk  THE SLATE (2026-09-05 — Adrian's pick from the ink probe): a dark
//          green-grey radial board, fractal-noise grain blended over it, a
//          low-frequency chalk-dust haze, two erased ghosts and a vignette.
//          All CSS/SVG, no image files, and the whole stack lives in ONE
//          element's background (background-blend-mode does the probe's
//          overlay pass, so there are no texture divs to keep in step) plus
//          two pseudo-elements for the ghosts. Chalk white / cyan / yellow /
//          pink; KALAM for prose — the face the chalk WRITER draws stroke by
//          stroke (lesson/[slug]/chalk-writer.ts) — and PERMANENT MARKER for
//          titles. Maths stays typeset KaTeX and dusts in; it is never written.
//   paper  the same mechanics on a light ruled ground with ink-blue prose.
//
// Pure module: no I/O, no React.

import type { LessonTheme, MarkKind } from './lesson-script';

export interface ThemeTokens {
  /** The card / board ground — the flat colour under the texture stack. */
  board: string;
  /** The LIGHTEST point of that ground: what the contrast guards must clear. */
  boardLit: string;
  /** The texture stack painted over the board (CSS background-image), or 'none'. */
  texture: string;
  /** background-blend-mode for the stack — one entry per texture layer. */
  textureBlend: string;
  /** background-size for the stack — one entry per texture layer. */
  textureSize: string;
  /** Hairline round the board. */
  edge: string;
  /** Headline ink (titles, equation tokens). */
  ink: string;
  /** Body ink (prose). */
  ink2: string;
  /** Quiet ink (headings, hints, tick labels). */
  muted: string;
  /** The pen: notes, the cursor's sweep, the ribbon rule. */
  pen: string;
  /** A halo round the pen tip. */
  penSoft: string;
  /** Font stack for prose and notes ('inherit' keeps the portal sans). */
  hand: string;
  /** Font stack for scene titles ('inherit' = the portal sans). */
  title: string;
  /** Prose size multiplier — handwriting faces run small at the same px. */
  handScale: number;
  /** Typeset maths inside handwritten prose, relative to the un-scaled size. */
  mathScale: number;
  /** The writing tip's body colour (chalk stick / pencil). */
  tip: string;
  /** Graph paper. */
  grid: string;
  axis: string;
  curve: string;
  ghost: string;
  /** Highlight ink per tone — a chalk-colour change on the board, a pill on the slide. */
  hl: Record<'amber' | 'sky' | 'rose' | 'emerald', string>;
  /** Hand-drawn marks, per kind: pointing / attention / the answer. */
  mark: Record<MarkKind, string>;
  /** Callout chips, per tone: background / border / text. */
  chip: Record<'amber' | 'sky' | 'rose' | 'emerald', { bg: string; border: string; text: string }>;
  /** The check's question box. */
  well: string;
  wellEdge: string;
  /** The spoken-line ribbon's resting and lit word colours. */
  ribbon: string;
  ribbonLit: string;
}

// ── The slate, as data: URIs (the ink probe's layers, verbatim in feel) ──────

/**
 * Fractal-noise grain, tiled and blended `overlay` over the base — the tooth of
 * the board. The alpha row is a CONSTANT (0.38): the probe carried that as a
 * CSS `opacity` on its own layer, and a background layer cannot have one.
 */
const SLATE_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='g' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='3' stitchTiles='stitch' seed='2'/><feColorMatrix type='saturate' values='0'/><feColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0.38'/></filter><rect width='260' height='260' filter='url(%23g)'/></svg>\")";

/** Low-frequency chalk dust hanging on the board (alpha pre-multiplied by the probe's 0.36). */
const SLATE_DUST =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><filter id='d' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.0125 0.02' numOctaves='3' stitchTiles='stitch' seed='5'/><feColorMatrix type='matrix' values='0 0 0 0 0.93  0 0 0 0 0.95  0 0 0 0 0.90  0 0 0 0.29 -0.094'/></filter><rect width='640' height='400' filter='url(%23d)'/></svg>\")";

/** The base board: lighter where a lamp would fall, darker at the frame. */
const SLATE_BASE =
  'radial-gradient(ellipse at 50% 38%, #3d4c45 0%, #33423c 40%, #27342f 78%, #1e2925 100%)';

/** The corners fall away — the probe's vignette, on top of everything. */
const SLATE_VIGNETTE =
  'radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.30) 78%, rgba(0,0,0,0.55) 100%)';

/** Layer order is top-first, so the blend list reads the same way. */
const SLATE_TEXTURE = `${SLATE_VIGNETTE}, ${SLATE_DUST}, ${SLATE_GRAIN}, ${SLATE_BASE}`;
const SLATE_BLEND = 'normal, normal, overlay, normal';
const SLATE_SIZE = '100% 100%, 640px 400px, 260px 260px, 100% 100%';

/** Ruled lines for the paper board: one rule every 28 px, a faint margin. */
const PAPER_RULES =
  'repeating-linear-gradient(180deg, transparent 0 27px, rgba(30, 64, 140, 0.13) 27px 28px), linear-gradient(90deg, transparent 0 42px, rgba(220, 80, 90, 0.22) 42px 43px, transparent 43px)';

// ── The faces (self-hosted; see public/lessons/fonts/ABOUT.txt) ──────────────

/**
 * Prose face. The chalk writer derives its pen paths by rasterising the very
 * face the browser laid the text out with, so the file the CSS loads and the
 * file the engine reads MUST be one and the same — which is why these are
 * self-hosted subsets rather than a Google Fonts stylesheet.
 */
export const HAND_FONT_URL = '/lessons/fonts/Kalam-Regular.subset.woff';
/** Title face — a rounded chalk marker. */
export const TITLE_FONT_URL = '/lessons/fonts/PermanentMarker-Regular.subset.woff';

/** The family name the writer checks for and the CSS asks for. */
export const HAND_FONT_FAMILY = 'Kalam';
export const TITLE_FONT_FAMILY = 'Permanent Marker';

/** @font-face rules for both faces — injected by the player, only when themed. */
export const HAND_FONT_FACES = `
@font-face { font-family: '${HAND_FONT_FAMILY}'; src: url('${HAND_FONT_URL}') format('woff'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: '${TITLE_FONT_FAMILY}'; src: url('${TITLE_FONT_URL}') format('woff'); font-weight: 400; font-style: normal; font-display: swap; }
`.trim();

const HAND_FONT = `'${HAND_FONT_FAMILY}', 'Segoe Print', 'Bradley Hand', cursive`;
const TITLE_FONT = `'${TITLE_FONT_FAMILY}', '${HAND_FONT_FAMILY}', 'Segoe Print', cursive`;

// Chalk sticks, as they come out of the box.
const CHALK_WHITE = '#f3f1e6';
const CHALK_CYAN = '#9de5f5';
const CHALK_YELLOW = '#ffe58a';
const CHALK_PINK = '#ffc2d2';
const CHALK_GREEN = '#b6e8b0';

export const THEME_TOKENS: Record<LessonTheme, ThemeTokens> = {
  slide: {
    board: '#ffffff',
    boardLit: '#ffffff',
    texture: 'none',
    textureBlend: 'normal',
    textureSize: 'auto',
    edge: 'transparent',
    ink: 'hsl(220, 60%, 20%)',
    ink2: '#334155',
    muted: '#94a3b8',
    pen: 'hsl(40, 85%, 52%)',
    penSoft: 'rgba(245, 158, 11, 0.25)',
    hand: 'inherit',
    title: 'inherit',
    handScale: 1,
    mathScale: 1,
    tip: 'hsl(40, 85%, 52%)',
    grid: '#e2e8f0',
    axis: '#94a3b8',
    curve: 'hsl(220, 60%, 20%)',
    ghost: '#cbd5e1',
    hl: { amber: '#fef3c7', sky: '#e0f2fe', rose: '#ffe4e6', emerald: '#d1fae5' },
    // The slide's marks were all one amber — keeping them equal to the pen is
    // what makes an unthemed script render byte-identically.
    mark: { underline: 'hsl(40, 85%, 52%)', circle: 'hsl(40, 85%, 52%)', box: 'hsl(40, 85%, 52%)' },
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
    board: '#2f3d37',
    boardLit: '#3d4c45',
    texture: SLATE_TEXTURE,
    textureBlend: SLATE_BLEND,
    textureSize: SLATE_SIZE,
    edge: 'rgba(255, 255, 255, 0.07)',
    ink: CHALK_WHITE,
    ink2: '#e9e5d8',
    muted: '#b2bfb6',
    pen: CHALK_YELLOW,
    penSoft: 'rgba(255, 229, 138, 0.35)',
    hand: HAND_FONT,
    title: TITLE_FONT,
    // Kalam at 1.6× a 15 px base = 24 px — the size the probe read best at on a
    // phone, and the size the writer's strokes were tuned against.
    handScale: 1.6,
    mathScale: 1.22,
    tip: '#fbfbf5',
    grid: 'rgba(255, 255, 255, 0.09)',
    axis: 'rgba(243, 241, 230, 0.55)',
    curve: CHALK_WHITE,
    ghost: 'rgba(243, 241, 230, 0.35)',
    // On the board a highlight is a CHANGE OF CHALK, not a pill: these are ink
    // colours, and the CSS adds the soft glow that a fresh stick leaves.
    hl: { amber: CHALK_YELLOW, sky: CHALK_CYAN, rose: CHALK_PINK, emerald: CHALK_GREEN },
    // Pointing / attention / the answer — one colour each, so a boarded answer
    // never reads as another underline.
    mark: { underline: CHALK_CYAN, circle: CHALK_YELLOW, box: CHALK_PINK },
    chip: {
      amber: { bg: 'rgba(255, 229, 138, 0.10)', border: 'rgba(255, 229, 138, 0.38)', text: '#f8e7bb' },
      sky: { bg: 'rgba(157, 229, 245, 0.10)', border: 'rgba(157, 229, 245, 0.38)', text: '#d3f0f8' },
      rose: { bg: 'rgba(255, 194, 210, 0.10)', border: 'rgba(255, 194, 210, 0.38)', text: '#fad9e2' },
      emerald: { bg: 'rgba(182, 232, 176, 0.10)', border: 'rgba(182, 232, 176, 0.38)', text: '#dcf4d8' },
    },
    well: 'rgba(255, 255, 255, 0.06)',
    wellEdge: 'rgba(255, 255, 255, 0.12)',
    ribbon: '#93a099',
    ribbonLit: CHALK_WHITE,
  },
  paper: {
    board: '#fdfcf7',
    boardLit: '#fdfcf7',
    texture: PAPER_RULES,
    textureBlend: 'normal, normal',
    textureSize: 'auto, auto',
    edge: '#e6e2d6',
    ink: 'hsl(220, 60%, 20%)',
    ink2: '#243a6b',
    muted: '#8a93a6',
    pen: 'hsl(40, 80%, 42%)',
    penSoft: 'rgba(214, 143, 26, 0.25)',
    hand: HAND_FONT,
    title: TITLE_FONT,
    handScale: 1.5,
    mathScale: 1.2,
    tip: '#5b6478',
    grid: '#e3e6ee',
    axis: '#8a93a6',
    curve: 'hsl(220, 60%, 20%)',
    ghost: '#c5cbd8',
    hl: { amber: '#a4700a', sky: '#0b6f96', rose: '#a81d45', emerald: '#0a7150' },
    mark: { underline: '#0b6f96', circle: 'hsl(40, 80%, 42%)', box: '#a81d45' },
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

/** Does a theme need the handwriting faces loaded? */
export function needsHandFont(theme: LessonTheme): boolean {
  return THEME_TOKENS[theme].hand !== 'inherit';
}

/** The theme as `--lsn-*` custom properties, ready for a style attribute. */
export function themeCssVars(theme: LessonTheme): Record<string, string> {
  const t = THEME_TOKENS[theme];
  const vars: Record<string, string> = {
    '--lsn-board': t.board,
    '--lsn-board-lit': t.boardLit,
    '--lsn-texture': t.texture,
    '--lsn-texture-blend': t.textureBlend,
    '--lsn-texture-size': t.textureSize,
    '--lsn-edge': t.edge,
    '--lsn-ink': t.ink,
    '--lsn-ink-2': t.ink2,
    '--lsn-muted': t.muted,
    '--lsn-pen': t.pen,
    '--lsn-pen-soft': t.penSoft,
    '--lsn-hand': t.hand,
    '--lsn-title': t.title,
    '--lsn-hand-scale': String(t.handScale),
    '--lsn-math-scale': String(t.mathScale),
    '--lsn-tip': t.tip,
    '--lsn-grid': t.grid,
    '--lsn-axis': t.axis,
    '--lsn-curve': t.curve,
    '--lsn-ghost': t.ghost,
    '--lsn-well': t.well,
    '--lsn-well-edge': t.wellEdge,
    '--lsn-ribbon': t.ribbon,
    '--lsn-ribbon-lit': t.ribbonLit,
  };
  for (const kind of ['underline', 'circle', 'box'] as const) vars[`--lsn-mark-${kind}`] = t.mark[kind];
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
