import { describe, it, expect } from 'vitest';
import {
  buildShortPrompt, buildSummaryPrompt, checkEditing, lineWords, editingAccepts, isTick, marksLine, parseShortReply, parseSummaryReply,
  parseUnitKey, passageLabel, publicUnit, ruleShort, schemeShown, servable, SHORT_RULES, SUMMARY_RULES, summaryContentMax, toEditingSet, toScheme, unitsOf, withinLimit, wordCount,
  type EditingSet, type ItemRow,
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

describe('a choice', () => {
  const opts = [{ label: 'A', text: 'an angry complaint' }, { label: 'B', text: 'a personal request, made politely' }, { label: 'C', text: 'a list of rules' }];
  const c = (answer: string) => ({ kind: 'choice' as const, options: opts, sectionKind: 'visual_text', scheme: { answer, accept: [], points: [] } });
  it('an answer that begins with the word "a" is not option A', () => {
    expect(ruleShort(c('a personal request, made politely'), 'A')).toBe(false);
    expect(ruleShort(c('a personal request, made politely'), 'B')).toBe(true);
  });
  it('the scheme may name the option by letter and words', () => {
    expect(ruleShort(c('B — a personal request, made politely'), 'B')).toBe(true);
    expect(ruleShort(c('B — a personal request, made politely'), 'C')).toBe(false);
    expect(ruleShort(c('B'), 'B')).toBe(true);
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

describe('what is shown after the check', () => {
  it('carries no mark codes', () => {
    expect(schemeShown({ answer: 'It was shut [1], so he lost his stall [1].', accept: [], points: [] }).answer).toBe('It was shut, so he lost his stall.');
  });
});

// 13 Oct 2026 (Adrian): circle the wrong word, then correct it — as in the exam.
describe('editing: circle, then correct', () => {
  const set: EditingSet = { itemId: 'x', text: '', lines: [
    { label: '1', where: 'Line 1', scheme: 'opened', note: 'Tense.', wrong: 'open' },
    { label: '2', where: 'Line 2', scheme: '✓', note: null },
  ] };
  const one = (label: string, a: unknown) => checkEditing(set, { [label]: a }).results.find(r => r.label === label)!;
  it('right only when the circle and the correction are both right', () => {
    expect(one('1', { circled: 'open', word: 'opened' })).toMatchObject({ ok: true, circledOk: true, wrongWord: 'open' });
    expect(one('1', { circled: 'stall', word: 'opened' })).toMatchObject({ ok: false, circledOk: false });
    expect(one('1', { circled: 'Open', word: 'had' })).toMatchObject({ ok: false, circledOk: true });
  });
  it('a tick on a line with a mistake is wrong; on a clean line it is right', () => {
    expect(one('1', '✓')).toMatchObject({ ok: false, yours: '✓' });
    expect(one('2', '✓')).toMatchObject({ ok: true, wrongWord: null });
  });
  it('circling a word in a clean line is wrong', () => {
    expect(one('2', { circled: 'the', word: 'a' })).toMatchObject({ ok: false, circledOk: false });
  });
  it('an old answer with no circle is marked on the correction', () => {
    expect(one('1', 'opened').ok).toBe(true);
  });
  it('lineWords keeps punctuation outside the word', () => {
    expect(lineWords('soup, and "it" grew.')).toEqual([
      { before: '', word: 'soup', after: ',' }, { before: '', word: 'and', after: '' },
      { before: '"', word: 'it', after: '"' }, { before: '', word: 'grew', after: '.' },
    ]);
  });
});

// The schools' marking habits (docs/english-marking-conventions.md, 14 Oct 2026) — one list, read by the
// page's prompt and the plan bench's sheets alike.
describe('school marking conventions in the prompts', () => {
  const u = { stem: null, text: 'What does this suggest?', marks: 2, scheme: { answer: 'A.', accept: [], points: ['a', 'b'] } };
  it('every short-answer rule reaches the prompt', () => {
    const p = buildShortPrompt(u, 'x', 'passage');
    for (const r of SHORT_RULES) expect(p).toContain(r);
    expect(p).toMatch(/excess denied/);
    expect(p).toMatch(/naming the device alone/);
    expect(p).toMatch(/lifting is right/);
  });
  it('every summary rule reaches the prompt; lifting costs language, not content', () => {
    const p = buildSummaryPrompt(u, 'x', 'passage');
    for (const r of SUMMARY_RULES) expect(p).toContain(r);
    expect(p).toMatch(/Lifting costs the language mark, not content/);
  });
});
