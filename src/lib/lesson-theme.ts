// Stage themes for the lesson player (pure tokens — the player turns them into
// CSS custom properties on its root; the CSS block in lesson-player.tsx reads
// `--lsn-*` and nothing else, so a theme is a row here, never a fork).
//
//   slide  the original card: white board, navy ink, portal amber pen. Its
//          tokens ARE the values the player used before themes existed, so a
//          script without `theme` renders byte-identically.
//   chalk  THE SLATE (2026-09-05 — Adrian's pick from the ink probe; re-cut
//          2026-09-06 after his phone review said it looked smeared): a dark
//          green-grey radial board that barely varies, a fine even fractal
//          grain, a whisper of chalk dust, two nearly-gone erased ghosts and a
//          gentle vignette.
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

/**
 * What is drawn at the point the hand is writing.
 *   none   nothing at all — the ink appearing IS the cue (the default)
 *   glow   a very faint soft spot, ≤ 8 px, no shadow
 *   stick  the chalk stick, its shadow and its contact glow
 */
export type TipStyle = 'none' | 'glow' | 'stick';
export const TIP_STYLES: readonly TipStyle[] = ['none', 'glow', 'stick'] as const;

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
  /**
   * What rides the writing point. `none` (the default everywhere since Adrian's
   * 2026-09-06 review — "the pen looks distracting") shows NOTHING: the ink
   * appearing along the pen path is itself the "someone is writing" cue, which
   * is what JensenMath does. `glow` adds a very faint soft spot at the tip;
   * `stick` is the drawn chalk with its shadow and contact glow.
   */
  tip: TipStyle;
  /** The tip's colour when it is drawn at all (chalk stick / pencil / the glow's tint). */
  tipColor: string;
  /** Scene headings — on a board these are chalk in the marker face, not a sans label. */
  heading: string;
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

// ── The slate, as data: URIs (calm and even — the 2026-09-06 re-cut) ────────
//
// Adrian's phone review of the first slate: it read "smeared". The cause was
// three loud layers stacked — a low-frequency dust haze at 0.29 alpha (big
// cloudy patches), two erased ghosts at 0.075 white, and a 70 px inset
// black vignette on top of the gradient's own. All three are now whispers and
// the base gradient barely varies: what is left is a fine even tooth on a
// dark green-black board, which is what a real slate looks like from a metre.

/**
 * Fractal-noise grain, tiled and blended `overlay` over the base — the tooth of
 * the board, and the only texture that should be noticeable at all. The alpha
 * row is a CONSTANT (a background layer cannot carry an `opacity`).
 */
const SLATE_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch' seed='2'/><feColorMatrix type='saturate' values='0'/><feColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0.28'/></filter><rect width='220' height='220' filter='url(%23g)'/></svg>\")";

/**
 * A WHISPER of chalk dust — 0.05 alpha at six times the old frequency, so it
 * reads as a slightly uneven wash rather than the old cloud bank. It is the
 * layer that got Adrian's "smeared"; it survives only because a board with no
 * low-frequency variation at all reads as painted plastic.
 */
const SLATE_DUST =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='300'><filter id='d' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.055 0.075' numOctaves='2' stitchTiles='stitch' seed='5'/><feColorMatrix type='matrix' values='0 0 0 0 0.93  0 0 0 0 0.95  0 0 0 0 0.90  0 0 0 0.09 -0.032'/></filter><rect width='420' height='300' filter='url(%23d)'/></svg>\")";

/** The base board: an even green-black, a hint of lamp near the top. */
const SLATE_BASE =
  'radial-gradient(ellipse at 50% 34%, #313d38 0%, #2d3833 44%, #29332f 76%, #242d29 100%)';

/** The corners fall away — gently; the old one plus its inset twin made a tunnel. */
const SLATE_VIGNETTE =
  'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 54%, rgba(0,0,0,0.14) 84%, rgba(0,0,0,0.26) 100%)';

/** Layer order is top-first, so the blend list reads the same way. */
const SLATE_TEXTURE = `${SLATE_VIGNETTE}, ${SLATE_DUST}, ${SLATE_GRAIN}, ${SLATE_BASE}`;
const SLATE_BLEND = 'normal, normal, overlay, normal';
const SLATE_SIZE = '100% 100%, 420px 300px, 220px 220px, 100% 100%';

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

// Chalk sticks, as they come out of the box. Whiter and more saturated than
// the first cut: the 2026-09-06 review wanted crisp, vivid chalk, and the halo
// that used to fake "brightness" is gone (see PLAYER_CSS), so the colour has to
// carry it. Every one of these clears 7 : 1 on the LIGHTEST point of the slate
// (lesson-theme.test.ts measures it).
const CHALK_WHITE = '#fbfaf3';
const CHALK_CYAN = '#a8ecfb';
const CHALK_YELLOW = '#ffe89a';
const CHALK_PINK = '#ffc2d2';
const CHALK_GREEN = '#b6e8b0';
/** Headings are chalk too — a quieter cyan, in the marker face. */
const CHALK_HEADING = '#a3dbe6';

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
    heading: '#94a3b8',
    handScale: 1,
    mathScale: 1,
    // The slide's pen dot is part of its draw-on and predates the board themes:
    // 'stick' keeps it exactly where it was (an unthemed script is byte-identical).
    tip: 'stick',
    tipColor: 'hsl(40, 85%, 52%)',
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
    board: '#28322d',
    boardLit: '#313d38',
    texture: SLATE_TEXTURE,
    textureBlend: SLATE_BLEND,
    textureSize: SLATE_SIZE,
    edge: 'rgba(255, 255, 255, 0.06)',
    ink: CHALK_WHITE,
    ink2: '#f2efe4',
    muted: '#b9c6bd',
    pen: CHALK_YELLOW,
    penSoft: 'rgba(255, 232, 154, 0.30)',
    hand: HAND_FONT,
    title: TITLE_FONT,
    heading: CHALK_HEADING,
    // Kalam at 1.6× a 15 px base = 24 px on a wide board. On a phone the CSS
    // reads `--lsn-hand-body` instead (fluidPx below): 24 px measured ~22
    // characters a line at 390 px and ran off the board, so the same roles
    // shrink to 85 % there — ~20.4 px, ~36 characters. handScale stays the
    // NOMINAL multiplier: the KaTeX rule divides by it, and that ratio holds at
    // every width because it is expressed in `em`.
    handScale: 1.6,
    mathScale: 1.24,
    // NO PEN by default (Adrian, 2026-09-06: "the pen looks distracting").
    // The ink appearing along the path is the cue — what JensenMath shows.
    tip: 'none',
    tipColor: '#fbfbf5',
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
    heading: '#5c6a86',
    handScale: 1.5,
    mathScale: 1.2,
    tip: 'none',
    tipColor: '#5b6478',
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

// ── Fluid sizes: the board is 358 px wide on a phone and 512 on a desk ───────

/** The narrow end of the scale (a 390 px phone) and the wide end (the card at full width). */
export const FLUID_MIN_VW = 390;
export const FLUID_MAX_VW = 520;

/**
 * A size that is `maxPx` on a board at full width and `maxPx * floor` on a
 * 390 px phone, interpolating linearly between the two — one `clamp()`, no
 * media query, no step.
 *
 * This exists because the first chalk cut hard-coded absolute px (24 px Kalam,
 * 19.4 px worked lines) and those sizes ran off a phone board: 24 px Kalam
 * measured ~22 characters a line at 390 px, and the equation rows overflowed
 * the card. Kalam at 85 % is ~20.4 px — the ~36-character line Adrian asked
 * for — while a desk board keeps the size the probe was read at.
 */
export function fluidPx(maxPx: number, floor = 0.85): string {
  // Rounded, not raw: 12.4 * 1.6 is 19.840000000000003 in binary floating point
  // and that is not a length anybody should read in a stylesheet.
  const max = Math.round(maxPx * 100) / 100;
  const min = Math.round(max * floor * 100) / 100;
  const slope = (max - min) / (FLUID_MAX_VW - FLUID_MIN_VW);          // px of size per px of viewport
  const intercept = Math.round((min - slope * FLUID_MIN_VW) * 1000) / 1000;
  const vw = Math.round(slope * 100 * 10000) / 10000;
  return `clamp(${min}px, calc(${intercept}px + ${vw}vw), ${max}px)`;
}

/** What `fluidPx` resolves to at a given viewport width — the same maths, for tests. */
export function fluidPxAt(maxPx: number, viewport: number, floor = 0.85): number {
  const max = Math.round(maxPx * 100) / 100;
  const min = Math.round(max * floor * 100) / 100;
  const slope = (max - min) / (FLUID_MAX_VW - FLUID_MIN_VW);
  return Math.min(max, Math.max(min, min + slope * (viewport - FLUID_MIN_VW)));
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
    '--lsn-heading': t.heading,
    '--lsn-hand-scale': String(t.handScale),
    '--lsn-math-scale': String(t.mathScale),
    // The three prose roles and the worked line, as fluid lengths. `handScale`
    // stays the nominal multiplier the KaTeX `em` rule divides by.
    '--lsn-hand-body': fluidPx(15 * t.handScale),
    '--lsn-hand-label': fluidPx(13.5 * t.handScale),
    // 12.4, not 13: a step's note is an ASIDE beside the working, and on a
    // phone board eight lines of it at the old size was what pushed Continue
    // under the tab bar.
    '--lsn-hand-small': fluidPx(12.4 * t.handScale),
    '--lsn-title-px': fluidPx(Math.round(27 * 1.12 * 10) / 10, 0.82),
    '--lsn-heading-px': fluidPx(17, 0.88),
    '--lsn-line-px': fluidPx(Math.round(17 * 1.14 * 100) / 100, 0.87),
    '--lsn-tip-style': t.tip,
    '--lsn-tip-color': t.tipColor,
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
