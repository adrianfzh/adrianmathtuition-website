import { describe, it, expect } from 'vitest';
import { unsurePaper, answeredCandidate } from './paper-unsure';

const cand = { key: 'gce 2025 h2 p1', label: '2025 A-Level H2 Maths Paper 1', name: 'nicole 2025 Paper 1 · H2 TYS', unsure: true, evidence: { agreed: false } };

describe('unsurePaper — the paper we could not confirm', () => {
  it('reads the stamp the bot leaves on a paper it was unsure of', () => {
    expect(unsurePaper({ paper_match: { candidate: cand } })).toEqual({ key: cand.key, label: cand.label, name: cand.name });
  });
  it('says nothing for a confirmed paper, an answered one, or no stamp', () => {
    expect(unsurePaper({ paper_match: { candidate: { ...cand, unsure: undefined, confirmed: 'working' } } })).toBeNull();
    expect(unsurePaper({ paper_match: { candidate: { ...cand, answered: 'no' } } })).toBeNull();
    expect(unsurePaper({ paper_match: {} })).toBeNull();
    expect(unsurePaper(null)).toBeNull();
    expect(unsurePaper({ paper_match: { candidate: { unsure: true, label: '', name: 'x', key: 'k' } } })).toBeNull();
  });
});

describe('answeredCandidate — what the stamp becomes', () => {
  it('yes: confirmed by the student, no longer unsure, the old name kept', () => {
    const c = answeredCandidate(cand, true, '2026-10-07T04:00:00.000Z', 'nicole 2025 Paper 1');
    expect(c).toMatchObject({ confirmed: 'student', answered: 'yes', was: 'nicole 2025 Paper 1', key: cand.key });
    expect('unsure' in c).toBe(false);
    expect(unsurePaper({ paper_match: { candidate: c } })).toBeNull();
  });
  it('no: stays unsure but is not asked again', () => {
    const c = answeredCandidate(cand, false, '2026-10-07T04:00:00.000Z', null);
    expect(c).toMatchObject({ unsure: true, answered: 'no' });
    expect(unsurePaper({ paper_match: { candidate: c } })).toBeNull();
  });
});
