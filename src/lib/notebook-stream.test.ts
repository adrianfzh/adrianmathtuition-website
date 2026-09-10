import { describe, expect, it } from 'vitest';
import { buildStreamItems, filterStream } from './notebook-stream';
import type { MistakeRow } from './notebook-mistakes-store';
import type { SaveRow } from './notebook-saves';
import type { MyNoteRow } from './portal-notes';

const mistake = (over: Partial<MistakeRow>): MistakeRow => ({
  id: 'm1', airtable_student_id: 'rec1', subject: 'AM', title: 'Sign slip in Vectors', error_kind: 'sign', topic: 'Vectors',
  state: 'dark', seen_count: 3, clean_count: 0, came_back: false, evidence: [{ kind: 'paper', ref: 'r1|7', label: 'Q7', paper: 'Prelim P1', date: '2026-09-01', clean: false }],
  practice_ids: [], last_seen_at: '2026-09-01T00:00:00Z', last_clean_at: null, student_fixed_at: null, ...over,
} as MistakeRow);
const save: SaveRow = { id: 's1', kind: 'ask', source: '1', question_text: 'Express 3 sin x + 4 cos x', answer_text: 'R = 5', image_url: null, title: 'R-formula question', topic: 'Trigonometry', skill: 'R-formula', created_at: '2026-09-10T00:00:00Z' };
const photo: MyNoteRow = { id: 'n1', run_id: null, source_label: 'My photo', topic: null, image_url: 'https://x/api/files/clippings/rec1/photo-abc.jpg', note: 'School notes', created_at: '2026-09-09T00:00:00Z', auto_topic: 'Differentiation', auto_skill: 'Chain rule' };
const page = { id: 'p1', title: 'AM formula sheet', topic: 'Trigonometry', note: 'Keep this', created_at: '2026-09-11T00:00:00Z' };

describe('buildStreamItems', () => {
  const items = buildStreamItems({ mistakes: [mistake({})], practiceFor: () => [], saves: [save], notes: [photo], pages: [page], skills: [] });
  it('makes one item per thing, newest first', () => {
    expect(items.map(i => i.kind)).toEqual(['adrian', 'saved', 'photo', 'mistake']);
  });
  it('carries the right tag and payload per kind', () => {
    expect(items.find(i => i.kind === 'mistake')?.tag).toEqual({ text: 'Still happening', tone: 'rose' });
    expect(items.find(i => i.kind === 'saved')?.tag?.text).toBe('R-formula');
    expect(items.find(i => i.kind === 'photo')?.tag?.text).toBe('Chain rule');
    expect(items.find(i => i.kind === 'adrian')?.href).toBe('/app/assignments/p1');
  });
  it('builds a searchable haystack from everything the item knows, including the guessed topic', () => {
    const ph = items.find(i => i.kind === 'photo')!;
    expect(ph.haystack).toContain('differentiation');
    expect(ph.subtitle).toBe('Photo · Differentiation');
  });
});

describe('filterStream', () => {
  const items = buildStreamItems({ mistakes: [mistake({})], practiceFor: () => [], saves: [save], notes: [photo], pages: [page], skills: [] });
  it('narrows by chip; Photos includes clippings', () => {
    expect(filterStream(items, 'saved', '').map(i => i.id)).toEqual(['saved:s1']);
    expect(filterStream(items, 'photo', '').map(i => i.kind)).toEqual(['photo']);
  });
  it('searches every word against the haystack, case-insensitively', () => {
    expect(filterStream(items, 'all', 'r-formula').map(i => i.kind)).toEqual(['saved']);
    expect(filterStream(items, 'all', 'VECTORS sign').map(i => i.kind)).toEqual(['mistake']);
    expect(filterStream(items, 'all', 'chain').map(i => i.kind)).toEqual(['photo']);
    expect(filterStream(items, 'all', 'nothing here')).toEqual([]);
  });
});
