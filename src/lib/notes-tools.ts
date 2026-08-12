// ── Notes portal: interactive tool embeds ────────────────────────────────────
//
// The 19 files in `public/tools/` are self-contained single-page apps: no build
// step, no external requests, their own warm-paper house style. That makes them
// safe to embed in an iframe — and because they carry their own look, they are
// framed as media on the page rather than blended into it (see `.nx-tool` in
// notes.css), the way a docs site frames a screenshot.
//
// The map is static on purpose. SPEC-NOTES-PORTAL forbids new Supabase columns
// in Phase 1, and a topic→file lookup is not content: it changes when a tool is
// written, which is a code change anyway.
//
// Only obviously-correct pairings are listed. A topic with no entry simply shows
// no tool — a loose match ("this is sort of about graphs") is worse than none,
// because a student who clicks it once and finds it irrelevant stops clicking.

export interface NotesTool {
  /** Filename under public/tools, without the `.html`. */
  file: string;
  /** Student-facing name. Not the file's own <title>, which is often jokey. */
  title: string;
  /** One line on what the tool is actually for. */
  blurb: string;
  /**
   * True when the tool teaches the topic rather than illustrating one corner of
   * it. These get their own page in the sidebar as well as the inline panel —
   * Adrian links to them mid-lesson, so they need a URL worth saying out loud.
   */
  lesson?: boolean;
  /** Embed height in px. Tools with a tall control panel need more room. */
  height?: number;
}

/** Reserved URL segment for a topic's tool page: /notes/am/<topic>/tool. */
export const TOOL_SLUG = 'tool';

const AM_TOOLS: Record<string, NotesTool[]> = {
  'Linear Law': [
    {
      file: 'linear-law',
      title: 'What would you plot?',
      blurb:
        'You choose the axes; the graph answers. A wrong pick stays curved — the right one straightens and hands you the constants. Rebuilt 2026-08-07 (Adrian: the old always-straight demo taught nothing).',
      lesson: true,
      height: 720,
    },
  ],
  'Logarithms': [
    {
      file: 'exp-log-graphs',
      title: 'Exponential and logarithmic graphs',
      blurb:
        'The four basic shapes and the two minus signs that make them, then the exam recipe on y = ln(2 − x): asymptote, shape, draw, intercepts. Ends with a shape-and-asymptote drill.',
      lesson: true,
      height: 760,
    },
  ],
  'Trigonometry (R-Formula)': [
    {
      file: 'r-formula',
      title: 'Two waves collapsing into one',
      blurb:
        'Drag a and b and see a·sin x + b·cos x become a single R·sin(x + α) — where R and α come from.',
      lesson: true,
      height: 700,
    },
  ],
  'Differentiation (Techniques)': [
    {
      file: 'first-principles',
      title: 'Differentiation from first principles',
      blurb:
        'The chord sliding into the tangent, animated — what the limit in the definition is actually doing.',
      lesson: true,
      height: 700,
    },
    {
      file: 'calculus-drill',
      title: 'Calculus drill',
      blurb: 'Timed practice on chain, product and quotient rules.',
      height: 660,
    },
  ],
  'Trigonometry (Ratios)': [
    {
      file: 'sincos-unwrap',
      title: 'Unit circle → sine, cosine and tangent',
      blurb:
        'Unwrap the rotating point into the three graphs, so the ratios and the curves are visibly the same thing.',
      height: 680,
    },
  ],
  'Trigonometry (Graphs)': [
    {
      file: 'trig-graphs',
      title: 'Trig graph explorer',
      blurb: 'Change amplitude, period and shift, and read the effect off the curve.',
      height: 660,
    },
  ],
  'Trigonometry (Applications)': [
    {
      file: 'triangle-solver',
      title: 'Triangle solver and the ambiguous case',
      blurb:
        'Sine and cosine rule on a triangle you can drag — including when SSA gives two valid answers.',
      height: 680,
    },
  ],
  'Quadratic Functions': [
    {
      file: 'completing-square',
      title: 'Completing the square, with actual squares',
      blurb: 'The algebra shown as area, so the constant you add and subtract has a reason.',
      height: 680,
    },
    {
      file: 'quadratic-graphs',
      title: 'The three forms, one curve',
      blurb:
        'General, factorised and completed-square are the same parabola — this shows what each form hands you free (y-intercept, roots, turning point), then lets you drag a, b and c.',
      height: 720,
    },
  ],
  'Plane Geometry': [
    {
      file: 'circle-theorems',
      title: 'Circle theorem explorer',
      blurb: 'Drag the points; the theorem holds. Useful for seeing which one applies before proving it.',
      height: 700,
    },
    {
      file: 'geometry-proofs',
      title: 'Circle proofs, line by line',
      blurb:
        'The companion to the explorer: once you know which theorem applies, this builds the proof one line at a time — statement, then the reason that earns the mark.',
      lesson: true,
      height: 740,
    },
    {
      file: 'area-ratios',
      title: 'Ratio of areas',
      blurb: 'Triangles on a shared base, and area ratios in similar figures.',
      height: 660,
    },
  ],
  // Power Graphs left the syllabus (2026-08-07). Its two tools —
  // graph-transformations and curve-sketcher — still live in public/tools,
  // unmapped until another topic claims them.
};

const BY_LEVEL: Record<string, Record<string, NotesTool[]>> = { AM: AM_TOOLS };

/** Every tool mapped to a topic, in display order. */
export function toolsForTopic(level: string, topic: string): NotesTool[] {
  return BY_LEVEL[level.toUpperCase()]?.[topic] ?? [];
}

/** Only the tools that warrant their own page in the sidebar. */
export function lessonToolsForTopic(level: string, topic: string): NotesTool[] {
  return toolsForTopic(level, topic).filter(t => t.lesson);
}

/** Public URL of a tool's HTML file. */
export function toolHref(tool: NotesTool): string {
  return `/tools/${tool.file}.html`;
}
