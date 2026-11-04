import { describe, it, expect } from 'vitest';
import {
  weekStartISO, estimateSlotFor, matchBankTopics, topicHistory, recentTopics, olderTopics, topErrorKinds,
  pickSpotForSet, parseResponse, mergeResponse, slotResult, setProgress, answerText, predictionLine, seededIndex,
  type StretchItem, type SpotUnitLite,
} from './stretch-set';

const AM = ['Binomial Theorem', 'Circles', 'Differentiation (Techniques)', 'Differentiation (Maximum and Minimum)', 'Indices', 'Logarithms', 'Trigonometry (Identities)', 'Trigonometry (Equations)', 'Quadratic Functions'];

describe('weeks', () => {
  it('Monday of the SGT week', () => {
    expect(weekStartISO('2026-11-04')).toBe('2026-11-02'); // Wed → Mon
    expect(weekStartISO('2026-11-02')).toBe('2026-11-02'); // Mon stays
    expect(weekStartISO('2026-11-08')).toBe('2026-11-02'); // Sun belongs to the week before
  });
  it('the guess-first prompt rotates costume ↔ older, never on the stretch or spot card', () => {
    const all = ['costume', 'stretch', 'older', 'spot'] as const;
    const got = ['2026-11-02', '2026-11-09', '2026-11-16'].map(w => estimateSlotFor(w, all));
    expect(new Set(got.slice(0, 2))).toEqual(new Set(['costume', 'older']));
    expect(got[2]).toBe(got[0]);
    expect(estimateSlotFor('2026-11-02', ['stretch', 'spot'])).toBeNull();
    expect(estimateSlotFor('2026-11-02', ['older', 'spot'])).toBe('older');
  });
  it('seeded picks are stable', () => {
    expect(seededIndex('a|2026-11-02', 7)).toBe(seededIndex('a|2026-11-02', 7));
    expect(seededIndex('x', 0)).toBe(0);
  });
});

describe('topics', () => {
  it('maps lesson words onto bank topics', () => {
    expect(matchBankTopics('Circles', AM)).toEqual(['Circles']);
    expect(matchBankTopics('differentiation', AM)).toEqual(['Differentiation (Techniques)', 'Differentiation (Maximum and Minimum)']);
    expect(matchBankTopics('Trig identities', AM)).toEqual(['Trigonometry (Identities)']);
    expect(matchBankTopics('Logarithm graphs', AM)).toEqual([]); // "logarithm" ≠ "logarithms": no guess
    expect(matchBankTopics('', AM)).toEqual([]);
  });

  const today = '2026-11-04';
  const hist = topicHistory([
    { topic: 'Circles', date: '2026-10-28', source: 'lesson' },
    { topic: 'Indices', date: '2026-09-01', source: 'lesson' },
    { topic: 'Logarithms', date: '2026-08-15', source: 'lesson' },
    { topic: 'Logarithms', date: '2026-09-10T03:00:00Z', source: 'mistake', open: true, weight: 3 },
    { topic: 'Binomial Theorem', date: '2026-11-01', source: 'attempt' },
    { topic: 'Not a topic', date: '2026-11-01', source: 'attempt' },
    { topic: 'Circles', date: 'bad date', source: 'lesson' },
  ], AM);

  it('recent = met in the last 3 weeks, newest first', () => {
    expect(recentTopics(hist, today)).toEqual(['Binomial Theorem', 'Circles']);
  });
  it('older = first met 3+ weeks ago; quiet ones first, then lost-marks topics', () => {
    const o = olderTopics(hist, today);
    expect(o.map(h => h.topic)).toEqual(['Logarithms', 'Indices']);
    const busy = topicHistory([
      { topic: 'Circles', date: '2026-08-01', source: 'lesson' }, { topic: 'Circles', date: '2026-11-01', source: 'mistake', open: true, weight: 5 },
      { topic: 'Indices', date: '2026-08-01', source: 'lesson' }, { topic: 'Indices', date: '2026-10-30', source: 'attempt' },
      { topic: 'Logarithms', date: '2026-08-01', source: 'lesson' },
      { topic: 'Binomial Theorem', date: '2026-10-30', source: 'lesson' },
    ], AM);
    expect(olderTopics(busy, today).map(h => h.topic)).toEqual(['Logarithms', 'Circles', 'Indices']); // Binomial is new, not older
    expect(o[0].mistakes).toBe(3);
    expect(o[0].first).toBe('2026-08-15');
    expect(o[0].last).toBe('2026-09-10');
  });
});

describe('spot the mistake', () => {
  const units: SpotUnitLite[] = [
    { id: 'u1', subject: 'AM', topic: 'Circles', error_kind: null, origin: null },
    { id: 'u2', subject: 'EM', topic: 'Standard Form', error_kind: 'sign', origin: 'spot-error' },
    { id: 'u3', subject: 'AM', topic: 'Indices', error_kind: 'concept', origin: 'spot-error' },
    { id: 'u4', subject: 'JC', topic: 'Vectors', error_kind: 'sign', origin: 'spot-error' },
  ];
  it('ranks the kind of mistake the student makes most', () => {
    expect(topErrorKinds([{ error_kind: 'sign', seen_count: 3 }, { error_kind: 'concept', seen_count: 1 }, { error_kind: 'nonsense' }])).toEqual(['sign', 'concept']);
  });
  it('their own kind first, within the level’s reach', () => {
    const p = pickSpotForSet('AM', units, { kinds: ['sign'], metTopics: [], used: new Set(), seed: 's' });
    expect(p?.unit.id).toBe('u2');
    expect(p?.kindMatch).toBe(true);
  });
  it('an E Math student never gets an A Math card', () => {
    const p = pickSpotForSet('EM', units, { kinds: ['concept'], metTopics: [], used: new Set(), seed: 's' });
    expect(p?.unit.id).toBe('u2');
    expect(p?.kindMatch).toBe(false);
  });
  it('a met topic wins among cards without a kind match; used cards are skipped', () => {
    const p = pickSpotForSet('AM', units, { kinds: [], metTopics: ['Circles'], used: new Set(), seed: 's' });
    expect(p?.unit.id).toBe('u1');
    const q = pickSpotForSet('AM', units, { kinds: [], metTopics: ['Circles'], used: new Set(['u1']), seed: 's' });
    expect(q?.unit.id).not.toBe('u1');
  });
  it('nothing in reach → null', () => {
    expect(pickSpotForSet('S1', units, { kinds: [], metTopics: [], used: new Set(), seed: 's' })).toBeNull();
  });
});

describe('the student’s inputs', () => {
  it('keeps only what it knows, clipped', () => {
    expect(parseResponse({ slot: 'stretch', remind: '  like the   tangent one  ' })).toEqual({ slot: 'stretch', patch: { remind: 'like the tangent one' } });
    expect(parseResponse({ slot: 'older', prediction: { sign: 'negative', size: 'about 12', bad: 1 } })).toEqual({ slot: 'older', patch: { prediction: { sign: 'negative', size: 'about 12' } } });
    expect(parseResponse({ slot: 'spot', spotRight: true })).toEqual({ slot: 'spot', patch: { spotPicked: true, spotRight: true } });
    expect(parseResponse({ slot: 'older', spotRight: true })).toBeNull(); // spot answers only on the spot slot
    expect(parseResponse({ slot: 'nope', remind: 'x' })).toBeNull();
    expect(parseResponse({ slot: 'stretch', prediction: { sign: 'huge' } })).toBeNull();
    expect(parseResponse(null)).toBeNull();
  });
  it('the first guess and the first tap stand', () => {
    let r = mergeResponse(undefined, { prediction: { sign: 'positive' } });
    r = mergeResponse(r, { prediction: { sign: 'negative' } });
    expect(r.prediction).toEqual({ sign: 'positive' });
    r = mergeResponse(r, { predictionClose: false });
    expect(r.predictionClose).toBe(false);
    let s = mergeResponse(undefined, { spotPicked: true, spotRight: false });
    s = mergeResponse(s, { spotPicked: true, spotRight: true });
    expect(s.spotRight).toBe(false);
  });
  it('reads a guess back in one line', () => {
    expect(predictionLine({ sign: 'negative', size: '12', note: 'two answers' })).toBe('negative, about 12, two answers');
    expect(predictionLine(undefined)).toBe('');
  });
});

describe('results', () => {
  const at = (iso: string, score: number | null, outOf: number | null, verdict: string | null = null, helpSteps = 0) => ({ questionId: 'q1', attemptedAt: iso, verdict, score, outOf, helpSteps });
  it('right first time reads the FIRST attempt only', () => {
    expect(slotResult('q1', [at('2026-11-03T02:00:00Z', 5, 5), at('2026-11-03T01:00:00Z', 1, 5)])).toEqual({ tried: true, rightFirstTime: false });
    expect(slotResult('q1', [at('2026-11-03T01:00:00Z', 4, 5)])).toEqual({ tried: true, rightFirstTime: true });
    expect(slotResult('q1', [at('2026-11-03T01:00:00Z', 5, 5, 'correct', 2)])).toEqual({ tried: true, rightFirstTime: false }); // used Stuck? steps
    expect(slotResult('q2', [at('2026-11-03T01:00:00Z', 5, 5)])).toEqual({ tried: false, rightFirstTime: null });
    expect(slotResult(undefined, [])).toEqual({ tried: false, rightFirstTime: null });
  });
  it('progress counts questions tried, spot taps and guesses', () => {
    const items: StretchItem[] = [
      { slot: 'costume', source: 'recent', questionId: 'a', topic: 'x', why: '' },
      { slot: 'stretch', source: 'challenge', questionId: 'b', topic: 'y', why: '', remind: true },
      { slot: 'older', source: 'older', questionId: 'c', topic: 'z', why: '', estimate: true },
      { slot: 'spot', source: 'spot', unitId: 'u', topic: 'w', why: '' },
    ];
    const p = setProgress(items,
      { costume: { tried: true, rightFirstTime: true }, stretch: { tried: false, rightFirstTime: null }, older: { tried: true, rightFirstTime: false } },
      { older: { prediction: { sign: 'positive' }, predictionClose: true }, spot: { spotPicked: true, spotRight: true } });
    expect(p).toEqual({ total: 4, done: 3, rightFirst: 2, predictions: 1, predictionsClose: 1 });
  });
  it('the answer line: whole-question answer, else the parts', () => {
    expect(answerText({ answer: ' x = 3 ' })).toBe('x = 3');
    expect(answerText({ parts: [{ label: '(a)', answer: '12' }, { label: 'b', parts: [{ label: 'i', answer: '0.5' }] }] })).toBe('(a) 12; (i) 0.5');
    expect(answerText({})).toBe('');
  });
});
