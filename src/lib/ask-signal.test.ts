import { describe, expect, it } from 'vitest';
import {
  ASK_SIGNAL_MIN,
  askLineContext,
  askLineTitle,
  askSignalLine,
  askSignalLines,
  askSignalOn,
  askStateLabel,
  askTopicKey,
  parseAskTopic,
  type AskRow,
} from './ask-signal';

const NOW = new Date('2026-09-10T14:00:00.000Z');
const daysAgo = (d: number, hours = 0) => new Date(NOW.getTime() - d * 86_400_000 - hours * 3_600_000).toISOString();
const asks = (skill: string | null, topic: string, days: number[], subject: string | null = 'AM'): AskRow[] =>
  days.map(d => ({ skill, topic, subject, at: daysAgo(d) }));

describe('askSignalOn', () => {
  it('is on only for an explicit true', () => {
    expect(askSignalOn({ ask_signal: true })).toBe(true);
    expect(askSignalOn({ ask_signal: 'true' })).toBe(false);
    expect(askSignalOn({ ask_signal: false })).toBe(false);
    expect(askSignalOn({})).toBe(false);
    expect(askSignalOn(null)).toBe(false);
    expect(askSignalOn(undefined)).toBe(false);
    expect(askSignalOn([true])).toBe(false);
  });
});

describe('parseAskTopic', () => {
  it('takes the bare topic ask_skills stores', () => {
    expect(parseAskTopic('Trigonometry (Identities)')).toEqual({ subject: null, topic: 'Trigonometry (Identities)' });
  });
  it('still understands a prefixed label', () => {
    expect(parseAskTopic('AM: Trigonometry (Identities)')).toEqual({ subject: 'AM', topic: 'Trigonometry (Identities)' });
    expect(parseAskTopic('em:  Coordinate Geometry ')).toEqual({ subject: 'EM', topic: 'Coordinate Geometry' });
    expect(parseAskTopic('JC: Vectors')).toEqual({ subject: null, topic: 'Vectors' });
  });
  it('rejects blanks, placeholders and non-strings', () => {
    expect(parseAskTopic('')).toBeNull();
    expect(parseAskTopic('   ')).toBeNull();
    expect(parseAskTopic('unknown')).toBeNull();
    expect(parseAskTopic('AM: ')).toBeNull();
    expect(parseAskTopic('General')).toBeNull();
    expect(parseAskTopic(null)).toBeNull();
    expect(parseAskTopic(42)).toBeNull();
  });
});

describe('askTopicKey', () => {
  it('folds case and punctuation', () => {
    expect(askTopicKey('Proofs using the Pythagorean identity')).toBe(askTopicKey('proofs using the pythagorean identity'));
    expect(askTopicKey('R-formula: a sin θ ± b cos θ')).toBe('r formula a sin b cos');
  });
});

describe('askSignalLines', () => {
  it('is empty with nothing asked', () => {
    expect(askSignalLines([], NOW)).toEqual([]);
  });

  it(`needs ${ASK_SIGNAL_MIN} asks on one skill in the fortnight — two is not a line`, () => {
    expect(askSignalLines(asks('Solving log equations', 'Logarithms', [1, 5]), NOW)).toEqual([]);
    const [line] = askSignalLines(asks('Solving log equations', 'Logarithms', [1, 5, 9]), NOW);
    expect(line).toMatchObject({
      key: 'skill:solving log equations', skill: 'Solving log equations', topic: 'Logarithms', subject: 'AM',
      recent: 3, previous: 0, state: 'up',
    });
    expect(line.lastAt).toBe(daysAgo(1));
  });

  it('groups by SKILL, not topic: two skills in one topic are two lines', () => {
    const rows = [
      ...asks('Proofs using the Pythagorean identity', 'Trigonometry (Identities)', [1, 2, 3]),
      ...asks('Double/triple angle proof', 'Trigonometry (Identities)', [2, 3, 4]), // same count, older latest ask
    ];
    const lines = askSignalLines(rows, NOW);
    expect(lines.map(l => l.skill)).toEqual(['Proofs using the Pythagorean identity', 'Double/triple angle proof']);
  });

  it('three asks spread over three skills of one topic are NOT a line', () => {
    const rows = [
      ...asks('Proofs using the Pythagorean identity', 'Trigonometry (Identities)', [1]),
      ...asks('Double/triple angle proof', 'Trigonometry (Identities)', [2]),
      ...asks('Compound/sum-difference angle', 'Trigonometry (Identities)', [3]),
    ];
    expect(askSignalLines(rows, NOW)).toEqual([]);
  });

  it('an ask the bot could not file falls back to its topic — and never merges with a skill line', () => {
    const rows = [
      ...asks(null, 'Vectors', [1, 2, 3], null),
      ...asks('Ratio theorem', 'Vectors', [1, 2, 3], null),
    ];
    const lines = askSignalLines(rows, NOW);
    expect(lines).toHaveLength(2);
    expect(lines.map(l => l.key).sort()).toEqual(['skill:ratio theorem', 'topic:vectors']);
    const topicLine = lines.find(l => l.key === 'topic:vectors')!;
    expect(topicLine).toMatchObject({ skill: null, topic: 'Vectors', subject: null });
  });

  it('the same skill spelt with different case is one line', () => {
    const rows = [...asks('Sketch single trig curve', 'Trigonometry (Graphs)', [1, 2]), ...asks('sketch single trig curve', 'Trigonometry (Graphs)', [3])];
    expect(askSignalLines(rows, NOW)).toHaveLength(1);
  });

  it('the subject sticks only when every ask agrees; a legacy prefixed topic still supplies it', () => {
    const mixed = [...asks('Ratio theorem', 'Vectors', [1, 2], 'AM'), ...asks('Ratio theorem', 'Vectors', [3], 'EM')];
    expect(askSignalLines(mixed, NOW)[0].subject).toBeNull();
    const legacy: AskRow[] = [1, 2, 3].map(d => ({ skill: 'Ratio theorem', topic: 'AM: Vectors', subject: null, at: daysAgo(d) }));
    expect(askSignalLines(legacy, NOW)[0]).toMatchObject({ subject: 'AM', topic: 'Vectors' });
  });

  it('fades: busy the fortnight before, quiet now → Coming up less', () => {
    const [line] = askSignalLines(asks('Ratio theorem', 'Vectors', [15, 18, 24]), NOW);
    expect(line).toMatchObject({ state: 'less', recent: 0, previous: 3 });
  });

  it('is gone once both fortnights are quiet, and ignores asks older than the look-back', () => {
    expect(askSignalLines(asks('Ratio theorem', 'Vectors', [29, 30, 40]), NOW)).toEqual([]);
    expect(askSignalLines(asks('Ratio theorem', 'Vectors', [1, 2, 29, 30, 31]), NOW)).toEqual([]);
  });

  it('a busy earlier fortnight does not lift a quiet recent one into "up"', () => {
    const [line] = askSignalLines(asks('Tangent-chord', 'Circles', [2, 15, 16, 17]), NOW);
    expect(line).toMatchObject({ state: 'less', recent: 1, previous: 3 });
  });

  it('the fortnight boundary: exactly 14 days ago counts as recent', () => {
    const rows: AskRow[] = [
      { skill: 'Tangent-chord', topic: 'Circles', at: daysAgo(1) },
      { skill: 'Tangent-chord', topic: 'Circles', at: daysAgo(14) }, // exactly 14 days → recent
      { skill: 'Tangent-chord', topic: 'Circles', at: daysAgo(14, -1) }, // 13 days 23 h ago → recent
      { skill: 'Tangent-chord', topic: 'Circles', at: daysAgo(14, 1) }, // 14 days 1 h ago → previous
    ];
    const [line] = askSignalLines(rows, NOW);
    expect(line).toMatchObject({ state: 'up', recent: 3, previous: 1 });
  });

  it('drops rows with no topic, a placeholder topic, a bad time, or a far-future time', () => {
    const rows: AskRow[] = [
      { skill: 'Tangent-chord', topic: null, at: daysAgo(1) },
      { skill: 'Tangent-chord', topic: 'unknown', at: daysAgo(1) },
      { skill: 'Tangent-chord', topic: 'Circles', at: 'yesterday' },
      { skill: 'Tangent-chord', topic: 'Circles', at: null },
      { skill: 'Tangent-chord', topic: 'Circles', at: new Date(NOW.getTime() + 3_600_000).toISOString() },
      { skill: 'Tangent-chord', topic: 'Circles', at: daysAgo(1) },
      { skill: 'Tangent-chord', topic: 'Circles', at: daysAgo(2) },
    ];
    expect(askSignalLines(rows, NOW)).toEqual([]);
  });

  it('orders: up before less, busier first, then the latest ask', () => {
    const rows = [
      ...asks('Ratio theorem', 'Vectors', [15, 16, 17]), // less
      ...asks('Solving log equations', 'Logarithms', [1, 2, 3]), // up, 3
      ...asks('Tangent-chord', 'Circles', [1, 2, 3, 4]), // up, 4
      ...asks('Mean from a table', 'Statistics', [0, 5, 6]), // up, 3, latest ask newer than the logs
    ];
    expect(askSignalLines(rows, NOW).map(l => l.skill)).toEqual(['Tangent-chord', 'Mean from a table', 'Solving log equations', 'Ratio theorem']);
  });
});

describe('copy', () => {
  it('titles a skill line by its skill and a fallback line by its topic', () => {
    expect(askLineTitle({ skill: 'Tangent-chord', topic: 'Circles' })).toBe('Tangent-chord');
    expect(askLineTitle({ skill: null, topic: 'Circles' })).toBe('Circles');
  });
  it('puts the topic (and paper) under a skill line, nothing under a topic line', () => {
    expect(askLineContext({ skill: 'Tangent-chord', topic: 'Circles', subject: 'AM' })).toBe('AM · Circles');
    expect(askLineContext({ skill: 'Tangent-chord', topic: 'Circles', subject: null })).toBe('Circles');
    expect(askLineContext({ skill: null, topic: 'Circles', subject: 'AM' })).toBe('');
  });
  it('names the states', () => {
    expect(askStateLabel('up')).toBe('Keeps coming up');
    expect(askStateLabel('less')).toBe('Coming up less');
  });
  it('says what happened', () => {
    const [up] = askSignalLines(asks('Tangent-chord', 'Circles', [1, 2, 3]), NOW);
    expect(askSignalLine(up)).toBe('you asked about this 3 times in the last 2 weeks');
    const [less] = askSignalLines(asks('Tangent-chord', 'Circles', [15, 16, 17]), NOW);
    expect(askSignalLine(less)).toBe('3 times the fortnight before · none since');
    const [lessSome] = askSignalLines(asks('Tangent-chord', 'Circles', [2, 15, 16, 17]), NOW);
    expect(askSignalLine(lessSome)).toBe('3 times the fortnight before · 1 since');
  });
});
