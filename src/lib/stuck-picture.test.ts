import { describe, expect, it } from 'vitest';
import { buildStuckPicture, groupLabel, isGap, isRising, materialSlug, planMaterials, stuckMessage, type AskEvent, type LossEvent, type StuckStudent } from './stuck-picture';

const NOW = new Date('2026-10-04T11:00:00Z'); // Sunday 7pm SGT
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const students: StuckStudent[] = [
  { id: 'recAAAAAAAAAAAAAA1', name: 'Eva Tan', level: 'Sec 4', subjects: ['AM', 'EM'], active: true },
  { id: 'recAAAAAAAAAAAAAA2', name: 'Chloe Lim', level: 'Sec 4', subjects: ['AM', 'EM'], active: true },
  { id: 'recAAAAAAAAAAAAAA3', name: 'Ryan Ng', level: 'Sec 4', subjects: ['AM'], active: true },
  { id: 'recAAAAAAAAAAAAAA4', name: 'Old Boy', level: 'Sec 4', subjects: ['AM'], active: false },
  { id: 'recAAAAAAAAAAAAAA5', name: 'Jo Teo', level: 'Sec 2', subjects: ['EM'], active: true },
];
const [eva, chloe, ryan, , jo] = students.map((s) => s.id);

const ask = (studentId: string, d: number, topic: string, subject: AskEvent['subject'] = 'AM', skill?: string, subgroupId?: number): AskEvent =>
  ({ studentId, at: daysAgo(d), subject, topic, skill, subgroupId });
const loss = (studentId: string, d: number, text: string, subject: LossEvent['subject'] = 'AM', key?: string): LossEvent =>
  ({ studentId, at: daysAgo(d), subject, text, key });

describe('rules', () => {
  it('a gap needs both signals', () => {
    expect(isGap({ asks: 3, losses: 0, bothStudents: [], askStudents: ['a', 'b', 'c'], lossStudents: [] })).toBe(false);
    expect(isGap({ asks: 1, losses: 1, bothStudents: ['a'], askStudents: ['a'], lossStudents: ['a'] })).toBe(true);
    expect(isGap({ asks: 1, losses: 1, bothStudents: [], askStudents: ['a'], lossStudents: ['b'] })).toBe(false);
    expect(isGap({ asks: 2, losses: 1, bothStudents: [], askStudents: ['a', 'b'], lossStudents: ['c'] })).toBe(true);
  });
  it('rising = 3+ and more than double the usual week', () => {
    expect(isRising(3, 0)).toBe(true);
    expect(isRising(2, 0)).toBe(false);
    expect(isRising(4, 2)).toBe(false);
    expect(isRising(5, 2)).toBe(true);
  });
  it('labels', () => {
    expect(groupLabel('Sec 4', 'AM')).toBe('Sec 4 A Math');
    expect(groupLabel('Sec 2', 'EM')).toBe('Sec 2 Math');
    expect(groupLabel('JC2', 'H2')).toBe('JC2 H2 Math');
    expect(materialSlug('Trigonometry', 'Sec 4', 'AM')).toBe('trigonometry-sec4-am');
    expect(materialSlug('Algebra (Fractions)', 'Sec 2', 'EM')).toBe('algebra-fractions-sec2-em');
    expect(materialSlug('Percentage, Ratio and Rate', 'Sec 4', 'EM')).toBe('percentage-ratio-rate-sec4-em');
  });
});

describe('buildStuckPicture', () => {
  const asks: AskEvent[] = [
    ask(eva, 1, 'Trigonometry (Identities)', 'AM', 'Proofs using the Pythagorean identity', 11),
    ask(eva, 2, 'Trigonometry (Identities)', 'AM', 'Proofs using the Pythagorean identity', 11),
    ask(chloe, 3, 'Trigonometry (Equations)', 'AM', 'Double-angle identities and equations', 12),
    ask(ryan, 9, 'Trigonometry (Identities)', 'AM'),             // baseline, not this week
    ask(jo, 1, 'Algebra (Fractions)', 'EM'),
    ask(eva, 40, 'Vectors', 'EM'),                                // outside both windows
    ask('recNOTASTUDENT0000', 1, 'Vectors', 'EM'),                // not on the roster
  ];
  const losses: LossEvent[] = [
    loss(eva, 2, 'Trigonometric identities — proving an identity', 'AM', 'p1|Q3'),
    loss(eva, 2, 'Trigonometric identities — proving an identity', 'AM', 'p1|Q3'), // a re-mark: same key
    loss(ryan, 4, 'Trigonometric equations', 'AM'),
    loss(ryan, 4, 'Kinematics — differentiation', 'AM'),
    loss(chloe, 5, 'Compound interest', 'EM'),
    loss(chloe, 5, 'Not identified', 'EM'),
  ];
  const p = buildStuckPicture({ students, asks, losses, now: NOW });

  it('counts the week and drops what is not', () => {
    expect(p.totals).toEqual({ asks: 4, losses: 4, lossesUnmapped: 1, students: 4 });
  });

  it('finds trigonometry as the Sec 4 A Math gap, with the sub-skill', () => {
    const g = p.groups.find((x) => x.label === 'Sec 4 A Math')!;
    expect(g.roster).toEqual([eva, chloe, ryan]);   // the inactive student is not sent work
    const trig = g.areas[0];
    expect(trig.area).toBe('Trigonometry');
    expect(trig.gap).toBe(true);
    expect(trig.asks).toBe(3);
    expect(trig.askStudents).toEqual([chloe, eva].sort());
    expect(trig.losses).toBe(2);
    expect(trig.bothStudents).toEqual([eva]);
    expect(trig.skills[0]).toEqual({ name: 'Proofs using the Pythagorean identity', n: 2, subgroupId: 11 });
    expect(trig.topics[0].name).toBe('Trigonometry (Identities)');
    expect(trig.baselinePerWeek).toBe(0.25);
    expect(p.gaps.map((x) => x.area)).toEqual(['Trigonometry']);
  });

  it('names students who asked twice or asked and lost', () => {
    const l = p.students.find((s) => s.area === 'Trigonometry')!;
    expect(l.names).toEqual(['Eva Tan']);
    expect(l.asks).toBe(2);
    expect(l.losses).toBe(1);
  });

  it('plans one sheet per gap, with both recipient lists', () => {
    const m = planMaterials(p);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      slug: 'trigonometry-sec4-am', subject: 'AM', level: 'Sec 4',
      topics: ['Trigonometry (Identities)', 'Trigonometry (Equations)'],   // the second is close enough → one chapter sheet
      stuckStudents: [chloe, eva].sort(),   // Ryan lost one trig question: an ordinary paper, not stuck
      groupStudents: [eva, chloe, ryan],
      subgroupIds: [11, 12],
    });
  });

  it('words one plain message: background, then what is ready', () => {
    const plan = planMaterials(p);
    const msg = stuckMessage(p, plan.map((x) => ({ ...x, ok: true, title: 'A Math: Trigonometry (Identities)', count: 10, pdfUrl: 'https://x/y.pdf' })));
    expect(msg).toContain('Sec 4 A Math:');
    expect(msg).toContain('2 students asked about trigonometry (mostly "Proofs using the Pythagorean identity"); 1 of them also lost marks on it in papers (2 students in all).');
    expect(msg).toContain('Eva Tan (Sec 4 A Math): trigonometry, asked 2 times, lost marks on 1 question.');
    expect(msg).toContain('Ready for you (nothing sent yet):');
    expect(msg).toContain('Say "send trigonometry-sec4-am" for the 2 students stuck on it, or "send trigonometry-sec4-am to all" for all 3 in Sec 4 A Math.');
    expect(msg).not.toMatch(/undefined|NaN/);
  });

  it('one student who asked and lost reads plainly', async () => {
    const { areaLine } = await import('./stuck-picture');
    const base = { subject: 'EM' as const, area: 'Quadratic Equations', asks: 1, losses: 6, baselinePerWeek: 1, topics: [], skills: [], lossCounts: {}, gap: true, rising: false, isNew: false, score: 0 };
    expect(areaLine({ ...base, askStudents: ['a'], lossStudents: ['a', 'b', 'c'], bothStudents: ['a'] }))
      .toBe('1 student asked about quadratic equations; that student and 2 others lost marks on it in papers too.');
    expect(areaLine({ ...base, askStudents: ['a'], lossStudents: ['a'], bothStudents: ['a'] }))
      .toBe('1 student asked about quadratic equations; the same student lost marks on it in papers too.');
  });

  it('a quiet week still says so', () => {
    const q = buildStuckPicture({ students, asks: [], losses: [], now: NOW });
    expect(stuckMessage(q, [])).toMatch(/Quiet week/);
    expect(planMaterials(q)).toEqual([]);
  });

  it('marks a topic new when the four weeks before had none', () => {
    const r = buildStuckPicture({ students, asks: [ask(eva, 1, 'Vectors', 'EM'), ask(chloe, 2, 'Vectors', 'EM'), ask(chloe, 3, 'Vectors', 'EM')], losses: [], now: NOW });
    expect(r.rising.map((x) => [x.area, x.isNew])).toEqual([['Vectors', true]]);
  });

  it('twin focus covers A Math AND E Math even when every sheet is A Math', async () => {
    const { twinFocusFor } = await import('./stuck-picture');
    const r = buildStuckPicture({
      students,
      asks: [
        ask(eva, 1, 'Trigonometry (Identities)', 'AM', 'Proofs', 11), ask(chloe, 2, 'Trigonometry (Identities)', 'AM', 'Proofs', 11),
        ask(eva, 2, 'Vectors', 'EM', 'Column vectors', 21), ask(chloe, 3, 'Vectors', 'EM', 'Parallel vectors', 22),
      ],
      losses: [loss(eva, 1, 'Trigonometry (Identities)', 'AM', 'k1'), loss(eva, 2, 'Trigonometry (Identities)', 'AM', 'k2')],
      now: NOW,
    });
    const plan = planMaterials(r).filter((m) => m.subject === 'AM');
    const f = twinFocusFor(r, plan);
    expect(f.filter((x) => x.subject === 'AM').map((x) => x.subgroupId)).toEqual([11]);
    expect(f.filter((x) => x.subject === 'EM').map((x) => x.subgroupId).sort()).toEqual([21, 22]);
    // no duplicates, and nothing invented for a subject with no filed asks
    expect(new Set(f.map((x) => x.subgroupId)).size).toBe(f.length);
    expect(twinFocusFor(buildStuckPicture({ students, asks: [], losses: [], now: NOW }), [])).toEqual([]);
  });
});
