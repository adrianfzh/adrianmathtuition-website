import { describe, expect, it } from 'vitest';
import {
  DAILY_WRITE_CAP, MAX_PER_STUDENT, SUBJECT_INFO, addAllowed, buildWriterPrompt, checkDefinitionText, cleanTerm,
  findInList, parseWriterReply, refusalLine, termKey,
} from './my-definitions';
import { ERASE_BY_IDENTITY } from './erasure';

const phys = SUBJECT_INFO.physics.list;
const bio = SUBJECT_INFO.biology.list;

describe('termKey', () => {
  it('folds case, punctuation, a leading article and plurals', () => {
    expect(termKey('  The Specific Heat-Capacities! ')).toBe('specific heat capacity');
    expect(termKey("Newton's first law")).toBe('newton first law');
    expect(termKey('Enzymes')).toBe(termKey('enzyme'));
    expect(termKey('osmosis')).toBe('osmosis');
    expect(termKey('nucleus')).toBe('nucleus');
  });
});

describe('findInList — our own list first', () => {
  it('finds an exact term', () => {
    expect(findInList('density', phys)?.term).toBe('Density');
    expect(findInList('OSMOSIS', bio)?.term).toBe('Osmosis');
  });
  it('finds "X of a Y" terms by their head word', () => {
    expect(findInList('moment', phys)?.term).toBe('Moment of a force');
  });
  it('forgives a small spelling slip', () => {
    expect(findInList('acceleraton', phys)?.term).toBe('Acceleration');
    expect(findInList('mitochondria', bio)?.term).toBe('Mitochondrion');
  });
  it('does not stretch to a different term', () => {
    expect(findInList('pressure gauge', phys)).toBeNull();
    expect(findInList('cat', phys)).toBeNull();
    expect(findInList('', phys)).toBeNull();
  });
});

describe('cleanTerm', () => {
  it('trims and refuses empty, symbol-only or overlong input', () => {
    expect(cleanTerm('  specific   heat ')).toBe('specific heat');
    expect(cleanTerm('!!!')).toBe('');
    expect(cleanTerm('x'.repeat(61))).toBe('');
    expect(cleanTerm(undefined)).toBe('');
  });
});

describe('checkDefinitionText', () => {
  it('keeps a short line with bold scoring words', () => {
    expect(checkDefinitionText('The **energy** needed to raise **1 kg** by **1 K**')).toBe('The **energy** needed to raise **1 kg** by **1 K**.');
  });
  it('refuses no bold, an unclosed **, three sentences, or too long', () => {
    expect(checkDefinitionText('The energy needed.')).toBeNull();
    expect(checkDefinitionText('The **energy needed.')).toBeNull();
    expect(checkDefinitionText('A **b**. C d. E f.')).toBeNull();
    expect(checkDefinitionText(`**a** ${'x'.repeat(300)}`)).toBeNull();
  });
  it('refuses names, sources, models and disclaimers', () => {
    expect(checkDefinitionText('As Adrian says, the **rate** of change.')).toBeNull();
    expect(checkDefinitionText('According to the syllabus, the **rate** of change.')).toBeNull();
    expect(checkDefinitionText('The **rate** of change (answers may vary).')).toBeNull();
    expect(checkDefinitionText('Written by Claude: the **rate** of change.')).toBeNull();
  });
});

describe('parseWriterReply', () => {
  it('reads a written definition, fixing the spelling of the term', () => {
    const v = parseWriterReply('{"ok":true,"term":"Transpiration","text":"The **loss of water vapour** from the **aerial parts** of a plant, mainly through the **stomata**.","formula":""}', 'transpiraton');
    expect(v).toEqual({ ok: true, term: 'Transpiration', text: 'The **loss of water vapour** from the **aerial parts** of a plant, mainly through the **stomata**.' });
  });
  it('reads JSON wrapped in other text, and keeps a formula', () => {
    const v = parseWriterReply('Here:\n{"ok":true,"term":"specific heat capacity","text":"The **energy** needed per **unit mass** per **unit rise in temperature**.","formula":"c = Q ÷ (mΔθ)"}', 'specific heat capacity');
    expect(v.ok && v.term).toBe('Specific heat capacity');
    expect(v.ok && v.formula).toBe('c = Q ÷ (mΔθ)');
  });
  it('keeps the typed term when the writer swaps it for another', () => {
    const v = parseWriterReply('{"ok":true,"term":"Electromagnetic induction","text":"The **rate** of change."}', 'density');
    expect(v.ok && v.term).toBe('Density');
  });
  it('reads the two refusals', () => {
    expect(parseWriterReply('{"ok":false,"why":"not_in_syllabus"}', 'quark')).toEqual({ ok: false, why: 'not_in_syllabus' });
    expect(parseWriterReply('{"ok":false,"why":"not_a_term"}', 'blorp')).toEqual({ ok: false, why: 'not_a_term' });
  });
  it('treats junk or an unsafe definition as a bad reply (nothing saved)', () => {
    expect(parseWriterReply('no json here', 'x')).toEqual({ ok: false, why: 'bad_reply' });
    expect(parseWriterReply('{"ok":true,"term":"Density","text":"Mass per volume."}', 'density')).toEqual({ ok: false, why: 'bad_reply' });
    expect(parseWriterReply('{"ok":true,"term":"Density","text":"Per the SEAB scheme, **mass per unit volume**."}', 'density')).toEqual({ ok: false, why: 'bad_reply' });
  });
});

describe('limits', () => {
  it('stops at the saved cap, and the daily cap only for new writes', () => {
    expect(addAllowed(MAX_PER_STUDENT, 0, false)).toBe('limit');
    expect(addAllowed(5, DAILY_WRITE_CAP, true)).toBe('daily');
    expect(addAllowed(5, DAILY_WRITE_CAP, false)).toBe('ok');
    expect(addAllowed(MAX_PER_STUDENT - 1, DAILY_WRITE_CAP - 1, true)).toBe('ok');
  });
  it('every refusal line is plain and names nobody', () => {
    for (const why of ['not_in_syllabus', 'not_a_term', 'bad_reply', 'limit', 'daily', 'busy'] as const) {
      const line = refusalLine(why, 'quark', 'physics');
      expect(line).not.toMatch(/adrian|model|claude|ai\b/i);
      expect(line.length).toBeLessThan(90);
    }
    expect(refusalLine('not_in_syllabus', 'quark', 'physics')).toBe('“quark” is not in your Physics syllabus.');
  });
});

describe('the writer prompt', () => {
  it('names the syllabus, shows list examples and carries the grounding', () => {
    const p = buildWriterPrompt('transpiration', 'biology', 'Q: State what is meant by transpiration.');
    expect(p).toContain('O-Level Biology (6093)');
    expect(p).toContain(bio[0].text);
    expect(p).toContain('State what is meant by transpiration');
  });
});

describe('erasure', () => {
  it('Delete my account erases saved definitions', () => {
    expect(ERASE_BY_IDENTITY.map(t => t.table)).toContain('student_definitions');
  });
});
