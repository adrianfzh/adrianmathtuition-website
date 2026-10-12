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

import { renameSuggestion, missingQuestionPaper, MISSING_PAPER_LINE, MISSING_PAPER_LINK } from './paper-unsure';

describe('renameSuggestion — named Paper 2, wrote Paper 1 (12 Oct 2026)', () => {
  const stamp = { key: 'gce 2024 am p1', label: '2024 A Math Paper 1', name: 'o level 2024 paper 1 amath', confirmed: 'working', misnamed: true, suggest: true, was: 'o level 2024 paper 2 amath', kept_label: 'o level 2024 paper 2 amath' };
  it('suggests the rename while the card still carries the name the student gave it', () => {
    expect(renameSuggestion({ paper_match: { candidate: stamp } }, 'o level 2024 paper 2 amath')).toEqual({ label: '2024 A Math Paper 1', button: 'Rename to Paper 1' });
  });
  it('goes away once renamed — cleared, or a name of their own', () => {
    expect(renameSuggestion({ paper_match: { candidate: stamp } }, null)).toBeNull();
    expect(renameSuggestion({ paper_match: { candidate: stamp } }, 'my mock')).toBeNull();
  });
  it('never for a paper we do not hold, an ordinary recognition, or no stamp', () => {
    expect(renameSuggestion({ paper_match: { candidate: { ...stamp, not_held: true } } }, stamp.kept_label)).toBeNull();
    expect(renameSuggestion({ paper_match: { candidate: { ...stamp, misnamed: undefined } } }, stamp.kept_label)).toBeNull();
    expect(renameSuggestion({}, stamp.kept_label)).toBeNull();
  });
});

describe('missingQuestionPaper — tell the student, ask for the paper', () => {
  it('true on either stamp, false otherwise', () => {
    expect(missingQuestionPaper({ paper_match: { candidate: { misnamed: true, not_held: true } } })).toBe(true);
    expect(missingQuestionPaper({ paper_match: { ungrounded: { key: 'gce 2025 am p2' } } })).toBe(true);
    expect(missingQuestionPaper({ paper_match: { candidate: { misnamed: true, suggest: true } } })).toBe(false);
    expect(missingQuestionPaper(null)).toBe(false);
  });
  it('names no tutor and no model', () => {
    expect(MISSING_PAPER_LINE).not.toMatch(/adrian|tutor|claude|gemini|model|\bai\b/i);
    expect(MISSING_PAPER_LINE).toBe('There are no questions in your submission.');   // Adrian's wording, 13 Oct 2026
    expect(MISSING_PAPER_LINK).toBe('Please upload the question paper.');
  });
});
