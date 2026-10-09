import { describe, it, expect } from 'vitest';
import {
  buildWsRequest, clampCount, displayTopics, filterTopics, jobStateLine, missing, presetsFor,
  summaryLine, topicFamilies, WS_KINDS, WS_LEVELS, type WsForm,
} from './ws-menu';
import { jobInsert } from './worksheet-jobs';

// The expected bodies below are what the BOT builds: each was printed by running the
// bot repo's own lib/make.js `jobBody(session)` (9 Oct 2026) on the session a button
// flow leaves behind — chat 111, requestedText '/ws'. The page must send the same.
const AM = ['Binomial Theorem', 'Circles', 'Trigonometry (Equations)', 'Trigonometry (Graphs)', 'Trigonometry (Ratios)',
  'Differentiation (Techniques)', 'Differentiation (Applications)', 'Surds'];
const CHAT = 111;
const queued = (form: WsForm, topics = AM) => {
  const r = buildWsRequest(form, topics, CHAT);
  if (!r.ok || r.lane !== 'queued') throw new Error(`not queued: ${JSON.stringify(r)}`);
  return r.body;
};

describe('the job each kind queues equals the Telegram menu\'s', () => {
  it('kind 1 — revision worksheet, one topic, the default count', () => {
    expect(queued({ kind: 1, level: 'S2', picked: ['Polygons'], count: null }, ['Polygons'])).toEqual({
      kind: 1, level: 'S2', topic: 'Polygons', params: { count: 8, requested_text: '/ws' }, requested_by: 111,
    });
  });

  it('kind 2 — practice with notes, two topics', () => {
    expect(queued({ kind: 2, level: 'AM', picked: ['Circles', 'Surds'], count: 10 })).toEqual({
      kind: 2, level: 'AM', topic: 'Circles & Surds',
      params: { count: 10, topics: ['Circles', 'Surds'], requested_text: '/ws' }, requested_by: 111,
    });
  });

  it('kind 2 — a whole chapter is named "(all)" and the count is capped at 20', () => {
    const trig = ['Trigonometry (Equations)', 'Trigonometry (Graphs)', 'Trigonometry (Ratios)'];
    expect(queued({ kind: 2, level: 'AM', picked: trig, count: 99 })).toEqual({
      kind: 2, level: 'AM', topic: 'Trigonometry (all)',
      params: { count: 20, topics: trig, requested_text: '/ws' }, requested_by: 111,
    });
  });

  it('kind 2 — one topic with a skill left out', () => {
    expect(queued({ kind: 2, level: 'AM', picked: ['Circles'], count: 6, skipSkills: ['Tangents'] })).toEqual({
      kind: 2, level: 'AM', topic: 'Circles',
      params: { count: 6, skip_skills: ['Tangents'], requested_text: '/ws' }, requested_by: 111,
    });
  });

  it('kind 4 — fresh practice on a sheet he has', () => {
    expect(queued({ kind: 4, level: 'AM', picked: ['Circles'], count: 5, sheet: 'AM Circles (With Worked Examples).docx' })).toEqual({
      kind: 4, level: 'AM', topic: 'Circles',
      params: { count: 5, sheet: 'AM Circles (With Worked Examples).docx', requested_text: '/ws' }, requested_by: 111,
    });
  });

  it('kind 5 — a prelim paper: the level comes from the paper, topics are left out', () => {
    expect(queued({ kind: 5, paper: 'AM-P2', preset: 'top-school-hard', exclude: ['Surds', 'Circles'] })).toEqual({
      kind: 5, level: 'AM', topic: null,
      params: { paper: 'AM-P2', preset: 'top-school-hard', exclude: ['Surds', 'Circles'], requested_text: '/ws' }, requested_by: 111,
    });
    expect(queued({ kind: 5, paper: 'JC-P1', preset: null, exclude: [] }, [])).toEqual({
      kind: 5, level: 'JC', topic: null, params: { paper: 'JC-P1', preset: 'standard', requested_text: '/ws' }, requested_by: 111,
    });
  });

  it('every queued body passes the queue route\'s own validator unchanged', () => {
    const bodies = [
      queued({ kind: 1, level: 'S2', picked: ['Polygons'] }, ['Polygons']),
      queued({ kind: 2, level: 'AM', picked: ['Circles', 'Surds'], count: 10 }),
      queued({ kind: 4, level: 'AM', picked: ['Circles'], sheet: 'x.docx' }),
      queued({ kind: 5, paper: 'EM-P1' }, []),
    ];
    for (const b of bodies) {
      const ins = jobInsert(b);
      expect(ins.ok).toBe(true);
      if (ins.ok) {
        expect(ins.row.kind).toBe(b.kind);
        expect(ins.row.level).toBe(b.level);
        expect(ins.row.topic).toBe(b.topic);
        expect(ins.row.params).toEqual(b.params);
        expect(ins.row.requested_by).toBe(111);
        expect(ins.row.status).toBe('queued');
      }
    }
  });
});

describe('kind 3 — questions only, the instant lane', () => {
  // the bot's runInstant: { level, topic, count: clamp(3), answers: true } + topics/title for a
  // chapter, tier only for a typed standard/advanced, skipSkills when some were dropped
  it('one topic', () => {
    expect(buildWsRequest({ kind: 3, level: 'S3_EM', picked: ['Circles'], count: 4, tier: 'mixed' }, AM, CHAT)).toEqual({
      ok: true, lane: 'instant', body: { level: 'S3_EM', topic: 'Circles', count: 4, answers: true },
    });
  });
  it('a chapter, advanced, capped at 12', () => {
    const d = ['Differentiation (Techniques)', 'Differentiation (Applications)'];
    expect(buildWsRequest({ kind: 3, level: 'AM', picked: d, count: 30, tier: 'advanced' }, AM, CHAT)).toEqual({
      ok: true, lane: 'instant',
      body: { level: 'AM', topic: 'Differentiation (all)', count: 12, answers: true, topics: d, title: 'Differentiation (all)', tier: 'advanced' },
    });
  });
  it('a skill left out', () => {
    const r = buildWsRequest({ kind: 3, level: 'AM', picked: ['Circles'], skipSkills: ['Tangents'] }, AM, CHAT);
    expect(r).toEqual({ ok: true, lane: 'instant', body: { level: 'AM', topic: 'Circles', count: 8, answers: true, skipSkills: ['Tangents'] } });
  });
});

describe('what is missing, in plain words', () => {
  it('walks the form top to bottom', () => {
    expect(missing({ kind: null })).toBe('Choose what to make.');
    expect(missing({ kind: 2 })).toBe('Choose the level.');
    expect(missing({ kind: 2, level: 'AM', picked: [] })).toBe('Choose a topic.');
    expect(missing({ kind: 2, level: 'AM', picked: ['Circles'] })).toBeNull();
    expect(missing({ kind: 4, level: 'AM', picked: ['Circles'] })).toMatch(/which of your sheets/);
    expect(missing({ kind: 5 })).toBe('Choose the paper.');
    expect(missing({ kind: 5, paper: 'EM-P1' })).toBeNull();
  });
  it('refuses a topic the level does not have, a wrong-paper style and too many topics', () => {
    expect(buildWsRequest({ kind: 1, level: 'AM', picked: ['Vectors'] }, AM, CHAT)).toEqual({ ok: false, error: '"Vectors" is not a topic at this level.' });
    expect(missing({ kind: 5, paper: 'EM-P1', preset: 'calculus-forward-am-p2' })).toMatch(/not for this paper/);
    expect(missing({ kind: 2, level: 'AM', picked: Array.from({ length: 13 }, (_, i) => `T${i}`) })).toMatch(/more than 12/);
  });
});

describe('helpers shared with the bot', () => {
  it('chapters are the names two or more topics share', () => {
    expect(topicFamilies(AM)).toEqual([
      { name: 'Trigonometry', members: ['Trigonometry (Equations)', 'Trigonometry (Graphs)', 'Trigonometry (Ratios)'] },
      { name: 'Differentiation', members: ['Differentiation (Techniques)', 'Differentiation (Applications)'] },
    ]);
  });
  it('names a set of topics the way the bot does', () => {
    expect(displayTopics(['Trigonometry (Equations)', 'Trigonometry (Graphs)', 'Surds'], AM)).toBe('Trigonometry (Equations, Graphs) & Surds');
    expect(displayTopics(['Differentiation (Techniques)', 'Differentiation (Applications)', 'Circles'], AM)).toBe('Differentiation (all) & Circles');
    expect(displayTopics(['Circles'], AM)).toBe('Circles');
  });
  it('clamps the count per kind', () => {
    expect([clampCount(3, 99), clampCount(3, null), clampCount(1, 0), clampCount(5, 3)]).toEqual([12, 8, 8, null]);
  });
  it('filters as he types', () => {
    expect(filterTopics(AM, 'trig gra')).toEqual(['Trigonometry (Graphs)']);
    expect(filterTopics(AM, '  ')).toBe(AM);
  });
  it('offers a paper only the styles written for it', () => {
    expect(presetsFor('EM-P1').map((p) => p.key)).toEqual(['standard', 'top-school-hard', 'vintage-pre2023']);
    expect(presetsFor('AM-P2').map((p) => p.key)).toContain('calculus-forward-am-p2');
  });
  it('has the menu\'s five kinds and seven levels', () => {
    expect(WS_KINDS.map((k) => [k.n, k.queued])).toEqual([[1, true], [2, true], [3, false], [4, true], [5, true]]);
    expect(WS_LEVELS.map((l) => l.token)).toEqual(['S1', 'S2', 'S3_EM', 'S3_AM', 'EM', 'AM', 'JC']);
  });
});

describe('the words on the page', () => {
  it('says what will be made', () => {
    expect(summaryLine({ kind: 2, level: 'AM', picked: ['Circles', 'Surds'], count: 10 }, AM))
      .toBe('Practice with notes: O-Level A Math, Circles & Surds, 10 questions.');
    expect(summaryLine({ kind: 5, paper: 'AM-P2', preset: 'top-school-hard', exclude: ['Surds'] }))
      .toBe('A full S4 A Math · Paper 2 paper, harder, top-school style, leaving out 1 topic.');
    expect(summaryLine({ kind: 2, level: 'AM', picked: [] })).toBe('');
  });
  it('says where a job is', () => {
    expect(jobStateLine({ status: 'queued' }).text).toBe('Waiting to start');
    expect(jobStateLine({ status: 'claimed', stage: 'rendering' }).text).toBe('Being built: rendering');
    expect(jobStateLine({ status: 'done', result: { docx_path: '/Practice/AM/Circles.docx' } }).text).toBe('Sent to Telegram: Circles.docx');
    expect(jobStateLine({ status: 'failed', error: 'no base sheet' }).text).toBe('Failed: no base sheet');
    expect(jobStateLine({ status: 'cancelled' }).text).toBe('Stopped');
  });
});

describe('the brand header switch rides only on kind 3', () => {
  it('kind 3 carries brand when set; off/absent sends nothing; a queued kind never carries it', () => {
    const base: WsForm = { kind: 3, level: 'AM', picked: ['Circles'], count: 8 };
    const off = buildWsRequest(base, AM, CHAT);
    expect(off.ok && off.lane === 'instant' && !('brand' in off.body)).toBe(true);
    const on = buildWsRequest({ ...base, brand: 'mono' }, AM, CHAT);
    expect(on.ok && on.lane === 'instant' && on.body.brand).toBe('mono');
    const q = buildWsRequest({ kind: 1, level: 'AM', picked: ['Circles'], count: 8, brand: 'colour' }, AM, CHAT);
    expect(q.ok && q.lane === 'queued' && JSON.stringify(q.body).includes('brand')).toBe(false);
  });
});
