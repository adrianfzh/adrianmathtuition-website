import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { A_MATH_EXAM_TOPICS } from './canonical-topics';
import {
  lessonToolsForTopic,
  toolHref,
  toolsForTopic,
  TOOL_SLUG,
  type NotesTool,
} from './notes-tools';
import { topicSlug } from './topic-slug';

// The map is keyed by hand, and both halves of a wrong key fail silently: a
// misspelt topic simply never matches, and a misspelt filename renders an iframe
// pointing at a 404 — no build error, no console error, just an empty box on a
// student's screen. These tests are the only thing that catches either.

const AM_TOPICS = A_MATH_EXAM_TOPICS.flatMap(c => c.topics);

/** Every (topic, tool) pair in the AM map, via the public accessor. */
const ENTRIES: { topic: string; tool: NotesTool }[] = AM_TOPICS.flatMap(topic =>
  toolsForTopic('AM', topic).map(tool => ({ topic, tool })),
);

const publicPath = (tool: NotesTool) =>
  fileURLToPath(new URL(`../../public${toolHref(tool)}`, import.meta.url));

describe('notes-tools', () => {
  it('maps at least one tool (a silently empty map would look like a design choice)', () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it('points every tool at a file that exists in public/tools', () => {
    const missing = ENTRIES.filter(e => !existsSync(publicPath(e.tool))).map(
      e => `${e.topic} → ${toolHref(e.tool)}`,
    );
    expect(missing).toEqual([]);
  });

  it('keys the map on canonical topic names, so nothing is orphaned by a typo', () => {
    // Reached only through the canonical list above, so an unmatched key would
    // hide rather than fail — count the pairs the map actually holds instead.
    const mapped = new Set(ENTRIES.map(e => e.topic));
    for (const topic of mapped) expect(AM_TOPICS).toContain(topic);
  });

  it('gives each tool a title and a blurb', () => {
    for (const { topic, tool } of ENTRIES) {
      expect(tool.title.trim(), `${topic} title`).not.toBe('');
      expect(tool.blurb.trim(), `${topic} blurb`).not.toBe('');
    }
  });

  it('does not embed the same tool under two topics', () => {
    const files = ENTRIES.map(e => e.tool.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('treats lesson tools as a subset of the topic tools', () => {
    for (const topic of AM_TOPICS) {
      const all = toolsForTopic('AM', topic);
      for (const lesson of lessonToolsForTopic('AM', topic)) expect(all).toContain(lesson);
    }
  });

  it('has no lesson tool without a topic to hang the page off', () => {
    const lessons = ENTRIES.filter(e => e.tool.lesson);
    expect(lessons.length).toBeGreaterThan(0);
    for (const { topic } of lessons) expect(toolsForTopic('AM', topic).length).toBeGreaterThan(0);
  });

  it('returns nothing for an unmapped topic or level', () => {
    expect(toolsForTopic('AM', 'Nature of Roots')).toEqual([]);
    expect(toolsForTopic('S1', 'Linear Law')).toEqual([]);
  });

  it('matches the level case-insensitively', () => {
    expect(toolsForTopic('am', 'Linear Law')).toEqual(toolsForTopic('AM', 'Linear Law'));
  });

  // `TOOL_SLUG` lives in the same URL segment as the sub-group slugs, so a
  // sub-group that slugified to `tool` would be unreachable behind the tool page.
  it('reserves a slug no topic can produce for itself', () => {
    expect(topicSlug(TOOL_SLUG)).toBe(TOOL_SLUG);
    for (const topic of AM_TOPICS) expect(topicSlug(topic)).not.toBe(TOOL_SLUG);
  });
});
