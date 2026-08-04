'use client';
// ── THE markdown + KaTeX render path for Supabase content ────────────────────
//
// Extracted verbatim from the /revise worked-examples SwipeApp (2026-08-04) when
// the notes portal needed the same rendering. There must be exactly ONE math
// pipeline in this repo — a second one silently diverges on the DB's quirky
// `$$\begin{aligned}…$$` formatting and becomes a bug factory (SPEC-NOTES-PORTAL
// "Hard rules"). Consumers style the output by passing `components`; they do not
// re-declare plugins.

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

/**
 * remark-math v6 uses a fence model: `$$` must sit on its own line. The content
 * in `content_snippets` was authored as `$$\begin{aligned}…$$` with the
 * delimiters hugging the math, so insert the newlines remark expects.
 *
 * Exported for unit testing — the display-math regression this guards is easy to
 * reintroduce and invisible until a card renders as literal `$$` text.
 */
export function fixMathFences(src: string): string {
  return src
    // If $$ is immediately followed by non-whitespace, insert a newline after it
    .replace(/\$\$(?=\S)/g, () => '$$\n')
    // If $$ is immediately preceded by non-whitespace, insert a newline before it
    .replace(/([^\n\s])\$\$/g, (_, c: string) => `${c}\n$$`);
}

/** KaTeX options tuned for the authored content (loose mode, never throws). */
export const katexOptions = {
  strict: false,
  trust: true,
  throwOnError: false,
  output: 'htmlAndMathml' as const,
  macros: { '\\tfrac': '\\frac' },
};

/**
 * Shared renderer. `components` overrides let each surface keep its own
 * typography (swipe cards vs. docs prose) without forking the math pipeline.
 */
export function MathMarkdown({
  content,
  components,
}: {
  content: string;
  components?: Components;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeKatex, katexOptions]]}
      components={components}
    >
      {fixMathFences(content)}
    </ReactMarkdown>
  );
}
