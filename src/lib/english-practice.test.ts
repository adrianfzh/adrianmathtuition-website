import { describe, it, expect } from 'vitest';
import {
  buildShortPrompt, buildSummaryPrompt, checkEditing, editingAccepts, isTick, marksLine, parseShortReply, parseSummaryReply,
  parseUnitKey, passageLabel, publicUnit, ruleShort, servable, summaryContentMax, toEditingSet, toScheme, unitsOf, withinLimit, wordCount,
  type ItemRow,
} from './english-practice';

const ID = '86adf3be-7723-4f00-a8db-a2617cd55a72';
const base: ItemRow = {
  id: ID, section_kind: 'comprehension', question_number: '5', question_text: 'Why did she leave? Answer in your own words.',
  options: null, parts: null, total_marks: 2, answer: { answer: 'She felt unwelcome.', marks_note: 'excess denied' },
  text_id: 't', level: 'EL', national: false, answer_source: 'mark_scheme', deleted_at: null,
};

describe('the serve gate', () => {
  it('serves only live school rows with their own scheme', () => {
    expect(servable(base)).toBe(true);
    expect(servable({ ...base, national: true })).toBe(false);
    expect(servable({ ...base, deleted_at: '2026-10-06' })).toBe(false);
    expect(servable({ ...base, answer_source: 'none' })).toBe(false);
    expect(servable({ ...base, level: 'S2_EL' })).toBe(false);
  });
  it('a national row or a row with no scheme gives no units', () => {
    expect(unitsOf({ ...base, national: true })).toEqual([]);
    expect(unitsOf({ ...base, answer: null })).toEqual([]);
  });
});

describe('units', () => {
  it('one unit for a plain question; the public copy has no scheme', () => {
    const [u] = unitsOf(base);
    expect(u.key).toBe(ID);
    expect(u.marks).toBe(2);
    expect(u.scheme.answer).toBe('She felt unwelcome.');
    expect(JSON.stringify(publicUnit(u))).not.toMatch(/unwelcome|excess denied/);
  });
  it('one unit per part, and a part with no scheme is left out', () => {
    const us = unitsOf({ ...base, parts: [
      { label: 'i', text: 'What does it suggest?', marks: 1, answer: { answer: 'He was persistent', accept: ['determined'] } },
      { label: 'ii', text: 'Write down one detail.', marks: 1, answer: null },
    ] });
    expect(us.map(u => u.key)).toEqual([`${ID}:i`]);
    expect(us[0].number).toBe('5(i)');
    expect(us[0].stem).toMatch(/Why did she leave/);
  });
  it('a summary and a choice question are their own kinds', () => {
    expect(unitsOf({ ...base, section_kind: 'summary', total_marks: 15, answer: { answer: 'x', points: ['a', 'b'] } })[0].kind).toBe('summary');
    expect(unitsOf({ ...base, options: [{ label: 'A', text: 'one' }, { label: 'B', text: 'two' }], answer: { answer: 'B' } })[0].kind).toBe('choice');
  });
  it('never carries the marker’s note', () => {
    expect(JSON.stringify(toScheme(base.answer))).not.toMatch(/excess denied/);
  });
  it('unit keys parse, and junk does not', () => {
    expect(parseUnitKey(`${ID}:ii`)).toEqual({ itemId: ID, label: 'ii' });
    expect(parseUnitKey(ID)).toEqual({ itemId: ID, label: null });
    expect(parseUnitKey('x; drop table')).toBeNull();
  });
});

describe('editing', () => {
  const row: ItemRow = {
    ...base, section_kind: 'editing', question_text: 'Carefully read the text below…', total_marks: 10, answer: null,
    parts: ['for', 'no error', '✓ (no error)', 'nearer', 'in (pp)', 'because / as', '√', 'reported', 'its (pronoun)', 'include']
      .map((a, i) => ({ label: String(i + 1), text: `Line ${i + 2}`, marks: 1, answer: { answer: a, marks_note: i === 0 ? 'The preposition “for” fits here.' : undefined } })),
  };
  it('reads a tick in every form schools write it', () => {
    for (const t of ['✓', '√', 'no error', 'No Error', 'tick', '✓ (no error)', 'correct']) expect(isTick(t)).toBe(true);
    expect(isTick('for')).toBe(false);
  });
  it('strips the marker’s labels and splits alternatives', () => {
    expect(editingAccepts('in (pp)')).toEqual({ tick: false, words: ['in'] });
    expect(editingAccepts('because / as').words).toEqual(['because', 'as']);
    expect(editingAccepts('✓ (no error)').tick).toBe(true);
  });
  it('marks ten lines by rule', () => {
    const set = toEditingSet(row)!;
    expect(set.lines).toHaveLength(10);
    const { results, right, total } = checkEditing(set, { 1: 'For', 2: '✓', 3: 'no error', 4: 'near', 5: 'in', 6: 'as', 7: 'tick', 8: '', 9: 'its', 10: '✓' });
    expect(total).toBe(10);
    expect(results.map(r => r.ok)).toEqual([true, true, true, false, true, true, true, false, true, false]);
    expect(right).toBe(7);
    expect(results[4].correct).toBe('in');
    expect(results[0].note).toMatch(/preposition/);
  });
  it('an editing row without its lines is not served', () => {
    expect(toEditingSet({ ...row, parts: null })).toBeNull();
    expect(toEditingSet({ ...row, parts: row.parts!.slice(0, 4) })).toBeNull();
  });
});

describe('short answers', () => {
  const [u] = unitsOf(base);
  it('the rule decides only what is exact; a paraphrase goes to the reader', () => {
    expect(ruleShort(u, 'She felt unwelcome')).toBe(true);
    expect(ruleShort(u, 'Nobody made her feel at home')).toBeNull();
    expect(ruleShort(u, '   ')).toBe(false);
  });
  it('a which-word question is exact', () => {
    const v = unitsOf({ ...base, section_kind: 'vocabulary', total_marks: 1, answer: { answer: '‘trudged’' } })[0];
    expect(ruleShort(v, 'Trudged')).toBe(true);
    expect(ruleShort(v, 'walked')).toBe(false);
  });
  it('a choice is matched by its letter or its words', () => {
    const c = unitsOf({ ...base, options: [{ label: 'A', text: 'one' }, { label: 'B', text: 'two' }], answer: { answer: 'B' } })[0];
    expect(ruleShort(c, 'b')).toBe(true);
    expect(ruleShort(c, 'A')).toBe(false);
  });
  it('the prompt carries the scheme and the answer; the reply is clamped', () => {
    const p = buildShortPrompt(u, 'She was lonely', 'A long passage.');
    expect(p).toMatch(/She felt unwelcome/);
    expect(p).toMatch(/She was lonely/);
    expect(parseShortReply('{"awarded": 5, "why": "Right idea.", "missing": null}', 2)).toEqual({ awarded: 2, why: 'Right idea.', missing: null });
    expect(parseShortReply('ok {"awarded": 1, "why": "Half the idea.", "missing": "why she felt it"}', 2)?.missing).toBe('why she felt it');
    expect(parseShortReply('no json', 2)).toBeNull();
    expect(parseShortReply('{"awarded": "x", "why": "y"}', 2)).toBeNull();
  });
});

describe('the summary', () => {
  const s = unitsOf({ ...base, section_kind: 'summary', total_marks: 15, answer: { answer: 'Model.', points: ['p1', 'p2', 'p3'] } })[0];
  it('counts words and cuts at the limit', () => {
    expect(wordCount('  one two\nthree ')).toBe(3);
    expect(wordCount(withinLimit(Array(120).fill('w').join(' ')))).toBe(80);
  });
  it('content is out of the listed points, eight at most', () => {
    expect(summaryContentMax(s.scheme)).toBe(3);
    expect(summaryContentMax({ answer: 'x', accept: [], points: Array(11).fill('p') })).toBe(8);
  });
  it('the prompt lists the points; the reply keeps only real point numbers', () => {
    expect(buildSummaryPrompt(s, 'mine', 'passage')).toMatch(/1\. p1\n2\. p2\n3\. p3/);
    expect(parseSummaryReply('{"hit":[1,3,3,9,"x"],"language":"Mostly your own words."}', 3)).toEqual({ hit: [1, 3], language: 'Mostly your own words.' });
    expect(parseSummaryReply('{"hit":"all"}', 3)).toBeNull();
  });
});

describe('what the student reads', () => {
  it('marks line and passage label', () => {
    expect(marksLine(1, 2)).toBe('1 of 2 marks');
    expect(marksLine(0.5, 1)).toBe('0.5 of 1 mark');
    expect(passageLabel(null, 'Healthy oceans are essential to life on earth as they are at the heart')).toBe('Healthy oceans are essential to life on earth as …');
    expect(passageLabel('Voles', 'x')).toBe('Voles');
  });
});
