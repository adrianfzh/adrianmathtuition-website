import { describe, it, expect } from 'vitest';
import { summariseAutoReleases } from './auto-release-report';

const row = (id: string, overrides: { awarded: number; previous: number }[] = [], checked = false) => ({
  id, student_name: 'S ' + id, paper_name: 'P', released_at: '2026-09-08T00:00:00Z', checked_at: checked ? '2026-09-08T01:00:00Z' : null,
  result_json: { results: ([...overrides.map(o => ({ triage_override: o })), {}] as unknown[]) },
});

describe('summariseAutoReleases (8 Sep 2026)', () => {
  it('counts releases, after-the-fact changes and the mark delta', () => {
    const r = summariseAutoReleases([row('a'), row('b', [{ awarded: 1, previous: 2 }, { awarded: 3, previous: 3 }], true), row('c')]);
    expect(r.released).toBe(3); expect(r.changed).toBe(1); expect(r.looked).toBe(1);
    expect(r.changes[0]).toEqual({ student: 'S b', paper: 'P', questions: 2, delta: -1 });
    expect(r.shouldPause).toBe(false);
    expect(r.telegram).toContain('3 papers went to students on their own · 1 changed by you afterwards');
  });
  it('pauses when five or more went out and more than one in ten changed', () => {
    const rows = [row('a', [{ awarded: 0, previous: 1 }]), row('b'), row('c'), row('d'), row('e')];
    expect(summariseAutoReleases(rows).shouldPause).toBe(true);
    expect(summariseAutoReleases(rows.slice(0, 4)).shouldPause).toBe(false);
    expect(summariseAutoReleases([]).telegram).toContain('0 papers');
  });
});
