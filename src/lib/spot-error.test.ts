import { describe, it, expect } from 'vitest';
import {
  briefsFromRun, rankBriefs, draftProblems, noveltyProblems, numbersIn, pickSpotUnit, briefKey,
  SPOT_ORIGIN, type SpotBrief, type SpotDraft,
} from './spot-error';

const line = (text: string, verdict = 'correct', extra: Record<string, unknown> = {}) =>
  ({ transcription_plain: text, verdict, ...extra });

function run(lines: unknown[], over: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    subject: 'math',
    result_json: {
      subject: 'math',
      results: [{
        question_number: '9',
        marking_output: {
          meta: { level_detected: 'O-Level E Math', topic_detected: 'Currency exchange' },
          question: { prompt: 'Change 780 Singapore dollars into euros at 1 euro = $1.5953.' },
          parts: [{ error_summary: 'rounded to 2 s.f. instead of 3' }],
          lines,
          ...over,
        },
      }],
    },
  };
}

describe('briefsFromRun', () => {
  const good = [
    line('euros = 780/1.5953 = 488.9363'),
    line('euros in SG = 489.9363'),
    line('rate = 489.9363/780 = 0.62812'),
    line('Answer: 0.63 euros', 'wrong', { error_type: 'concept', correction: { text_plain: 'to 3 s.f.: 0.628' } }),
  ];
  it('keeps one clear wrong line, with no ids, names or notes', () => {
    const [b] = briefsFromRun(run(good));
    expect(b.error_kind).toBe('concept');
    expect(b.wrong_line).toBe(4);
    expect(b.correction).toBe('to 3 s.f.: 0.628');
    expect(b.key).toBe(briefKey('run-1', '9'));
    expect(JSON.stringify(b)).not.toContain('run-1');
  });
  it('drops runs with two wrong lines, knock-ons only count once', () => {
    const two = [...good.slice(0, 2), line('x', 'wrong', { error_type: 'careless' }), good[3]];
    expect(briefsFromRun(run(two))).toEqual([]);
    const knockOn = [...good, line('so 0.63 × 2 = 1.26', 'wrong', { error_type: 'concept', follows_wrong: true })];
    expect(briefsFromRun(run(knockOn))).toHaveLength(1);
  });
  it('drops science runs, sketches, short working and non-line kinds', () => {
    expect(briefsFromRun({ ...run(good), subject: 'chemistry' })).toEqual([]);
    expect(briefsFromRun(run([line('Sketch: cross at (1, 2)'), ...good]))).toEqual([]);
    expect(briefsFromRun(run(good.slice(2)))).toEqual([]);
    const incomplete = [...good.slice(0, 3), line('stopped', 'wrong', { error_type: 'incomplete' })];
    expect(briefsFromRun(run(incomplete))).toEqual([]);
  });
  it('drops copying, rounding and calculator slips (Adrian, 4 Nov 2026)', () => {
    for (const k of ['transfer', 'rounding', 'arithmetic']) {
      const slip = [...good.slice(0, 3), line('x', 'wrong', { error_type: k })];
      expect(briefsFromRun(run(slip))).toEqual([]);
    }
  });
  it("Adrian's override kind wins over the marker's", () => {
    const r = run(good);
    (r.result_json.results[0] as Record<string, unknown>).triage_override = { error_kind: 'careless' };
    expect(briefsFromRun(r)[0].error_kind).toBe('careless');
  });
});

describe('rankBriefs', () => {
  const b = (key: string, kind: SpotBrief['error_kind'], topic: string): SpotBrief =>
    ({ key, error_kind: kind, topic, level: null, prompt: '', lines: [], wrong_line: 1, correction: null, reason: null });
  it('frequent kinds first, round-robin, a new topic before a repeat, skips used keys', () => {
    const all = [b('1', 'sign', 'A'), b('2', 'sign', 'A'), b('3', 'sign', 'B'), b('4', 'careless', 'C'), b('5', 'concept', 'D')];
    const out = rankBriefs(all, 4, new Set(['5']));
    expect(out.map(x => x.key)).toEqual(['1', '4', '3', '2']);
    expect(out[0].kind_count).toBe(3);
  });
});

const draft = (over: Partial<SpotDraft['payload']> = {}, d: Partial<SpotDraft> = {}): SpotDraft => ({
  subject: 'EM', topic: 'Math In Real World Context', title: 'Spot the error: exchange rate',
  ...d,
  payload: {
    origin: SPOT_ORIGIN, source: 'marked', error_kind: 'concept', key: 'abc123def4567890',
    problem_md: 'Change $640$ dollars into yen at 1 yen = $0.0093.',
    working: ['$640 \\div 0.0093 = 68817.2$', 'Rate $= 0.6$ yen', 'line 3', 'line 4'],
    wrong_line: 2, why_md: 'Rounded to 1 s.f.', fix_md: 'Give 3 s.f.',
    ...over,
  },
});
const spine = new Set(['EM|Math In Real World Context']);

describe('draftProblems', () => {
  it('a good draft passes', () => { expect(draftProblems(draft(), spine)).toEqual([]); });
  it('catches a wrong topic, a bad wrong_line, a person, the tutor', () => {
    expect(draftProblems(draft({}, { topic: 'Nope' }), spine)[0]).toMatch(/topic_spine/);
    expect(draftProblems(draft({ wrong_line: 5 }), spine)).toContain('wrong_line out of range');
    expect(draftProblems(draft({ why_md: 'Your classmate rounded early' }), spine).join()).toMatch(/person/);
    expect(draftProblems(draft({ fix_md: 'Adrian says 3 s.f.' }), spine).join()).toMatch(/tutor/);
    expect(draftProblems(draft({ error_kind: 'incomplete' }), spine).join()).toMatch(/spot kind/);
  });
  it("Adrian's 4 Nov rules: no copying/rounding kinds, plain wording, multi-step E Math", () => {
    expect(draftProblems(draft({ error_kind: 'transfer' }), spine).join()).toMatch(/spot kind/);
    expect(draftProblems(draft({ error_kind: 'rounding' }), spine).join()).toMatch(/spot kind/);
    expect(draftProblems(draft({ error_kind: 'arithmetic', source: 'real-world' }), spine)).toEqual([]);
    expect(draftProblems(draft({}, { title: 'Spot the error: standard form loses a figure' }), spine).join()).toMatch(/loses/);
    expect(draftProblems(draft({}, { title: 'Half a resident' }), spine).join()).toMatch(/Spot the error:/);
    expect(draftProblems(draft({ working: ['a', 'b', 'c'], wrong_line: 2 }), spine).join()).toMatch(/multi-step/);
  });
});

describe('noveltyProblems', () => {
  const src = { prompt: 'Change 780 Singapore dollars into euros at 1 euro = $1.5953.', lines: [{ text: 'euros = 780/1.5953 = 488.9363', wrong: false }] };
  it('a re-skin with new numbers passes', () => { expect(noveltyProblems(draft(), src)).toEqual([]); });
  it('refuses a copied line, a reused number, copied wording', () => {
    expect(noveltyProblems(draft({ working: ['euros = 780/1.5953 = 488.9363', 'x'] }), src).join()).toMatch(/copied/);
    expect(noveltyProblems(draft({ fix_md: 'Use 1.5953' }), src).join()).toMatch(/1\.5953/);
    expect(noveltyProblems(draft({ problem_md: 'Change 640 Singapore dollars into euros at 1 euro = $1.6$.' }), src).join()).toMatch(/wording/);
  });
  it('numbersIn normalises commas and trailing zeros', () => {
    expect(numbersIn('1,000 and 0.6280 and 3')).toEqual(['1000', '0.628', '3']);
  });
});

describe('pickSpotUnit', () => {
  const units = [
    { id: 'u1', subject: 'EM', topic: 'Trigonometry', error_kind: 'sign' },
    { id: 'u2', subject: 'AM', topic: 'Logarithms', error_kind: 'sign' },
    { id: 'u3', subject: 'JC', topic: 'Vectors', error_kind: 'sign' },
  ];
  it('same kind, reachable level, shared topic word first', () => {
    expect(pickSpotUnit({ error_kind: 'sign', topic: 'Trigonometry (Equations)', subject: 'A Math' }, units)?.id).toBe('u1');
    expect(pickSpotUnit({ error_kind: 'sign', topic: 'Surds', subject: 'A Math' }, units)?.id).toBe('u2');
  });
  it('never above the student’s level, never a different kind', () => {
    expect(pickSpotUnit({ error_kind: 'sign', topic: 'Vectors', subject: 'E Math' }, units)?.id).toBe('u1');
    expect(pickSpotUnit({ error_kind: 'rounding', topic: 'x', subject: 'E Math' }, units)).toBeNull();
    expect(pickSpotUnit({ error_kind: 'sign', topic: 'x', subject: 'Physics' }, units)).toBeNull();
  });
});
