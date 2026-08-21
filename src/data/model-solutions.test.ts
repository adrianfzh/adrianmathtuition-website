import { describe, it, expect } from 'vitest';
import {
  MODEL_SOLUTIONS,
  LEVEL_LABELS,
  publishedSolutions,
  findPublishedSolution,
  groupSolutions,
  type ModelSolution,
} from './model-solutions';

const entry = (over: Partial<ModelSolution> = {}): ModelSolution => ({
  slug: 'a',
  title: 'A',
  level: 'S3_AM',
  topic: 'Quadratic Functions',
  published: true,
  question_md: 'q',
  steps: [{ step_md: 's', why_md: 'w' }],
  answer_md: 'ans',
  seo: { description: 'd' },
  ...over,
});

describe('publishedSolutions', () => {
  it('drops drafts', () => {
    const all = [entry(), entry({ slug: 'b', published: false })];
    expect(publishedSolutions(all).map((s) => s.slug)).toEqual(['a']);
  });
});

describe('findPublishedSolution', () => {
  it('finds a published entry by slug', () => {
    expect(findPublishedSolution('a', [entry()])?.slug).toBe('a');
  });

  // A draft must be invisible by URL too, not just absent from the index —
  // the page relies on this returning undefined to 404.
  it('returns undefined for a draft slug', () => {
    expect(findPublishedSolution('b', [entry({ slug: 'b', published: false })])).toBeUndefined();
  });
});

describe('groupSolutions', () => {
  it('groups by level then topic, levels in LEVEL_ORDER, topics alphabetical', () => {
    const all = [
      entry({ slug: 'am-trig', level: 'S3_AM', topic: 'Trigonometry' }),
      entry({ slug: 'am-quad', level: 'S3_AM', topic: 'Quadratic Functions' }),
      entry({ slug: 'em-trig', level: 'S3_EM', topic: 'Trigonometry' }),
    ];
    const groups = groupSolutions(all);
    expect(groups.map((g) => g.level)).toEqual(['S3_EM', 'S3_AM']);
    expect(groups[1].topics.map((t) => t.topic)).toEqual(['Quadratic Functions', 'Trigonometry']);
    expect(groups[1].label).toBe(LEVEL_LABELS.S3_AM);
  });

  it('omits levels with no published entries', () => {
    const groups = groupSolutions([entry({ published: false })]);
    expect(groups).toEqual([]);
  });
});

/**
 * Display math must open a line, with a blank line above it. `**(c)** $$…$$` on
 * a single line renders as literal `$$` text — it shipped that way once, and it
 * is invisible until you look at the page.
 */
function inlineDisplayMathLines(md: string): string[] {
  const lines = md.split('\n');
  return lines.filter((line, i) => {
    if (!line.includes('$$')) return false;
    if (!line.trimStart().startsWith('$$')) return true;
    return i > 0 && lines[i - 1].trim() !== '';
  });
}

describe('the shipped library', () => {
  it('never puts $$ display math inline after text', () => {
    for (const s of MODEL_SOLUTIONS) {
      const blocks = [s.question_md, s.answer_md, ...s.steps.flatMap((t) => [t.step_md, t.why_md])];
      for (const md of blocks) expect(inlineDisplayMathLines(md)).toEqual([]);
    }
  });

  it('has unique slugs', () => {
    const slugs = MODEL_SOLUTIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every published entry an SEO description and at least one annotated step', () => {
    for (const s of publishedSolutions()) {
      expect(s.seo.description.length).toBeGreaterThan(50);
      expect(s.steps.length).toBeGreaterThan(0);
      for (const step of s.steps) {
        expect(step.step_md.trim()).not.toBe('');
        expect(step.why_md.trim()).not.toBe('');
      }
    }
  });
});
