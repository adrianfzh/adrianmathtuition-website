import { describe, it, expect } from 'vitest';
import {
  groupPracticeTodo, todoState, sectionFor, visibleToStudent, todoTotals, todoStateLabel, todoSubtitle, sourceRunIds,
  TODO_SECTIONS,
} from './practice-todo';
import type { AssignmentRow } from './assignments';

let n = 0;
function row(over: Partial<AssignmentRow> = {}): AssignmentRow {
  n++;
  return {
    id: `a${n}`, airtable_student_id: 'recAbCdEfGhIjKlMn', kind: 'question', question_id: null, title: `Item ${n}`,
    topic: null, level: null, tier: null, note: null, reminder: null, source_run_id: null, pdf_url: null, pdf_source: null,
    due_on: null, status: 'assigned', attempt_id: null, run_id: null, score: null, out_of: null,
    created_at: `2026-09-0${(n % 9) + 1}T00:00:00Z`, submitted_at: null, marked_at: null, revoked_at: null,
    source: 'adrian', skill_title: null, subject: null, sheet_job_id: null, sheet_index: null,
    question_text: null, answer_latex: null, marks: null,
    ...over,
  };
}

describe('todoState + sectionFor', () => {
  it('maps the live statuses and hides held/revoked', () => {
    expect(todoState('assigned')).toBe('todo');
    expect(todoState('submitted')).toBe('done');
    expect(todoState('marked')).toBe('marked');
    expect(todoState('held')).toBeNull();
    expect(todoState('revoked')).toBeNull();
  });
  it('an unknown or missing source is Adrian\'s (every pre-build row)', () => {
    expect(sectionFor('practice-again')).toBe('practice-again');
    expect(sectionFor('find')).toBe('find');
    expect(sectionFor('adrian')).toBe('adrian');
    expect(sectionFor(null)).toBe('adrian');
    expect(sectionFor('something-else')).toBe('adrian');
  });
});

describe('visibleToStudent — held rows never, subject-gated rows only for that subject', () => {
  const em = { subjects: ['E Math'], level: 'Sec 4' };
  it('hides held and revoked regardless of subject', () => {
    expect(visibleToStudent({ status: 'held', subject: null }, em)).toBe(false);
    expect(visibleToStudent({ status: 'revoked', subject: 'E Math' }, em)).toBe(false);
  });
  it('a row with no subject, or Other, is shown; an A Math row is hidden from an E Math-only account', () => {
    expect(visibleToStudent({ status: 'assigned', subject: null }, em)).toBe(true);
    expect(visibleToStudent({ status: 'assigned', subject: 'Other' }, em)).toBe(true);
    expect(visibleToStudent({ status: 'assigned', subject: 'E Math' }, em)).toBe(true);
    expect(visibleToStudent({ status: 'assigned', subject: 'A Math' }, em)).toBe(false);
    expect(visibleToStudent({ status: 'assigned', subject: 'A Math' }, { subjects: ['E Math', 'A Math'], level: 'Sec 4' })).toBe(true);
    expect(visibleToStudent({ status: 'assigned', subject: 'H2 Math' }, { subjects: ['Math'], level: 'JC2' })).toBe(true);
  });
});

describe('groupPracticeTodo — three sections, to-do first, newest first within a band', () => {
  const rows = [
    row({ source: 'adrian', status: 'marked', score: 3, out_of: 5, created_at: '2026-09-05T00:00:00Z' }),
    row({ source: 'adrian', status: 'assigned', created_at: '2026-09-01T00:00:00Z' }),
    row({ source: 'adrian', status: 'assigned', created_at: '2026-09-03T00:00:00Z' }),
    row({ source: 'practice-again', status: 'held', created_at: '2026-09-06T00:00:00Z' }),          // never shown
    row({ source: 'practice-again', status: 'assigned', skill_title: 'Chain rule', created_at: '2026-09-04T00:00:00Z' }),
    row({ source: 'practice-again', status: 'submitted', created_at: '2026-09-06T00:00:00Z' }),
    row({ source: 'find', status: 'assigned', tier: 'same skill', created_at: '2026-09-02T00:00:00Z' }),
    row({ source: 'adrian', status: 'revoked', created_at: '2026-09-06T00:00:00Z' }),               // never shown
  ];
  const sections = groupPracticeTodo(rows);

  it('returns every section in display order, empty or not', () => {
    expect(sections.map(s => s.key)).toEqual(TODO_SECTIONS.map(s => s.key));
    expect(sections.map(s => s.title)).toEqual(['From Adrian', 'Practice Again', 'Found by you']);
  });
  it('drops held and revoked rows', () => {
    const all = sections.flatMap(s => s.items);
    expect(all).toHaveLength(6);
    expect(all.some(i => i.status === 'held' || i.status === 'revoked')).toBe(false);
  });
  it('orders to do → being marked → marked, newest first inside each', () => {
    const adrian = sections[0].items;
    expect(adrian.map(i => [i.state, i.created_at.slice(0, 10)])).toEqual([
      ['todo', '2026-09-03'], ['todo', '2026-09-01'], ['marked', '2026-09-05'],
    ]);
    const again = sections[1].items;
    expect(again.map(i => i.state)).toEqual(['todo', 'done']);
    expect(sections[2].items.map(i => i.state)).toEqual(['todo']);
  });
  it('counts per section and in total', () => {
    expect(sections[0].counts).toEqual({ todo: 2, done: 0, marked: 1 });
    expect(sections[1].counts).toEqual({ todo: 1, done: 1, marked: 0 });
    expect(todoTotals(sections)).toEqual({ todo: 4, done: 1, marked: 1 });
  });
  it('handles no rows at all', () => {
    const empty = groupPracticeTodo([]);
    expect(empty).toHaveLength(3);
    expect(empty.every(s => s.items.length === 0)).toBe(true);
    expect(todoTotals(empty)).toEqual({ todo: 0, done: 0, marked: 0 });
  });
});

describe('labels', () => {
  it('todoStateLabel', () => {
    expect(todoStateLabel('todo', { score: null, out_of: null })).toBe('To do');
    expect(todoStateLabel('done', { score: null, out_of: null })).toBe('Being marked');
    expect(todoStateLabel('marked', { score: 4, out_of: 5 })).toBe('Marked · 4/5');
    expect(todoStateLabel('marked', { score: null, out_of: null })).toBe('Marked');
  });
  it('todoSubtitle names the paper for Practice Again, the tier for Found by you, topic · tier for Adrian', () => {
    expect(todoSubtitle({ source: 'practice-again', topic: 'Differentiation', tier: null, skill_title: 'Chain rule' }, 'AM 2021 P1')).toBe('From AM 2021 P1 · Differentiation');
    expect(todoSubtitle({ source: 'practice-again', topic: null, tier: null, skill_title: null }, null)).toBe('');
    expect(todoSubtitle({ source: 'find', topic: 'Vectors', tier: 'same skill', skill_title: null })).toBe('same skill · Vectors');
    expect(todoSubtitle({ source: 'adrian', topic: 'Vectors', tier: 'Advanced', skill_title: null })).toBe('Vectors · Advanced');
  });
  it('sourceRunIds collects Practice Again runs only, deduped', () => {
    expect(sourceRunIds([
      { source: 'practice-again', source_run_id: 'r1' }, { source: 'practice-again', source_run_id: 'r1' },
      { source: 'practice-again', source_run_id: 'r2' }, { source: 'adrian', source_run_id: 'r3' },
      { source: 'practice-again', source_run_id: null },
    ])).toEqual(['r1', 'r2']);
  });
});
