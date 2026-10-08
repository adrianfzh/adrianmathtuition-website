// Ported from the bot's test/humanities-report.test.js (the belt and the prompt moved to the
// website with the plan reader, 8 Oct 2026), plus the queue's own rules: nextStep and parseReadReply.
import { describe, it, expect } from 'vitest';
import { validateRead, agreeReads, buildReport, pickShownRead, telegramLine, validatePointsRead, buildPointsReport, parseReadReply, nextStep, type CleanRead, type PassState } from './humanities-settle';
import { buildSystemPrompt, buildUserMessage, humanitiesPrompt, buildHumanitiesPayload, readContext, type HumanitiesPayload } from './humanities-prompt';
import { allSets, questionById, isPointsQuestion } from './humanities-questions';

const answer = 'Source A says the lift broke twice. This shows poor upkeep. The council is lazy.';
const ctx = { answer, levelsMax: 4, tags: ['from_source', 'not_supported', 'uses_context', 'evaluates'] };
const r = (level: number, n = 0): CleanRead => ({ level, claims: Array(n).fill({ quote: 'q', tag: 't' }), lift: 'l', gap: [], summary: null });

describe('the belt on a levels read', () => {
  it('keeps a clean read, with only verbatim, known-tag claims', () => {
    const v = validateRead({ level: 2, lift: 'Say who wrote Source A and why.', gap: ['a', 'b', 'c'],
      claims: [
        { quote: 'This shows poor upkeep.', tag: 'from_source', note: 'drawn from the source' },
        { quote: 'never written', tag: 'from_source' },
        { quote: 'The council is lazy.', tag: 'made_up' },
        { quote: 'shows poor', tag: 'evaluates' },
      ] }, ctx);
    expect(v.read).toBeTruthy();
    expect(v.read!.claims.length).toBe(1);
    expect(v.dropped.length).toBe(3);
    expect(v.read!.gap.length).toBe(2);
  });
  it('refuses a read with no level, no lift or a mark in the lift', () => {
    expect(validateRead({ level: 5, lift: 'x' }, ctx).read).toBeNull();
    expect(validateRead({ level: 2.5, lift: 'x' }, ctx).read).toBeNull();
    expect(validateRead({ level: 2 }, ctx).read).toBeNull();
    expect(validateRead({ level: 2, lift: 'This would get 3/4.' }, ctx).read).toBeNull();
    expect(validateRead(null, ctx).read).toBeNull();
  });
  it('drops a note or gap line that speaks in marks; the read stays', () => {
    const v = validateRead({ level: 3, lift: 'Weigh the two sources.', gap: ['Worth 2 marks more.', 'Reach a judgement.'],
      claims: [{ quote: 'The council is lazy.', tag: 'not_supported', note: 'loses 1 mark' }] }, ctx);
    expect(v.read!.gap).toEqual(['Reach a judgement.']);
    expect(v.read!.claims[0].note).toBeNull();
  });
});

describe('agreeReads', () => {
  it('two the same decide; two apart ask for a third', () => {
    expect([agreeReads([r(3), r(3)]).decided, agreeReads([r(3), r(3)]).level]).toEqual([true, 3]);
    const a = agreeReads([r(2), r(3)]);
    expect(a.decided).toBe(false); expect(a.needsThird).toBe(true);
  });
  it('three with a majority one level wide decide with a range', () => {
    const a = agreeReads([r(2), r(3), r(3)]);
    expect([a.decided, a.level, a.lo, a.hi]).toEqual([true, 3, 2, 3]);
  });
  it('all different, or two levels wide, is held', () => {
    expect(agreeReads([r(1), r(2), r(3)]).decided).toBe(false);
    expect(agreeReads([r(1), r(3), r(3)]).decided).toBe(false);
    expect(agreeReads([r(1), r(2), r(3)]).needsThird).toBe(false);
  });
});

describe('the report', () => {
  it('shows a read at the settled level, and never a mark field', () => {
    const reads = [r(2, 5), r(3, 1), r(3, 2)];
    const rep = buildReport(reads, agreeReads(reads), 4);
    expect([rep.level, rep.level_lo, rep.level_hi, rep.levels_max, rep.claims.length]).toEqual([3, 2, 3, 4, 2]);
    expect('mark' in rep || 'score' in rep).toBe(false);
    expect(pickShownRead([r(1), r(2), r(4)], null).level).toBe(2);
  });
  it('telegramLine', () => {
    expect(telegramLine({ studentName: 'A', skill: 'inference', report: { level: 2, level_lo: 2, level_hi: 3, levels_max: 3, claims: [], lift: '', gap: [] }, held: true, heldReason: 'reads 1/2/3' })).toMatch(/HELD L2–3 of 3 — reads/);
  });
});

const structured: HumanitiesPayload = { kind: 'structured', subject: 'Social Studies', skill: 'sr_explain', question: 'Explain two ways.', answer: 'x',
  sources: [{ id: 'Extract', provenance: 'An extract', text: 'Some text.' }],
  scheme: { label: 'Explain two ways', levels: [{ level: 1, does: 'a' }, { level: 2, does: 'b' }, { level: 3, does: 'c' }] }, rules: [], tags: [{ key: 'point', label: 'Point', meaning: 'm' }] };

describe('the prompt', () => {
  it('reads a structured-response question from own knowledge, not against sources', () => {
    const sys = buildSystemPrompt(structured);
    expect(sys).toMatch(/structured-response question/);
    expect(sys).toMatch(/Never ask for a quotation/);
    expect(sys).not.toMatch(/ties it to the source/);
    expect(buildUserMessage(structured)).toMatch(/THE EXTRACT/);
    const src = buildSystemPrompt({ ...structured, kind: 'source' });
    expect(src).toMatch(/source-based question/);
    expect(src).toMatch(/ties it to the source/);
    expect(buildUserMessage({ ...structured, kind: undefined })).toMatch(/THE SOURCES\nSource Extract/);
  });
  it('lists the points and never asks for a level; the level prompt is untouched', () => {
    const p: HumanitiesPayload = { kind: 'points', subject: 'Geography', question: 'Explain two benefits of tourism.', answer: geoAnswer,
      points: { max: 3, develop: true, command: 'explain', list: [{ id: 'a', text: 'Jobs are created', develop: 'which jobs, for whom' }], rules: ['Benefits to the economy only.'] }, sources: [] };
    const sys = buildSystemPrompt(p);
    expect(sys).toMatch(/\[a\] Jobs are created/);
    expect(sys).toMatch(/credit 2/);
    expect(sys).not.toMatch(/"level"/);
    expect(buildUserMessage(p)).toMatch(/THE QUESTION\nExplain two benefits/);
    const lv = buildSystemPrompt({ question: 'q', answer: 'a', scheme: { label: 'Inference', levels: [{ level: 1, does: 'x' }, { level: 2, does: 'y' }] }, tags: [{ key: 'k', label: 'K', meaning: 'm' }], rules: [] });
    expect(lv).toMatch(/"level": <integer 1\.\.2>/);
  });
  it('the two reads differ only in their reading order, and the whole prompt is one string', () => {
    const one = humanitiesPrompt(structured, 1), two = humanitiesPrompt(structured, 2);
    expect(one).toContain('claim by claim first');
    expect(two).toContain('read the whole answer first');
    expect(one.split('ORDER FOR THIS READ')[0]).toBe(two.split('ORDER FOR THIS READ')[0]);
    expect(one.startsWith('You are an experienced Singapore secondary Social Studies teacher')).toBe(true);
  });
  it('every question in the bank makes a prompt the reader can use, with the student\'s answer in it', () => {
    let n = 0;
    for (const set of allSets()) for (const q of set.questions) {
      const c = questionById(q.id)!;
      const p = buildHumanitiesPayload(c, 'MY-ANSWER-MARKER one two three');
      const text = humanitiesPrompt(p, 1);
      expect(text).toContain('MY-ANSWER-MARKER');
      expect(text).toContain(q.question);
      expect(text).not.toContain('undefined');
      const rc = readContext(p);
      expect(rc.points).toBe(isPointsQuestion(q));
      expect(rc.max).toBeGreaterThanOrEqual(1);
      if (!rc.points) expect(rc.tags.length).toBeGreaterThan(0);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });
});

// ── Point-marked answers (Geography) ──
const geoAnswer = 'Hotels need cleaners and cooks, so local people get jobs. Tourists spend money in shops.';
const pctx = { answer: geoAnswer, points: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], max: 3, develop: true };

describe('the belt on a points read', () => {
  it('counts the total from the credits, capped at the maximum', () => {
    const v = validatePointsRead({ lift: 'Add how the money is spent again locally.', points: [
      { id: 'a', credit: 2, quote: 'Hotels need cleaners and cooks, so local people get jobs.', note: 'point and development' },
      { id: 'b', credit: 1, quote: 'Tourists spend money in shops.' },
      { id: 'c', credit: 0, quote: '' },
      { id: 'other', credit: 1, quote: 'Tourists spend money', text: 'spending' },
    ] }, pctx);
    expect(v.read!.marks).toBe(3);
    expect(v.read!.level).toBe(3);
    expect(v.read!.credits!.length).toBe(4);
  });
  it('drops a credit with no quotation from the answer, an unknown point or a bad credit', () => {
    const v = validatePointsRead({ lift: 'Name one more benefit.', points: [
      { id: 'a', credit: 1, quote: 'never written' },
      { id: 'z', credit: 1, quote: 'Tourists spend money in shops.' },
      { id: 'b', credit: 3, quote: 'Tourists spend money in shops.' },
      { id: 'c', credit: 1, quote: 'Tourists spend money in shops.', note: 'worth 1 mark' },
      { id: 'c', credit: 1, quote: 'Tourists spend money in shops.' },
    ] }, pctx);
    expect(v.read!.marks).toBe(1);
    expect(v.read!.credits![0].note).toBeNull();
    expect(v.dropped.length).toBe(5);
  });
  it('gives no development credit unless the question allows it; refuses no lift or a lift in marks', () => {
    expect(validatePointsRead({ lift: 'x', points: [{ id: 'a', credit: 2, quote: 'Tourists spend money in shops.' }] }, { ...pctx, develop: false }).read!.marks).toBe(0);
    expect(validatePointsRead({ points: [] }, pctx).read).toBeNull();
    expect(validatePointsRead({ lift: 'You would get 3/3.', points: [] }, pctx).read).toBeNull();
    expect(validatePointsRead({ lift: 'Add one benefit.', points: [] }, pctx).read!.marks).toBe(0);
  });
  it('the report carries the settled marks in the level fields and the per-point credits', () => {
    const mk = (marks: number, n: number): CleanRead => ({ level: marks, marks, credits: Array.from({ length: n }, (_, i) => ({ id: 'abc'[i], credit: 1, quote: 'q', note: null })), lift: 'l', gap: [], summary: null, claims: [] });
    const reads = [mk(2, 2), mk(2, 2)];
    const rep = buildPointsReport(reads, agreeReads(reads), 3);
    expect([rep.marking, rep.level, rep.level_lo, rep.level_hi, rep.levels_max]).toEqual(['points', 2, 2, 2, 3]);
    expect(rep.points!.length).toBe(2);
    const zero = [mk(0, 0), mk(0, 0)];
    expect(buildPointsReport(zero, agreeReads(zero), 3).level).toBe(0);
    expect(telegramLine({ studentName: 'T', skill: 'geo_explain', report: rep, held: true, heldReason: 'x' })).toMatch(/HELD 2 of 3 marks/);
  });
});

describe('parseReadReply — the plan reader sends raw text', () => {
  it('takes a bare object, a fenced one, and one with a line around it', () => {
    expect(parseReadReply('{"level":2,"lift":"x"}')).toEqual({ level: 2, lift: 'x' });
    expect(parseReadReply('```json\n{"level":2,"lift":"x"}\n```')).toEqual({ level: 2, lift: 'x' });
    expect(parseReadReply('Here is the read:\n{"level":2,"claims":[{"quote":"a {b} c","tag":"t"}]}\nDone.')!.level).toBe(2);
  });
  it('forgives a trailing comma; anything else is no read', () => {
    expect(parseReadReply('{"level":3,"gap":["a",],}')).toEqual({ level: 3, gap: ['a'] });
    expect(parseReadReply('I could not read this.')).toBeNull();
    expect(parseReadReply('[1,2]')).toBeNull();
    expect(parseReadReply('{"level": }')).toBeNull();
    expect(parseReadReply(null)).toBeNull();
  });
});

describe('nextStep — what to do each time a run is looked at', () => {
  const clean = (pass: number, level: number): PassState => ({ pass, state: 'clean', read: r(level) });
  const bad = (pass: number): PassState => ({ pass, state: 'bad' });
  const waiting = (pass: number): PassState => ({ pass, state: 'waiting' });
  it('waits while any read is out', () => {
    expect(nextStep([waiting(1), waiting(2)]).do).toBe('wait');
    expect(nextStep([clean(1, 3), waiting(2)]).do).toBe('wait');
    expect(nextStep([clean(1, 2), clean(2, 3), waiting(3)]).do).toBe('wait');
  });
  it('two reads the same → marked', () => {
    const s = nextStep([clean(2, 3), clean(1, 3)]);
    expect(s.do).toBe('marked');
    if (s.do === 'marked') expect(s.agreement.level).toBe(3);
  });
  it('two different → a third read; then a majority marks it, no majority holds it', () => {
    expect(nextStep([clean(1, 2), clean(2, 3)])).toEqual({ do: 'read', pass: 3 });
    const m = nextStep([clean(1, 2), clean(2, 3), clean(3, 3)]);
    expect(m.do).toBe('marked');
    if (m.do === 'marked') expect([m.agreement.level, m.agreement.lo, m.agreement.hi]).toEqual([3, 2, 3]);
    expect(nextStep([clean(1, 1), clean(2, 2), clean(3, 3)]).do).toBe('held');
    expect(nextStep([clean(1, 1), clean(2, 3), clean(3, 3)]).do).toBe('held');
  });
  it('a failed third read is tried once more, then the answer is held with its range', () => {
    expect(nextStep([clean(1, 2), clean(2, 3), bad(3)])).toEqual({ do: 'read', pass: 4 });
    const h = nextStep([clean(1, 2), clean(2, 3), bad(3), bad(4)]);
    expect(h.do).toBe('held');
    if (h.do === 'held') expect([h.agreement.lo, h.agreement.hi, h.reads.length]).toEqual([2, 3, 2]);
  });
  it('a failed read is retried; four reads without two usable ones is a failure', () => {
    expect(nextStep([clean(1, 2), bad(2)])).toEqual({ do: 'read', pass: 3 });
    expect(nextStep([bad(1), bad(2)])).toEqual({ do: 'read', pass: 3 });
    expect(nextStep([bad(1), bad(2), clean(3, 2)])).toEqual({ do: 'read', pass: 4 });
    expect(nextStep([bad(1), bad(2), clean(3, 2), clean(4, 2)]).do).toBe('marked');
    expect(nextStep([bad(1), bad(2), clean(3, 2), bad(4)])).toEqual({ do: 'failed', error: 'fewer than two usable reads' });
    expect(nextStep([]).do).toBe('failed');
  });
  it('two usable reads that arrive late and differ still get their deciding read', () => {
    expect(nextStep([bad(1), clean(2, 2), bad(3), clean(4, 3)])).toEqual({ do: 'read', pass: 5 });
    expect(nextStep([bad(1), clean(2, 2), bad(3), clean(4, 3), clean(5, 2)]).do).toBe('marked');
  });
});
