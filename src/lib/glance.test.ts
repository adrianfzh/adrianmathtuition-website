import { describe, it, expect } from 'vitest';
import { ageLabel, buildGlance, etaLabel, extractionEtaHours, overallTone, perDay, sumPerDay, twinsLeft, type GlanceFacts } from './glance';

// 5 Oct 2026, 10:00 SGT
const NOW = Date.parse('2026-10-05T02:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

function facts(over: Partial<GlanceFacts> = {}): GlanceFacts {
  return {
    questionProposals: 0, rulesProposed: 0, shipsFailed: 0, papersToCheck: { papers: 0, parts: 0 }, extractionFlagged: 0, failedHandins: 0, suggestionsNew: 0,
    lessonsToday: [], lessonsToLog: 0, marked: { today: 2, perDay: [1, 0, 3, 2, 0, 1, 2] }, practice: { students: 1, questions: 4, perDay: [0, 0, 0, 0, 0, 0, 4] },
    queue: { waiting: 0, marking: 0, oldestMinutes: null },
    extraction: { waiting: 10, working: 1, held: 5, doneToday: 3, done24h: 24, perDay: [0, 0, 0, 0, 0, 0, 3] },
    twins: { today: 3, perDay: [3, 3, 3, 3, 3, 3, 3], left: { S1: 120, S2: 80 } },
    jobs: { total: 40, late: [], failing: [], lastSelfFix: null },
    logins: [{ name: 'login 1', on: true, fiveHour: 10, sevenDay: 40, at: ago(1) }],
    disk: { pct: 49, at: ago(8) },
    deploys: { website: { sha: 'ffe9396b1234', message: 'x' }, bot: { up: true, uptimeSec: 7200 } },
    backups: { fileBackup: { ok: true, at: ago(6), summary: null }, backupCheck: { ok: true, at: ago(6), summary: null }, leakTest: { ok: true, at: ago(6), summary: null } },
    stuck: { at: ago(8), students: [], scienceGaps: [] },
    cost: { perPaper7d: 1.4, papers7d: 12, monthToDate: 20, month: 'Oct', perDay: [1, 2, 3, 4, 5, 6, 7] },
    ...over,
  };
}
const tile = (g: ReturnType<typeof buildGlance>, id: string) => g.sections.flatMap((s) => s.tiles).find((t) => t.id === id)!;

describe('perDay', () => {
  it('buckets by Singapore day, today last', () => {
    // 23:30 SGT yesterday and 00:30 SGT today fall on different days
    const out = perDay(['2026-10-04T15:30:00Z', '2026-10-04T16:30:00Z', '2026-10-05T01:00:00Z', null, 'junk'], 3, NOW);
    expect(out).toEqual([0, 1, 2]);
  });
  it('drops instants outside the window', () => {
    expect(perDay([ago(24 * 10)], 7, NOW)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it('sumPerDay adds values', () => {
    expect(sumPerDay([{ at: ago(1), value: 1.25 }, { at: ago(1), value: 0.5 }], 2, NOW)).toEqual([0, 1.75]);
  });
});

describe('small words', () => {
  it('ageLabel', () => {
    expect(ageLabel(30_000)).toBe('1 min');
    expect(ageLabel(45 * 60_000)).toBe('45 min');
    expect(ageLabel(5 * 3600_000)).toBe('5 h');
    expect(ageLabel(4 * 86400_000)).toBe('4 days');
  });
  it('extraction ETA at the last day’s pace', () => {
    expect(extractionEtaHours(10, 24)).toBe(10);
    expect(extractionEtaHours(10, 0)).toBeNull();
    expect(extractionEtaHours(0, 24)).toBeNull();
    expect(etaLabel(10)).toBe('about 10 h');
    expect(etaLabel(96)).toBe('about 4 days');
  });
});

describe('twinsLeft — the twin.mjs queue rule', () => {
  it('each open sub-skill wants `per` less what it has; counted once per sub-skill', () => {
    const open = [
      { level: 'S1', subgroupId: 1 }, { level: 'S1', subgroupId: 1 }, // two questions, one sub-skill
      { level: 'S1', subgroupId: 2 },
      { level: 'S2', subgroupId: 3 },
      { level: 'S2', subgroupId: null },
    ];
    const have = new Map([[1, 1], [3, 5]]);
    expect(twinsLeft(open, have, 3)).toEqual({ S1: 2 + 3 });
  });
});

describe('buildGlance', () => {
  it('a clean day has no Needs-you row and reads green', () => {
    const g = buildGlance(facts(), NOW);
    expect(g.sections.map((s) => s.id)).toEqual(['today', 'machine', 'week']);
    expect(overallTone(g)).toBe('green');
  });

  it('Needs you shows only non-zero tiles, each linking through', () => {
    const g = buildGlance(facts({ questionProposals: 77, papersToCheck: { papers: 2, parts: 5 }, extractionFlagged: 0 }), NOW);
    const needs = g.sections[0];
    expect(needs.id).toBe('needs');
    expect(needs.tiles.map((t) => t.id)).toEqual(['papers-to-check', 'question-proposals']);
    expect(needs.tiles.every((t) => t.href)).toBe(true);
    expect(tile(g, 'papers-to-check').sub).toBe('5 parts to look at');
  });

  it('new suggestions show a tile to /admin/suggestions, only when non-zero', () => {
    expect(buildGlance(facts({ suggestionsNew: 0 }), NOW).sections[0].id).toBe('today');
    expect(tile(buildGlance(facts({ suggestionsNew: 2 }), NOW), 'suggestions')).toMatchObject({ value: '2', label: 'Suggestions (new)', href: '/admin/suggestions', tone: 'amber' });
    expect(buildGlance(facts({ suggestionsNew: null }), NOW).sections[0].id).toBe('today');
  });

  it('an unreadable fact is a grey "No reading", never a zero', () => {
    const g = buildGlance(facts({ queue: null, cost: null }), NOW);
    expect(tile(g, 'queue')).toMatchObject({ value: '—', tone: 'grey', status: 'No reading' });
    expect(tile(g, 'cost').tone).toBe('grey');
  });

  it('the marking queue turns amber after an hour and red after three', () => {
    expect(tile(buildGlance(facts({ queue: { waiting: 2, marking: 1, oldestMinutes: 30 } }), NOW), 'queue').tone).toBe('green');
    expect(tile(buildGlance(facts({ queue: { waiting: 2, marking: 1, oldestMinutes: 90 } }), NOW), 'queue').tone).toBe('amber');
    const red = tile(buildGlance(facts({ queue: { waiting: 2, marking: 0, oldestMinutes: 240 } }), NOW), 'queue');
    expect(red).toMatchObject({ tone: 'red', value: '2' });
  });

  it('extraction is red when papers wait and nothing ran in a day', () => {
    const t = tile(buildGlance(facts({ extraction: { waiting: 5, working: 0, held: 0, doneToday: 0, done24h: 0, perDay: [0, 0, 0, 0, 0, 0, 0] } }), NOW), 'extraction');
    expect(t).toMatchObject({ tone: 'red', status: 'Stopped' });
  });

  it('a failed job is red, a late one amber', () => {
    expect(tile(buildGlance(facts({ jobs: { total: 40, late: [{ job: 'qb-topup', reason: 'x' }], failing: [], lastSelfFix: null } }), NOW), 'jobs').tone).toBe('amber');
    const t = tile(buildGlance(facts({ jobs: { total: 40, late: [], failing: ['leak-test'], lastSelfFix: null } }), NOW), 'jobs');
    expect(t).toMatchObject({ tone: 'red', status: '1 failed', sub: 'leak-test failed' });
  });

  it('plan logins go by the roomiest login that is on', () => {
    const t = tile(buildGlance(facts({ logins: [
      { name: 'a', on: true, fiveHour: null, sevenDay: 97, at: null },
      { name: 'b', on: true, fiveHour: null, sevenDay: 85, at: null },
      { name: 'c', on: false, fiveHour: null, sevenDay: 10, at: null },
    ] }), NOW), 'logins');
    expect(t).toMatchObject({ value: '85 %', tone: 'amber', status: '1 full', sub: '1: 97% · 2: 85% · 3: off' });
  });

  it('disk past 90 % is red', () => {
    expect(tile(buildGlance(facts({ disk: { pct: 92, at: ago(1) } }), NOW), 'disk').tone).toBe('red');
  });

  it('a bot that does not answer is red; one just restarted is amber', () => {
    expect(tile(buildGlance(facts({ deploys: { website: null, bot: { up: false, uptimeSec: null } } }), NOW), 'deploys').tone).toBe('red');
    expect(tile(buildGlance(facts({ deploys: { website: null, bot: { up: true, uptimeSec: 120 } } }), NOW), 'deploys').status).toBe('Just restarted');
  });

  it('a failed leak test is red; a week-old file backup is late', () => {
    const base = facts().backups;
    expect(tile(buildGlance(facts({ backups: { ...base, leakTest: { ok: false, at: ago(2), summary: 'x' } } }), NOW), 'backups').tone).toBe('red');
    expect(tile(buildGlance(facts({ backups: { ...base, fileBackup: { ok: true, at: ago(24 * 7), summary: null } } }), NOW), 'backups').status).toBe('Late');
  });

  it('stuck students show the top three with first names', () => {
    const t = tile(buildGlance(facts({ stuck: { at: ago(8), scienceGaps: ['Moles'], students: [
      { area: 'Differentiation', names: ['Chloe Zhang', 'Alexis Wong', 'Sophie Tan'], groupLabel: 'Sec 4 A Math' },
      { area: 'Vectors', names: ['Denise Chan'], groupLabel: 'Sec 4 A Math' },
    ] } }), NOW), 'stuck');
    expect(t.sub).toBe('Differentiation: Chloe, Alexis · Vectors: Denise');
    expect(tile(buildGlance(facts({ stuck: { at: ago(8), scienceGaps: ['Moles'], students: [] } }), NOW), 'science-gaps').value).toBe('1');
  });

  it('lessons today: amber while lessons wait to be logged', () => {
    const t = tile(buildGlance(facts({ lessonsToLog: 2, lessonsToday: [{ lessonId: 'l', studentId: 's', name: 'Chloe Zhang', time: '3-5pm', href: '/admin/students/s/next' }] }), NOW), 'lessons');
    expect(t).toMatchObject({ value: '1', tone: 'amber', status: '2 to log', href: '/admin/log', sub: 'Chloe' });
  });
});
