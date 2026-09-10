import { describe, expect, it } from 'vitest';
import {
  ASK_SIGNAL_MIN,
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
const asks = (topic: string, days: number[]): AskRow[] => days.map(d => ({ topic, at: daysAgo(d) }));

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
  it('strips the paper prefix the web solver writes', () => {
    expect(parseAskTopic('AM: Trigonometry (Identities)')).toEqual({ subject: 'AM', topic: 'Trigonometry (Identities)' });
    expect(parseAskTopic('EM: Mensuration')).toEqual({ subject: 'EM', topic: 'Mensuration' });
    expect(parseAskTopic('em:  Coordinate Geometry ')).toEqual({ subject: 'EM', topic: 'Coordinate Geometry' });
  });
  it('keeps a bare Telegram label with no subject', () => {
    expect(parseAskTopic('Vectors')).toEqual({ subject: null, topic: 'Vectors' });
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
  it('folds case and punctuation so the two paths meet', () => {
    expect(askTopicKey('Trigonometry (Identities)')).toBe(askTopicKey('trigonometry identities'));
    expect(askTopicKey('Series and Sequences')).toBe('series and sequences');
  });
});

describe('askSignalLines', () => {
  it('is empty with nothing asked', () => {
    expect(askSignalLines([], NOW)).toEqual([]);
  });

  it(`needs ${ASK_SIGNAL_MIN} asks in the fortnight — two is not a line`, () => {
    expect(askSignalLines(asks('AM: Logarithms', [1, 5]), NOW)).toEqual([]);
    const [line] = askSignalLines(asks('AM: Logarithms', [1, 5, 9]), NOW);
    expect(line).toMatchObject({ topic: 'Logarithms', subject: 'AM', recent: 3, previous: 0, state: 'up' });
    expect(line.lastAt).toBe(daysAgo(1));
  });

  it('merges the web "AM: X" spelling with the Telegram bare "X"', () => {
    const rows = [...asks('AM: Trigonometry (Identities)', [1, 2]), ...asks('Trigonometry (Identities)', [3])];
    const lines = askSignalLines(rows, NOW);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ topic: 'Trigonometry (Identities)', recent: 3, state: 'up' });
    // mixed prefixes → no subject claimed
    expect(lines[0].subject).toBeNull();
  });

  it('shows the most common spelling as the title', () => {
    const rows = [...asks('EM: mensuration', [1]), ...asks('EM: Mensuration', [2, 3])];
    expect(askSignalLines(rows, NOW)[0].topic).toBe('Mensuration');
  });

  it('fades: busy the fortnight before, quiet now → Coming up less', () => {
    const [line] = askSignalLines(asks('EM: Vectors', [15, 18, 24]), NOW);
    expect(line).toMatchObject({ state: 'less', recent: 0, previous: 3 });
  });

  it('is gone once both fortnights are quiet, and ignores asks older than the look-back', () => {
    expect(askSignalLines(asks('EM: Vectors', [29, 30, 40]), NOW)).toEqual([]);
    // three old asks plus two new ones: the old ones do not count toward "up"
    expect(askSignalLines(asks('EM: Vectors', [1, 2, 29, 30, 31]), NOW)).toEqual([]);
  });

  it('a busy earlier fortnight does not lift a quiet recent one into "up"', () => {
    const [line] = askSignalLines(asks('AM: Circles', [2, 15, 16, 17]), NOW);
    expect(line).toMatchObject({ state: 'less', recent: 1, previous: 3 });
  });

  it('the fortnight boundary: exactly 14 days ago counts as recent', () => {
    const rows: AskRow[] = [
      { topic: 'AM: Circles', at: daysAgo(1) },
      { topic: 'AM: Circles', at: daysAgo(14) }, // exactly 14 days → recent
      { topic: 'AM: Circles', at: daysAgo(14, -1) }, // 13 days 23 h ago → recent
      { topic: 'AM: Circles', at: daysAgo(14, 1) }, // 14 days 1 h ago → previous
    ];
    const [line] = askSignalLines(rows, NOW);
    expect(line).toMatchObject({ state: 'up', recent: 3, previous: 1 });
  });

  it('drops rows with no topic, a placeholder topic, a bad time, or a far-future time', () => {
    const rows: AskRow[] = [
      { topic: null, at: daysAgo(1) },
      { topic: 'unknown', at: daysAgo(1) },
      { topic: 'AM: Circles', at: 'yesterday' },
      { topic: 'AM: Circles', at: null },
      { topic: 'AM: Circles', at: new Date(NOW.getTime() + 3_600_000).toISOString() },
      { topic: 'AM: Circles', at: daysAgo(1) },
      { topic: 'AM: Circles', at: daysAgo(2) },
    ];
    expect(askSignalLines(rows, NOW)).toEqual([]);
  });

  it('orders: up before less, busier first, then the latest ask', () => {
    const rows = [
      ...asks('EM: Vectors', [15, 16, 17]), // less
      ...asks('AM: Logarithms', [1, 2, 3]), // up, 3
      ...asks('AM: Circles', [1, 2, 3, 4]), // up, 4
      ...asks('EM: Statistics', [0, 5, 6]), // up, 3, latest ask newer than Logarithms
    ];
    expect(askSignalLines(rows, NOW).map(l => l.topic)).toEqual(['Circles', 'Statistics', 'Logarithms', 'Vectors']);
  });
});

describe('copy', () => {
  it('names the states', () => {
    expect(askStateLabel('up')).toBe('Keeps coming up');
    expect(askStateLabel('less')).toBe('Coming up less');
  });
  it('says what happened', () => {
    const [up] = askSignalLines(asks('AM: Circles', [1, 2, 3]), NOW);
    expect(askSignalLine(up)).toBe('you asked about this 3 times in the last 2 weeks');
    const [less] = askSignalLines(asks('AM: Circles', [15, 16, 17]), NOW);
    expect(askSignalLine(less)).toBe('3 times the fortnight before · none since');
    const [lessSome] = askSignalLines(asks('AM: Circles', [2, 15, 16, 17]), NOW);
    expect(askSignalLine(lessSome)).toBe('3 times the fortnight before · 1 since');
  });
});
