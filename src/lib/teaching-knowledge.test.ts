import { describe, it, expect } from 'vitest';
import {
  EMPTY_KNOWLEDGE, knowledgeSubjectForLevel, topicList, shapeKnowledge,
  methodHintMarkdown, methodsPromptLines, pitfallsPromptLines, loadTeachingKnowledge,
  contentWords, filterRedundantMethods, loadDeckPlan,
} from './teaching-knowledge';

describe('knowledgeSubjectForLevel (mirror of SQL teaching_subject_for_level)', () => {
  it('folds fine levels onto the knowledge subjects', () => {
    expect(knowledgeSubjectForLevel('AM')).toBe('AM');
    expect(knowledgeSubjectForLevel('S3_AM')).toBe('AM');
    expect(knowledgeSubjectForLevel('s4_am')).toBe('AM');
    expect(knowledgeSubjectForLevel('EM')).toBe('EM');
    expect(knowledgeSubjectForLevel('EM_NA')).toBe('EM');
    expect(knowledgeSubjectForLevel('S3_EM')).toBe('EM');
    expect(knowledgeSubjectForLevel('JC1')).toBe('JC');
    expect(knowledgeSubjectForLevel('JC2_H1')).toBe('JC');
    expect(knowledgeSubjectForLevel('S1')).toBe('S1');
    expect(knowledgeSubjectForLevel('S2')).toBe('S2');
  });
  it('sends science levels nowhere — CHEM must not read as EM', () => {
    expect(knowledgeSubjectForLevel('CHEM')).toBeNull();
    expect(knowledgeSubjectForLevel('PHY')).toBeNull();
    expect(knowledgeSubjectForLevel('BIO')).toBeNull();
    expect(knowledgeSubjectForLevel('S3_BIO')).toBeNull();
  });
  it('is null for nothing', () => {
    expect(knowledgeSubjectForLevel('')).toBeNull();
    expect(knowledgeSubjectForLevel(null)).toBeNull();
    expect(knowledgeSubjectForLevel(undefined)).toBeNull();
    expect(knowledgeSubjectForLevel('S3')).toBeNull();
  });
});

describe('topicList', () => {
  it('accepts an array, a string, and garbage', () => {
    expect(topicList(['Logarithms', ' Surds ', '', null])).toEqual(['Logarithms', 'Surds']);
    expect(topicList('Surds')).toEqual(['Surds']);
    expect(topicList(null)).toEqual([]);
    expect(topicList(42)).toEqual([]);
  });
});

describe('shapeKnowledge', () => {
  it('shapes the RPC jsonb defensively', () => {
    const k = shapeKnowledge({
      subject: 'AM',
      methods: [{ id: 'm1', topic: 'Surds', question_type: 'Rationalising', method: 'Multiply by the conjugate.', watch_out: null }, { method: '' }, null],
      pitfalls: [{ id: 'p1', wrong_move: 'Squaring term by term', why_wrong: 'A two-term side needs the middle term.', corrective_cue: 'Square each SIDE as a bracket.' }, { wrong_move: '  ' }],
      formulae: [{ area: 'Trig', result: 'R-formula', statement: 'a cos θ + b sin θ = R cos(θ − α)', given_status: 'memorise' }, 'junk'],
    });
    expect(k.subject).toBe('AM');
    expect(k.methods).toHaveLength(1);
    expect(k.methods[0]).toMatchObject({ id: 'm1', question_type: 'Rationalising', watch_out: null });
    expect(k.pitfalls).toHaveLength(1);
    expect(k.pitfalls[0].context).toBeNull();
    expect(k.formulae).toHaveLength(1);
  });
  it('returns empty arrays for junk', () => {
    expect(shapeKnowledge(null)).toEqual({ subject: null, methods: [], pitfalls: [], formulae: [] });
    expect(shapeKnowledge('nope')).toEqual({ subject: null, methods: [], pitfalls: [], formulae: [] });
  });
});

describe('loadTeachingKnowledge', () => {
  const fakeAdmin = (impl: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>) => ({ rpc: impl });
  it('calls the RPC with the normalised query and shapes the result', async () => {
    let seen: Record<string, unknown> | null = null;
    const admin = fakeAdmin(async (fn, args) => {
      expect(fn).toBe('teaching_knowledge');
      seen = args;
      return { data: { subject: 'AM', methods: [{ id: 'x', question_type: 'Q', method: 'Do it.' }], pitfalls: [], formulae: [] } };
    });
    const k = await loadTeachingKnowledge(admin, { level: 'S3_AM', topics: ['Surds'], context: 'Simplify $\\sqrt{50}$', methods: 2, pitfalls: 3 });
    expect(seen).toEqual({ p_level: 'S3_AM', p_topics: ['Surds'], p_context: 'Simplify $\\sqrt{50}$', p_methods: 2, p_pitfalls: 3, p_formulae: 0 });
    expect(k.methods[0].method).toBe('Do it.');
  });
  it('skips the RPC entirely when the level has no shelf or there are no topics', async () => {
    let calls = 0;
    const admin = fakeAdmin(async () => { calls++; return { data: {} }; });
    expect(await loadTeachingKnowledge(admin, { level: 'CHEM', topics: ['Acids'] })).toBe(EMPTY_KNOWLEDGE);
    expect(await loadTeachingKnowledge(admin, { level: 'AM', topics: [] })).toBe(EMPTY_KNOWLEDGE);
    expect(calls).toBe(0);
  });
  it('fails soft on an RPC error or a throw', async () => {
    expect(await loadTeachingKnowledge(fakeAdmin(async () => ({ error: { message: 'boom' } })), { level: 'AM', topics: ['Surds'] })).toBe(EMPTY_KNOWLEDGE);
    expect(await loadTeachingKnowledge(fakeAdmin(async () => { throw new Error('down'); }), { level: 'AM', topics: ['Surds'] })).toBe(EMPTY_KNOWLEDGE);
  });
});

describe('formatters', () => {
  const k = shapeKnowledge({
    subject: 'EM',
    methods: [
      { id: 'a', question_type: 'Reverse percentage', method: 'Decide what percentage the given figure is, then divide.', watch_out: 'Divide to go back; multiplying does not undo it.' },
      { id: 'b', question_type: 'Second', method: 'Another.', watch_out: null },
      { id: 'c', question_type: 'Third', method: 'Too many.', watch_out: null },
    ],
    pitfalls: [{ id: 'p', wrong_move: 'Taking 20% off again', why_wrong: 'The 20% was of the original.', corrective_cue: 'Divide by 0.8.' }],
    formulae: [],
  });
  it('methodHintMarkdown: at most `max` methods, question type as heading, watch-out in italics, no answers', () => {
    const md = methodHintMarkdown(k, 2);
    expect(md).toContain('**Reverse percentage**');
    expect(md).toContain('⚠️ _Divide to go back');
    expect(md).toContain('**Second**');
    expect(md).not.toContain('Third');
    expect(md.split('---')).toHaveLength(2);
    expect(methodHintMarkdown(EMPTY_KNOWLEDGE)).toBe('');
  });
  it('prompt lines carry the watch-out and the cue', () => {
    expect(methodsPromptLines(k.methods.slice(0, 1))).toBe('- Reverse percentage: Decide what percentage the given figure is, then divide. Watch out: Divide to go back; multiplying does not undo it.');
    expect(pitfallsPromptLines(k.pitfalls)).toBe('- Taking 20% off again — The 20% was of the original. Say instead: Divide by 0.8.');
    expect(methodsPromptLines([])).toBe('');
  });
});

describe('deck plans — redundancy against what the deck already announces', () => {
  const deckText = [
    'Apply product, quotient, power log laws', 'Evaluate log_4 32 by change of base', 'Solve by combining log terms',
    'Solve a^(f(x)) = b by taking logs', 'Log Law Manipulation & Identities', 'Solving Logarithmic Equations',
    'Solving Exponential Equations', 'Sketch y = ln(x − 2) + 1',
  ].join('\n');
  const workbook = { id: 'w', question_type: 'Log / exponential equation', method: 'Apply log laws / take logs / change of base; convert a^x=y <-> log_a y = x. Solve, then check validity.' };
  const secNotes = { id: 's', question_type: 'Equation with several logarithms', method: 'Change every logarithm to a common base, combine each side into a single logarithm using the product, quotient and power laws, then cancel the logarithms to leave an ordinary equation.' };
  it('contentWords stems so combine/combining fall together and drops maths', () => {
    expect(contentWords('Combining $\\log_2 x$ terms; combine them')).toEqual(['combi', 'terms']);
  });
  it('drops the template whose moves the card titles already list, keeps the one that states the general method', () => {
    const kept = filterRedundantMethods([workbook, secNotes], deckText);
    expect(kept.map(m => m.id)).toEqual(['s']);
  });
  it('keeps everything against an empty deck and nothing with empty words', () => {
    expect(filterRedundantMethods([workbook], '')).toHaveLength(1);
    expect(filterRedundantMethods([{ id: 'e', question_type: '', method: '$x$' }], deckText)).toHaveLength(0);
  });
  it('loadDeckPlan ranks through the RPC, filters, and caps', async () => {
    const admin = { rpc: async (_fn: string, args: Record<string, unknown>) => {
      expect(args.p_methods).toBe(5);   // max + 4 candidates, so the filter has room
      expect(args.p_pitfalls).toBe(0);
      return { data: { subject: 'AM', methods: [workbook, secNotes, { id: 'x', question_type: 'Exponential growth or decay word problem', method: 'Initial means substitute time zero. For a stated size, substitute it and take logarithms to release the time.' }], pitfalls: [], formulae: [] } };
    } };
    const plan = await loadDeckPlan(admin, { level: 'AM', topic: 'Logarithms', deckText, max: 1 });
    expect(plan.map(m => m.id)).toEqual(['s']);
  });
});
