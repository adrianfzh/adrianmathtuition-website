import { describe, it, expect } from 'vitest';
import { pickSuperseded, normalisePaperName, type SupersedeRun } from './marking-supersede';

const run = (o: Partial<SupersedeRun> & { id: string; created_at: string }): SupersedeRun => ({
  student_id: 'recAAA',
  paper_name: '2021 OLevel Amath Paper 1',
  superseded_by: null,
  ...o,
});

describe('normalisePaperName', () => {
  it('ignores case, padding and repeated spaces', () => {
    expect(normalisePaperName('  2021  OLevel   Amath Paper 1 ')).toBe('2021 olevel amath paper 1');
    expect(normalisePaperName(null)).toBe('');
  });
});

describe('pickSuperseded', () => {
  it('replaces the earlier marking of the same paper for the same student', () => {
    // Alessi Tay, 2026-08-30: first pass 38/66, re-mark 50/90 the next morning.
    const older = run({ id: 'b7cf61ba', created_at: '2026-08-29T08:44:00Z' });
    const winner = run({ id: '22a895ea', created_at: '2026-08-30T00:36:00Z' });
    expect(pickSuperseded(winner, [older, winner])).toEqual(['b7cf61ba']);
  });

  it('never supersedes a NEWER run', () => {
    const newer = run({ id: 'later', created_at: '2026-08-31T00:00:00Z' });
    const winner = run({ id: 'winner', created_at: '2026-08-30T00:00:00Z' });
    expect(pickSuperseded(winner, [newer, winner])).toEqual([]);
  });

  it("never supersedes another student's paper of the same name", () => {
    // "worksheet (10 photos)" sits on eight runs from different students —
    // paper_name alone must never be enough to replace a run.
    const theirs = run({ id: 'theirs', student_id: 'recBBB', paper_name: 'worksheet (10 photos)', created_at: '2026-08-01T00:00:00Z' });
    const winner = run({ id: 'mine', paper_name: 'worksheet (10 photos)', created_at: '2026-08-02T00:00:00Z' });
    expect(pickSuperseded(winner, [theirs, winner])).toEqual([]);
  });

  it('supersedes nothing when the winner is untagged', () => {
    const older = run({ id: 'older', student_id: null, created_at: '2026-08-01T00:00:00Z' });
    const winner = run({ id: 'winner', student_id: null, created_at: '2026-08-02T00:00:00Z' });
    expect(pickSuperseded(winner, [older, winner])).toEqual([]);
  });

  it('supersedes nothing when the paper has no name', () => {
    const older = run({ id: 'older', paper_name: null, created_at: '2026-08-01T00:00:00Z' });
    const winner = run({ id: 'winner', paper_name: '  ', created_at: '2026-08-02T00:00:00Z' });
    expect(pickSuperseded(winner, [older, winner])).toEqual([]);
  });

  it('leaves alone a run something else already replaced', () => {
    const already = run({ id: 'already', created_at: '2026-08-01T00:00:00Z', superseded_by: 'someone' });
    const open = run({ id: 'open', created_at: '2026-08-02T00:00:00Z' });
    const winner = run({ id: 'winner', created_at: '2026-08-03T00:00:00Z' });
    expect(pickSuperseded(winner, [already, open, winner])).toEqual(['open']);
  });

  it('matches across casing drift between a hand-typed and a bot-written name', () => {
    const older = run({ id: 'older', paper_name: 'eva em tys 2022 p2', created_at: '2026-08-30T13:48:00Z' });
    const winner = run({ id: 'winner', paper_name: 'Eva EM TYS 2022 P2 ', created_at: '2026-08-30T16:41:00Z' });
    expect(pickSuperseded(winner, [older, winner])).toEqual(['older']);
  });

  it('replaces every earlier pass, not just the last one', () => {
    const a = run({ id: 'a', created_at: '2026-08-28T09:36:00Z' });
    const b = run({ id: 'b', created_at: '2026-08-28T10:27:00Z' });
    const winner = run({ id: 'w', created_at: '2026-08-28T14:22:00Z' });
    expect(pickSuperseded(winner, [a, b, winner]).sort()).toEqual(['a', 'b']);
  });

  it('ignores a run with an unparseable timestamp instead of guessing order', () => {
    const junk = run({ id: 'junk', created_at: 'not a date' });
    const winner = run({ id: 'winner', created_at: '2026-08-30T00:00:00Z' });
    expect(pickSuperseded(winner, [junk, winner])).toEqual([]);
  });
});
