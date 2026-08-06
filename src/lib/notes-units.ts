// ── Notes portal: learning_units as page content ─────────────────────────────
//
// /notes has always read `content_snippets` — a flat list of worked examples
// whose structure lives inside the markdown (`**Step 1.**`) and has to be parsed
// back out by `notes-blocks.ts`. `learning_units` holds the same teaching in the
// shape it was authored in: one row per idea, a `kind` saying what that idea is
// for, and a typed JSON payload. No parsing, and three kinds of content that
// have no equivalent in the snippets table at all — quick checks, spot-the-error
// autopsies, and practice sets.
//
// This module is the pure half: row → renderable unit, and the grouping that
// turns a topic's units into pages. I/O lives in `notes-data.ts`, rendering in
// `app/notes/NotesUnits.tsx`.

import type {
  AutopsyPayload,
  CheckPayload,
  CorePayload,
  ExamplePayload,
  TryPayload,
  UnitKind,
} from './learn-types';
import { topicSlug } from './topic-slug';

/** A `learning_units` row, as selected by `notes-data`. */
export interface UnitRow {
  id: string;
  topic: string;
  kind: string;
  title: string;
  unit_order: number | null;
  status: string | null;
  payload: unknown;
}

export interface NotesUnit {
  id: string;
  kind: UnitKind;
  title: string;
  /**
   * Question-form title (`payload.title_q`), when the style pass has written
   * one — "How do I find a specific term without expanding?" against a stored
   * title of "The general term T(r+1)". Section headings prefer it: students
   * navigate by the question they have, not by the name of the technique.
   */
  question: string | null;
  order: number;
  /** Not yet approved — rendered for Adrian, filtered out for students. */
  draft: boolean;
  /** Flagged in review (`status = 'rejected'`): hidden from students until fixed. */
  flagged: boolean;
  payload: unknown;
}

/**
 * Plain name for each kind. Still what `stripKindPrefix` matches against —
 * stored titles say "Worked example: …", not the display label below.
 */
export const KIND_LABEL: Record<UnitKind, string> = {
  core: 'Concept',
  example: 'Worked example',
  check: 'Quick check',
  autopsy: 'Spot the error',
  try: 'Practice',
};

/**
 * What the block header bar says. Emoji went from unusable to load-bearing in
 * the v3 redesign: the old design set kind chips at 10px where an emoji is a
 * muddy blob, the solid colour bars set them at 13.5px on their own colour
 * field, where they scan as the block's icon.
 */
export const KIND_DISPLAY: Record<UnitKind, string> = {
  core: '💡 The Big Idea',
  example: '✏️ Worked Example',
  check: '✅ Quick Check',
  autopsy: '🔍 Spot the Error',
  try: '💪 Your Turn',
};

const KINDS = Object.keys(KIND_LABEL) as UnitKind[];

function isKind(value: string): value is UnitKind {
  return (KINDS as string[]).includes(value);
}

/**
 * Shape one row, or null if it can't be rendered — an unknown `kind` has no
 * block component, and a payload that isn't an object would throw in the
 * renderer. Dropping the row is right: the topic still reads, one idea short.
 */
export function toUnit(row: UnitRow): NotesUnit | null {
  if (!isKind(row.kind)) return null;
  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    return null;
  }
  const titleQ = (row.payload as { title_q?: unknown }).title_q;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    question: typeof titleQ === 'string' && titleQ.trim() ? titleQ.trim() : null,
    order: row.unit_order ?? 0,
    draft: row.status !== 'approved',
    flagged: row.status === 'rejected',
    payload: row.payload,
  };
}

// ── Sections ─────────────────────────────────────────────────────────────────

export interface UnitSection {
  /** Anchor id for the table of contents. */
  id: string;
  title: string;
  /** The `core` unit that opens the section, if it has one. */
  lead: NotesUnit | null;
  /** Everything taught under it, in order — examples, checks, autopsies, try. */
  units: NotesUnit[];
}

const FIRST_SECTION = 'Start here';

/**
 * Split a topic's units into readable sections, in teaching order.
 *
 * The sequence itself carries the structure: a `core` unit states an idea and
 * the examples, autopsies, checks and practice after it work that idea until the
 * next `core` changes the subject. So a `core` opens a section and everything up
 * to the next one belongs to it. Binomial Theorem's 52 units come out as 11
 * sections of four or five, which is what makes a page that long navigable — one
 * flat list of 52 blocks is a wall, and one entry per unit is a 52-line contents.
 *
 * Ordering is `unit_order`, whose integer part happens to be the source lesson
 * (Binomial Theorem is 112.01 … 112.52, all from `AM 12 Binomial Theorem.pdf`).
 * Nothing here depends on that — it's a naming convention on a float, not a
 * column, and a topic spanning two lessons still sorts into one correct sequence.
 */
export function groupIntoSections(units: NotesUnit[]): UnitSection[] {
  const ordered = [...units].sort((a, b) => a.order - b.order);
  const sections: UnitSection[] = [];
  const used = new Set<string>();

  const open = (title: string, lead: NotesUnit | null) => {
    // Two `core` units sharing a title would otherwise share an anchor, and the
    // contents would scroll to the wrong one.
    const base = `unit-${topicSlug(title) || 'section'}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    sections.push({ id, title, lead, units: [] });
  };

  for (const unit of ordered) {
    if (unit.kind === 'core' || sections.length === 0) {
      const isCore = unit.kind === 'core';
      open(isCore ? (unit.question ?? unit.title) : FIRST_SECTION, isCore ? unit : null);
      if (isCore) continue;
    }
    sections[sections.length - 1].units.push(unit);
  }
  return sections;
}

/**
 * The student's view of a topic: approved units only. A section whose lead is
 * still draft keeps its heading (the units under it need their context) but
 * loses the lead body; a section with nothing approved at all disappears.
 * Flagged units are `draft` too, so one filter covers both.
 */
export function approvedSections(sections: UnitSection[]): UnitSection[] {
  return sections
    .map(s => ({
      ...s,
      lead: s.lead && !s.lead.draft ? s.lead : null,
      units: s.units.filter(u => !u.draft),
    }))
    .filter(s => s.lead !== null || s.units.length > 0);
}

/** Whether any unit in these sections has been approved. */
export function hasApprovedUnits(sections: UnitSection[]): boolean {
  return sections.some(s => (s.lead && !s.lead.draft) || s.units.some(u => !u.draft));
}

/**
 * Reading time for one section, in whole minutes. Deliberately coarse — the
 * chip exists to say "this is a 3-minute read, not homework", so it only has
 * to be believable, and a per-word count over KaTeX source is not more honest.
 */
export function readingMinutes(section: UnitSection): number {
  const n = section.units.length + (section.lead ? 1 : 0);
  return Math.max(2, Math.ceil(n * 0.6));
}

/**
 * A core lead's prose, one sentence per bullet — the SME register: short lines
 * a student can hold, instead of a paragraph they skim. Returns null when the
 * prose shouldn't be touched: already-structured markdown (lists, headings,
 * fences, display math) renders as authored, and a single sentence gains
 * nothing from a lone bullet.
 */
export function leadToBullets(md: string): string | null {
  if (!md || md.includes('$$')) return null;
  if (/^\s*([-*+]\s|\d+\.\s|#|```|\|)/m.test(md)) return null;

  // Mask inline math so a full stop inside $…$ can't end a sentence.
  const spans: string[] = [];
  const masked = md.replace(/\$[^$\n]*\$/g, m => {
    spans.push(m);
    return `\u0000${spans.length - 1}\u0000`;
  });

  const sentences = masked
    .split(/\n{2,}/)
    .flatMap(p => p.split(/(?<=[.!?])\s+(?=[A-Z([\d\u0000])/))
    .map(s => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (sentences.length < 2) return null;

  const unmask = (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)]);
  return sentences.map(s => `- ${unmask(s)}`).join('\n');
}

/** How many units of each kind a topic has, for the page's summary pills. */
export function countByKind(units: NotesUnit[]): Record<UnitKind, number> {
  const counts = Object.fromEntries(KINDS.map(k => [k, 0])) as Record<UnitKind, number>;
  for (const unit of units) counts[unit.kind] += 1;
  return counts;
}

// ── Payload accessors ────────────────────────────────────────────────────────
//
// The block components take `unknown` and narrow here, so a payload that drifts
// from its schema renders short rather than throwing the page away. Every field
// is optional in practice: `core` units carry `formula_md` only when there is a
// formula, `example` steps carry `annotation_md` only when a step needs one.

export const asCore = (p: unknown) => p as CorePayload;
export const asExample = (p: unknown) => p as ExamplePayload;
export const asCheck = (p: unknown) => p as CheckPayload;
export const asTry = (p: unknown) => p as TryPayload;
export const asAutopsy = (p: unknown) => p as AutopsyPayload;

/**
 * Sanitise an authored SVG figure for inline rendering: drop `<script>` and any
 * `on*` handler attribute, and refuse anything that isn't an `<svg>` element.
 *
 * The figures are Adrian's own, written by the ingest pipeline and gated behind
 * learn-review — but they reach the DOM through `dangerouslySetInnerHTML`, so
 * the strip is the same defensive one the review page applies, lifted out where
 * it can be tested.
 */
export function sanitiseFigure(svg: string | undefined): string | null {
  if (!svg) return null;
  const clean = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  return /^\s*<svg[\s>]/i.test(clean) ? clean : null;
}

/**
 * Which working line an autopsy marks wrong, as a 0-based index — or -1 when
 * the payload's 1-based `wrong_line` points outside the working it shipped with.
 */
export function wrongIndex(payload: AutopsyPayload): number {
  const lines = payload.working ?? [];
  const n = payload.wrong_line;
  if (typeof n !== 'number' || !Number.isInteger(n)) return -1;
  return n >= 1 && n <= lines.length ? n - 1 : -1;
}

/**
 * Drop a title's leading restatement of its own kind, so the chip and the
 * heading don't say the same thing twice — "Spot the error: the copy-pasted
 * calculator lines" reads as the chip plus "The copy-pasted calculator lines".
 *
 * Only an exact kind-label prefix goes. Adrian's own numbering survives:
 * "Example 2a" and "Practice 3 Q1" are what he calls them out loud in a lesson,
 * so a student searching the page for "Practice 3" has to find it.
 */
export function stripKindPrefix(title: string, kind: UnitKind): string {
  const label = KIND_LABEL[kind];
  const rest = title.slice(label.length).replace(/^\s*[:—–-]\s*/, '');
  const prefixed =
    title.slice(0, label.length).toLowerCase() === label.toLowerCase() &&
    rest.length > 0 &&
    rest !== title;
  if (!prefixed) return title;
  return rest[0].toUpperCase() + rest.slice(1);
}
