// ── Notes portal: worked-example block structure ─────────────────────────────
//
// Snippets in `content_snippets` are a flat run of paragraphs whose ROLE is
// carried by a bold lead-in: `**Question:**`, `**Step 1.**`, `**Answer:**`,
// `**Tip:**`, `**⚠ Watch out:**`. Rendered literally that is a wall of bold text
// — which is exactly how /notes looked on first review.
//
// This remark plugin lifts the role into structure. Each labelled paragraph, plus
// every sibling up to the next label, becomes one `div[data-nb="<kind>"]` holding
// a `span.nb-label`, so notes.css can style a question lead, a step on a
// timeline, or a callout instead of yet another bold sentence.
//
// It is deliberately NOT part of the shared pipeline in `math-markdown.tsx`:
// /revise's swipe cards render the same rows and their typography must not move.
// The plugin is passed in per-surface via `extraRemarkPlugins`.
//
// Pure mdast in, mdast out — see notes-blocks.test.ts.

import type {
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast';
import type { Plugin } from 'unified';

/** Roles a labelled paragraph can take. Anything unrecognised is left alone. */
export type NotesBlockKind =
  | 'question'
  | 'solution'
  | 'step'
  | 'part'
  | 'answer'
  | 'check'
  | 'tip'
  | 'warn';

export interface LabelMatch {
  kind: NotesBlockKind;
  /** Display form of the label, minus punctuation and emoji decoration. */
  label: string;
}

/**
 * Label → role. Built from an actual scan of the 303 AM worked examples, so it
 * covers what authors really write rather than what they might; an unknown
 * label is a no-op, never a guess.
 */
const ROLES: Record<string, NotesBlockKind> = {
  question: 'question',
  q: 'question',

  solution: 'solution',
  working: 'solution',
  method: 'solution',
  setup: 'solution',

  answer: 'answer',
  'final answer': 'answer',
  final: 'answer',
  conclusion: 'answer',
  result: 'answer',
  hence: 'answer',

  check: 'check',
  'sanity check': 'check',
  'check domain': 'check',
  verification: 'check',
  verify: 'check',

  'watch out': 'warn',
  'common mistake': 'warn',
  careful: 'warn',
  warning: 'warn',
  pitfall: 'warn',
  trap: 'warn',

  tip: 'tip',
  'why this works': 'tip',
  note: 'tip',
  reading: 'tip',
  remember: 'tip',
  recall: 'tip',
  'key idea': 'tip',
  'key identity': 'tip',
  insight: 'tip',
  strategy: 'tip',
};

const STEP = /^step\s*(\d+)$/;
/** Part markers on multi-part questions: `(a)`, `(ii)`, `(ii) R-form`. */
const PART = /^\((?:[a-z]{1,3})\)/;

/** Trailing `:` / `.` / dash the author put after the label. */
const TRAILING = /[\s:.–—-]+$/u;
/** Leading decoration — `⚠`, `✅`, `▸` — before the word itself. */
const LEADING_DECORATION = /^[^\p{L}(]+/u;

/**
 * Classify a bold lead-in. Returns null for anything that isn't a known role, so
 * `**Coefficient of x^2:**` stays an ordinary bold sentence.
 */
export function classifyLabel(raw: string): LabelMatch | null {
  const label = raw.replace(LEADING_DECORATION, '').replace(TRAILING, '').trim();
  if (!label || label.length > 40) return null;

  const key = label.toLowerCase();
  const step = STEP.exec(key);
  if (step) return { kind: 'step', label: `Step ${step[1]}` };
  if (PART.test(key)) return { kind: 'part', label };

  const role = ROLES[key];
  return role ? { kind: role, label } : null;
}

/**
 * Flatten a phrasing node to text, or null if it holds anything that isn't text
 * — a label containing inline maths is a sentence, not a label.
 */
function plainText(node: PhrasingContent): string | null {
  if (node.type === 'text') return node.value;
  if (!('children' in node)) return null;
  let out = '';
  for (const child of node.children) {
    const text = plainText(child);
    if (text === null) return null;
    out += text;
  }
  return out;
}

/** The role of a root-level node, if it opens with a recognised label. */
function leadingLabel(node: RootContent): LabelMatch | null {
  if (node.type !== 'paragraph') return null;
  const first = node.children[0];
  if (!first || (first.type !== 'strong' && first.type !== 'emphasis')) return null;
  const text = plainText(first);
  return text === null ? null : classifyLabel(text);
}

/**
 * Remove the label from its paragraph, returning what's left — or null when the
 * label was alone on the line (`**Solution:**` followed by display maths).
 *
 * The separator strip is deliberately narrow: a bare `-` is only eaten when a
 * space follows it, so `**Answer:** -3x` keeps its minus sign.
 */
function stripLabel(paragraph: Paragraph): Paragraph | null {
  const rest = paragraph.children.slice(1);
  const first = rest[0];
  if (first && first.type === 'text') {
    const value = first.value.replace(/^\s*(?::|[-–—](?=\s))\s*/u, '');
    if (value.trim()) rest[0] = { ...first, value: value.replace(/^\s+/, '') };
    else rest.shift();
  }
  return rest.length ? { ...paragraph, children: rest } : null;
}

interface OpenBlock extends LabelMatch {
  children: RootContent[];
}

function toBlock(block: OpenBlock): RootContent {
  // Unknown mdast types are rendered by mdast-util-to-hast's default handler as
  // a <div> wrapping the children, with `hName`/`hProperties` applied on top —
  // so these become <div data-nb> / <span class="nb-label"> in the HTML.
  const label = {
    type: 'notesLabel',
    data: { hName: 'span', hProperties: { className: ['nb-label'] } },
    children: [{ type: 'text', value: block.label }],
  };
  return {
    type: 'notesBlock',
    data: {
      hName: 'div',
      hProperties: { className: ['nb'], 'data-nb': block.kind },
    },
    children: [label, ...block.children],
  } as unknown as RootContent;
}

/**
 * Group labelled paragraphs (and everything up to the next label) into blocks.
 * Content before the first label, and headings/rules, stay at the top level —
 * a heading ends the block it follows.
 */
export function groupNotesBlocks(tree: Root): void {
  const out: RootContent[] = [];
  let open: OpenBlock | null = null;

  const flush = () => {
    if (open) out.push(toBlock(open));
    open = null;
  };

  for (const node of tree.children) {
    if (node.type === 'heading' || node.type === 'thematicBreak') {
      flush();
      out.push(node);
      continue;
    }

    const match = leadingLabel(node);
    if (match) {
      flush();
      const body = stripLabel(node as Paragraph);
      open = { ...match, children: body ? [body] : [] };
      continue;
    }

    if (open) open.children.push(node);
    else out.push(node);
  }

  flush();
  tree.children = out;
}

// ── Blockquote formula panels ────────────────────────────────────────────────

/**
 * Authors write the "key facts" panels as a blockquote with one formula per
 * line:
 *
 *     > **Distance** $AB=\sqrt{…}$
 *     > **Midpoint** $M=(…)$
 *
 * Markdown treats those as soft breaks and joins them into one paragraph, which
 * on the topic pages rendered as a single run-on line of maths. Inside a
 * blockquote the line breaks are the whole point, so make them hard.
 *
 * Scoped to blockquotes on purpose: forcing hard breaks everywhere would also
 * split ordinary wrapped prose.
 */
export function hardBreaksInBlockquotes(tree: Root): void {
  const walk = (node: Parent, inQuote: boolean) => {
    for (const child of node.children) {
      if (inQuote && child.type === 'paragraph') breakLines(child);
      if ('children' in child) {
        walk(child as Parent, inQuote || child.type === 'blockquote');
      }
    }
  };
  walk(tree, false);
}

function breakLines(paragraph: Paragraph): void {
  const out: PhrasingContent[] = [];
  for (const child of paragraph.children) {
    if (child.type !== 'text' || !child.value.includes('\n')) {
      out.push(child);
      continue;
    }
    const lines = child.value.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) out.push({ type: 'break' });
      const value = i === 0 ? line : line.replace(/^\s+/, '');
      if (value) out.push({ ...child, value });
    });
  }
  paragraph.children = out;
}

/** The notes-only remark plugin: run after remark-math and remark-gfm. */
export const remarkNotesBlocks: Plugin<[], Root> = () => (tree: Root) => {
  hardBreaksInBlockquotes(tree);
  groupNotesBlocks(tree);
};
