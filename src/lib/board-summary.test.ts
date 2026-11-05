import { describe, expect, it } from 'vitest';
import { parentNumbersNotOnBoard, parentShareText, parseParentNote, boardTranscript, dropUnsupported, levelFrom, numbersIn, numbersNotOnBoard, parseSummary, summaryHasContent, summarySig } from './board-summary';

const topics = ['Quadratic Equations', 'Linear Equations'];
const pt = { 0: { text: 'Solve x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2 or x = 3', sig: 'a', at: '' }, 2: { text: '', sig: 'b', at: '' }, 1: { text: 'A0 sign error: -3x + 2x = -x', sig: 'c', at: '' } };

describe('the board as text', () => {
  it('lists pages in order, leaving empty ones out', () => {
    const t = boardTranscript(pt);
    expect(t.indexOf('Page 1')).toBeLessThan(t.indexOf('Page 2'));
    expect(t).not.toContain('Page 3');
  });
  it('changes its stamp when a page reading changes', () => {
    expect(summarySig(pt)).toBe(summarySig({ ...pt }));
    expect(summarySig({ ...pt, 0: { ...pt[0], sig: 'z' } })).not.toBe(summarySig(pt));
  });
});

describe('level', () => {
  it('reads a tutor\'s free-text level or a paper subject', () => {
    expect(levelFrom('Sec 4 A Math')).toBe('AM');
    expect(levelFrom(null, 'E Math')).toBe('EM');
    expect(levelFrom('JC1')).toBe('JC');
    expect(levelFrom('H2 Math')).toBe('JC');
    expect(levelFrom('Sec 2')).toBe('S2');
    expect(levelFrom('', null)).toBeNull();
  });
});

describe('reading the writer', () => {
  it('keeps a topic only when it is on the list', () => {
    const raw = 'Here:\n```json\n{"level":"EM","topic":"Quadratic Equations","didToday":["Solved $x^2 - 5x + 6 = 0$"],"method":{"title":"Factorise","steps":["Factorise","Set each bracket to 0"]},"watchOut":null}\n```';
    const d = parseSummary(raw, topics, null)!;
    expect(d.topic).toBe('Quadratic Equations');
    expect(d.level).toBe('EM');
    expect(parseSummary(raw.replace('Quadratic Equations', 'Made Up Topic'), topics, 'AM')!).toMatchObject({ topic: null, level: 'AM' });
    expect(parseSummary('no json here', topics, null)).toBeNull();
  });
  it('drops a method with fewer than two steps', () => {
    expect(parseSummary('{"didToday":[],"method":{"title":"x","steps":["one"]},"watchOut":null}', topics, null)!.method).toBeNull();
  });
});

describe('every number must be on the board', () => {
  it('ignores single digits and LaTeX names', () => {
    expect(numbersIn('$\\frac{12}{5}$ and x^2 = 3.5, step 2')).toEqual(['12', '3.5']);
  });
  it('finds a number the board never had, and drops that line after the second try', () => {
    const transcript = boardTranscript(pt);
    const d = { didToday: ['Solved $x^2 - 5x + 6 = 0$', 'Then tried $x = 17$'], method: { title: 'Factorise', steps: ['Write $(x-2)(x-3)$', 'Set each to 0'] }, watchOut: { mistake: 'Wrote 25', fix: 'Check signs' }, topic: null, level: null };
    expect(numbersNotOnBoard(d, transcript).map(x => x.number)).toEqual(['17', '25']);
    const kept = dropUnsupported(d, transcript);
    expect(kept.didToday).toEqual(['Solved $x^2 - 5x + 6 = 0$']);
    expect(kept.watchOut).toBeNull();
    expect(kept.method).not.toBeNull();
    expect(summaryHasContent(kept)).toBe(true);
    expect(summaryHasContent({ didToday: [], method: null, watchOut: null, topic: null, level: null })).toBe(false);
  });
});


describe('the note to the parent', () => {
  it('needs all three parts', () => {
    expect(parseParentNote('{"worked":"Expanding brackets.","watch":"Signs.","help":"Ask them to check signs."}')).toMatchObject({ worked: 'Expanding brackets.' });
    expect(parseParentNote('{"worked":"x","watch":"","help":"y"}')).toBeNull();
  });
  it('holds its numbers to the board', () => {
    const t = boardTranscript(pt);
    expect(parentNumbersNotOnBoard({ worked: 'Solved x^2 - 5x + 6 = 0', watch: 'Got 42 once', help: 'Practise 10 minutes' }, t)).toEqual(['42', '10']);
  });
  it('writes the WhatsApp line', () => {
    expect(parentShareText('Wei Ming', 'Ms Tan', 'https://x/p/k')).toBe("Hi, a short note on today's maths lesson with Wei Ming — Ms Tan: https://x/p/k");
  });
});
