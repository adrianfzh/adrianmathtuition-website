import { describe, it, expect } from 'vitest';
import { completenessProblems, decide, parseReport, sameAnswer, weeklyMessage, type BankRow, type HealthReport } from './question-health';

const school: BankRow = {
  id: '11111111-1111-1111-1111-111111111111',
  question_text: 'Solve the equation 2x + 3 = 11.',
  parts: [{ label: 'a', text: 'Find x.', marks: 2, answer: '4' }, { label: 'b', text: 'Hence find 3x.', marks: 1, answer: '12' }],
  total_marks: 3, topics: ['Linear Equations'], level: 'S1', school: 'RI', ai_generated: false,
};
const twin: BankRow = { ...school, id: '22222222-2222-2222-2222-222222222222', school: 'AdrianMath', ai_generated: true };

const report = (over: Partial<HealthReport> = {}): HealthReport => ({
  question_id: school.id, solver_model: 'opus', completeness: [], scheme_found: false,
  parts: [{ label: '(a)', ours: '4', solver: '4', agree: true }, { label: '(b)', ours: '12', solver: '12', agree: true }],
  ...over,
});

describe('completenessProblems', () => {
  it('a sound row has none', () => expect(completenessProblems(school)).toEqual([]));
  it('marks that do not add up', () => expect(completenessProblems({ ...school, total_marks: 5 }).map((p) => p.code)).toEqual(['marks']));
  it('words that point at a missing figure', () => {
    expect(completenessProblems({ ...school, question_text: 'In the diagram, ABC is a triangle.' }).map((p) => p.code)).toContain('figure');
    expect(completenessProblems({ ...school, question_text: 'In the diagram, ABC is a triangle.', figure_url: 'x.png' })).toEqual([]);
  });
  it('no key and no solution', () => {
    const q = { ...school, parts: [{ label: 'a', text: 'Find x.', marks: 3 }] };
    expect(completenessProblems(q).map((p) => p.code)).toEqual(['key']);
    expect(completenessProblems({ ...q, solution: 'x = 4' })).toEqual([]);
  });
  it('an unknown level and no topic', () => {
    expect(completenessProblems({ ...school, level: 'P6', topics: [] }).map((p) => p.code).sort()).toEqual(['level', 'topic']);
  });
});

describe('sameAnswer', () => {
  it('numbers to 3 s.f.', () => { expect(sameAnswer('x = 6.708', '6.71')).toBe(true); expect(sameAnswer('6.7', '6.71')).toBe(false); });
  it('written forms ignore spacing and $', () => expect(sameAnswer('$\\dfrac{1}{2}$', '\\frac{1}{2}')).toBe(true));
  it('empty never agrees', () => expect(sameAnswer('', '')).toBe(false));
});

describe('decide', () => {
  it('everything agrees → passed', () => expect(decide(school, report()).status).toBe('passed'));
  it('agrees after a copy fix → fixed', () => expect(decide(school, report(), 1).status).toBe('fixed'));

  it('solver and the school scheme both against our key → key corrected', () => {
    const d = decide(school, report({ scheme_found: true, scheme_source: 'RI 2024 P1 answers p.12', parts: [
      { label: '(a)', ours: '4', solver: '4', agree: true },
      { label: '(b)', ours: '12', solver: '15', scheme: '15', agree: false },
    ] }));
    expect(d.status).toBe('fixed');
    expect(d.edits[0].kind).toBe('key');
    const parts = d.edits[0].after as { answer?: string }[];
    expect(parts[0].answer).toBe('4');
    expect(parts[1].answer).toBe('15');
  });

  it('the solver against the school scheme → paused for Adrian (the moat)', () => {
    const d = decide(school, report({ scheme_found: true, parts: [
      { label: '(a)', ours: '4', solver: '4', agree: true },
      { label: '(b)', ours: '12', solver: '15', scheme: '12', agree: false },
    ] }));
    expect(d.status).toBe('paused');
    expect(d.edits).toEqual([]);
  });

  it('no scheme found and a disagreement → paused, never a guess', () => {
    const d = decide(school, report({ parts: [{ label: '(a)', ours: '4', solver: '5', agree: false }, { label: '(b)', ours: '12', solver: '12', agree: true }] }));
    expect(d.status).toBe('paused');
  });

  it('a one-answer question with a wrong key the scheme confirms', () => {
    const q = { ...school, parts: [], answer: '7', total_marks: 2 };
    const d = decide(q, report({ scheme_found: true, parts: [{ label: 'single', ours: '7', solver: '8', scheme: '8', agree: false }] }));
    expect(d.edits).toEqual([{ field: 'answer', after: '8', kind: 'key', evidence: "the school's scheme" }]);
  });

  it('a copy error with a fix read off the page → edits + checked again', () => {
    const q = { ...school, total_marks: 5 };
    const d = decide(q, report({ fixes: [{ kind: 'copy', field: 'parts', after: school.parts, evidence: 'RI 2024 P1 page 3' }] }));
    expect(d.status).toBe('queued');
    expect(d.requeue).toBe(true);
    expect(d.edits).toHaveLength(1);
  });

  it('a fix with no evidence is ignored → retired', () => {
    const q = { ...school, total_marks: 5 };
    expect(decide(q, report({ fixes: [{ kind: 'copy', field: 'parts', after: [], evidence: '' }] })).status).toBe('retired');
  });

  it('copy fixes stop going round at MAX_CHECKS', () => {
    const q = { ...school, total_marks: 5 };
    expect(decide(q, report({ fixes: [{ kind: 'copy', field: 'parts', after: school.parts, evidence: 'page 3' }] }), 2).status).toBe('retired');
  });

  it('no key at all → paused (Adrian may give one)', () => {
    const q = { ...school, parts: [{ label: 'a', text: 'Find x.', marks: 3 }] };
    expect(decide(q, report()).status).toBe('paused');
  });

  it('our twin with wording trouble: reworded and re-solved → fixed', () => {
    const d = decide(twin, report({ parts: [{ label: '(a)', ours: '4', solver: '5', agree: false }], twin_rewrite: { question_text: 'Solve 2x + 3 = 11 for x.', blind_agrees: true } }));
    expect(d.status).toBe('fixed');
    expect(d.edits[0].kind).toBe('twin-rewrite');
  });

  it('our twin that cannot be saved → retired, never paused', () => {
    expect(decide(twin, report({ parts: [{ label: '(a)', ours: '4', solver: '5', agree: false }] })).status).toBe('retired');
  });

  it('retire wins', () => expect(decide(school, report({ retire: 'out of syllabus' })).status).toBe('retired'));
});

describe('parseReport', () => {
  it('accepts a good report', () => expect(parseReport(report()).ok).toBe(true));
  it('refuses a fix on the answer (keys are the door\'s call, not the worker\'s)', () => {
    const r = parseReport({ ...report(), fixes: [{ kind: 'copy', field: 'answer', after: '5', evidence: 'p.3' }] });
    expect(r.ok).toBe(false);
  });
  it('refuses a bad id', () => expect(parseReport({ ...report(), question_id: 'x' }).ok).toBe(false));
});

describe('weeklyMessage', () => {
  it('off and idle', () => expect(weeklyMessage({ on: false, checked: 0, passed: 0, fixed: 0, paused: 0, pausedWaiting: 0, retired: 0, queued: 0, oldestQueuedHours: null })).toMatch(/switched off/));
  it('counts + the alarm on a stuck queue', () => {
    const m = weeklyMessage({ on: true, checked: 40, passed: 35, fixed: 2, paused: 1, pausedWaiting: 3, retired: 2, queued: 9, oldestQueuedHours: 30 });
    expect(m).toMatch(/Checked: 40 \(35 fine\)/);
    expect(m).toMatch(/is the checker running/);
    expect(m).toMatch(/admin\/question-health/);
  });
});
