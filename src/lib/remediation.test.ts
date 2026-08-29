import { describe, it, expect } from 'vitest';
import {
  extractLossEvidence, classifyLossDeterministic, buildDraftPrompt, parsePlanDraft,
  defaultClearRule, marksRecoverable, relockItems, attemptClears, nextOpenItem, planDone,
  type LossEvidence, type LossClass,
} from './remediation';

// Fixtures echo the SHAPE of real marking rows (paper_marking_runs.result_json)
// with invented content — the 30 Aug 2026 diagnostic's patterns, no student data.

function run(parts: Array<[string, string, number, number, Partial<{ na: boolean; err: string; note: string }>]>, topic = 'Integration') {
  return {
    results: parts.map(([q, label, awarded, max, o]) => ({
      question_number: q,
      marking: { parts: [{ label, awarded, max, not_attempted: o?.na ?? false, error_summary: o?.err ?? null, study_note: o?.note ?? null }] },
      marking_output: { meta: { topic_detected: topic } },
    })),
  };
}

describe('extractLossEvidence', () => {
  it('keeps only below-max parts, with flags and topic', () => {
    const ev = extractLossEvidence(run([
      ['1', '', 3, 3, {}],
      ['4', '', 1, 4, { err: 'left out the 1/3' }],
      ['10', '(a)', 0, 4, { na: true }],
    ]));
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ q: '4', part: '', awarded: 1, max: 4, notAttempted: false });
    expect(ev[1]).toMatchObject({ q: '10', part: '(a)', notAttempted: true, topic: 'Integration' });
  });
  it('survives junk input', () => {
    expect(extractLossEvidence(null)).toEqual([]);
    expect(extractLossEvidence({ results: [{}] })).toEqual([]);
  });
});

describe('classifyLossDeterministic', () => {
  const base: LossEvidence = { q: '1', part: '', awarded: 0, max: 4, notAttempted: false, errorSummary: '', studyNote: '', topic: '' };
  it('not_attempted is blank', () => {
    expect(classifyLossDeterministic({ ...base, notAttempted: true })).toBe('blank');
  });
  it('nothing-written phrasing is blank', () => {
    expect(classifyLossDeterministic({ ...base, errorSummary: 'Nothing written: use energy = rating × hours' })).toBe('blank');
  });
  it('units / conclusions / signs are discipline', () => {
    expect(classifyLossDeterministic({ ...base, errorSummary: 'Areas are in cm², not cm³ — wrong units throughout.' })).toBe('discipline');
    expect(classifyLossDeterministic({ ...base, errorSummary: 'you never stated the conclusion — write "I do not agree"' })).toBe('discipline');
    expect(classifyLossDeterministic({ ...base, errorSummary: '$-A = 3$ gives $A = -3$ — divide both sides by $-1$.' })).toBe('discipline');
  });
  it('everything else defers to the model', () => {
    expect(classifyLossDeterministic({ ...base, errorSummary: 'you left out the 1/3 factor' })).toBeNull();
  });
});

describe('parsePlanDraft — grounded like revise-map', () => {
  const evidence: LossEvidence[] = [
    { q: '4', part: '', awarded: 1, max: 4, notAttempted: false, errorSummary: 'left out the 1/3', studyNote: '', topic: 'Integration' },
    { q: '13', part: '(a)(ii)', awarded: 1, max: 3, notAttempted: false, errorSummary: 'reciprocal flip', studyNote: '', topic: 'Rates' },
    { q: '12', part: '(a)', awarded: 0, max: 4, notAttempted: true, errorSummary: '', studyNote: '', topic: 'Logarithms' },
  ];
  const pre = new Map<string, LossClass>([['Q12(a)', 'blank']]);

  it('keeps grounded items, drops hallucinated refs, caps and dedupes', () => {
    const text = JSON.stringify({ items: [
      { skill: 'integrate 1/(ax+b) with the 1/a factor', class: 'procedure', topic: 'Integration', evidence: ['Q4', 'Q99'] },
      { skill: 'reciprocal of a product flips everything', class: 'procedure', topic: 'Rates', evidence: ['Q13(a)(ii)', 'Q4'] },
      { skill: 'exp/log first moves', class: 'concept', topic: 'Logarithms', evidence: ['Q12(a)'] },
    ] });
    const items = parsePlanDraft(text, evidence, pre);
    expect(items).toHaveLength(3);
    expect(items[0].evidence).toEqual(['Q4']);
    expect(items[1].evidence).toEqual(['Q13(a)(ii)']); // Q4 already used
    expect(items[2].lossClass).toBe('blank');           // pre-classification wins over 'concept'
    expect(items[2].kind).toBe('probe');                // fully blank, no error text → probe first
    expect(items.map((i) => i.seq)).toEqual([1, 2, 3]);
  });
  it('an unparseable or empty draft returns [] instead of throwing', () => {
    expect(parsePlanDraft('the model rambled', evidence, pre)).toEqual([]);
    expect(parsePlanDraft('{"items":[]}', evidence, pre)).toEqual([]);
    expect(parsePlanDraft('{"items":[{"skill":"x","class":"nope","evidence":["Q4"]}]}', evidence, pre)).toEqual([]);
  });
  it('prompt carries every ref and marks fixed classes', () => {
    const p = buildDraftPrompt(evidence, pre);
    expect(p).toContain('Q13(a)(ii)');
    expect(p).toContain('class=blank (fixed)');
  });
  it('marksRecoverable sums the gaps', () => {
    expect(marksRecoverable({ evidence: ['Q4', 'Q12(a)'] }, evidence)).toBe(3 + 4);
  });
});

describe('clear rules + state machine', () => {
  it('defaults: blanks clear at half, others need full marks', () => {
    expect(defaultClearRule('blank')).toEqual({ kind: 'min_frac', frac: 0.5 });
    expect(defaultClearRule('procedure')).toEqual({ kind: 'full_marks' });
  });
  it('attemptClears boundaries', () => {
    expect(attemptClears({ kind: 'full_marks' }, 4, 4)).toBe(true);
    expect(attemptClears({ kind: 'full_marks' }, 3, 4)).toBe(false);
    expect(attemptClears({ kind: 'min_frac', frac: 0.5 }, 2, 4)).toBe(true);
    expect(attemptClears({ kind: 'min_frac', frac: 0.5 }, 1, 4)).toBe(false);
    expect(attemptClears({ kind: 'self_attest' }, 4, 4)).toBe(false);
    expect(attemptClears({ kind: 'full_marks' }, 1, 0)).toBe(false);
  });
  it('relockItems: exactly one frontier item open, awaiting_marking preserved there', () => {
    const items = relockItems([
      { id: 'a', seq: 1, state: 'cleared' as const },
      { id: 'b', seq: 2, state: 'awaiting_marking' as const },
      { id: 'c', seq: 3, state: 'open' as const },
      { id: 'd', seq: 4, state: 'locked' as const },
    ]);
    expect(items.map((i) => i.state)).toEqual(['cleared', 'awaiting_marking', 'locked', 'locked']);
    const fresh = relockItems([
      { id: 'a', seq: 1, state: 'locked' as const },
      { id: 'b', seq: 2, state: 'locked' as const },
    ]);
    expect(fresh.map((i) => i.state)).toEqual(['open', 'locked']);
  });
  it('nextOpenItem and planDone', () => {
    const items = [
      { id: 'a', seq: 1, state: 'cleared' as const },
      { id: 'b', seq: 2, state: 'open' as const },
    ];
    expect(nextOpenItem(items)?.id).toBe('b');
    expect(planDone(items)).toBe(false);
    expect(planDone([{ id: 'a', seq: 1, state: 'cleared' }, { id: 'b', seq: 2, state: 'skipped' }])).toBe(true);
    expect(planDone([])).toBe(false);
  });
});

describe('reminder field (the collapsed 💡 above each drill, 30 Aug 2026)', () => {
  it('rides the draft parse onto the item, trimmed', () => {
    const evidence = [{ q: '4', part: '', awarded: 1, max: 4, notAttempted: false, errorSummary: 'x', studyNote: '', topic: 'Integration' }] as LossEvidence[];
    const items = parsePlanDraft(JSON.stringify({ items: [
      { skill: 'integrate 1/(ax+b)', class: 'procedure', reminder: '  Only 1/(ax+b) gives a log.  ', evidence: ['Q4'] },
    ] }), evidence, new Map());
    expect(items[0].reminder).toBe('Only 1/(ax+b) gives a log.');
    expect(buildDraftPrompt(evidence, new Map())).toContain('"reminder"');
  });
});
