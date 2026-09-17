import { describe, it, expect } from 'vitest';
import { levelFromPaperName, sectionsFromCompletion, searchTerms, describeHit } from './sheet-sections';
import type { DiagnosisSkill } from './sheet-diagnosis';

const skills: DiagnosisSkill[] = [
  { title: 'Choosing Between Angle At The Centre And Angles In The Same Segment', marks: 4, questions: ['Q17'], why: 'centre used as a circle point', tier: 'teach', gap: 'uses same-segment theorem when one angle is at the centre' },
  { title: 'Using Every Given Fact Before Stating A Geometry Conclusion', marks: 3, questions: ['Q15', 'Q7(b)'], why: 'proof stopped early', tier: 'teach' },
  { title: 'Q21 sign slip', marks: 1, questions: ['Q21'], why: '−2 × −3 taken as −6', tier: 'show' },
  { title: 'Deciding Between HCF And LCM', marks: 2, questions: ['Q8'], why: 'took the LCM', tier: 'teach', gap: 'picks LCM where the answer must fit inside the givens' },
];

const result = {
  docx_path: '/Students/Alessi Tay/2026-09-16 2022 Emath Paper 1/3 Practice Again.docx',
  pdf_path: '/Students/Alessi Tay/2026-09-16 2022 Emath Paper 1/3 Practice Again.pdf',
  questions: [
    { section: '1', index: 1, questionId: '33decb5c-3760-4f4b-ba1a-990e24b32ba7' },
    { section: '1', index: 2, questionId: 'f3bad3ba-cd3f-41c4-a792-66d940fdd007' },
    { section: '2', index: 1, questionId: '40f7f3bb-29e5-402c-a6e2-3c1b8d21e371' },
    { section: '2', index: 2, questionId: null, text: 'Prove that triangle PQR is congruent to triangle STU, naming the test.' },              // authored
    { section: '3', index: 1, questionId: 'd236f763-4831-4e95-94db-802ce5ea0694' },
    { section: '3', index: 2, questionId: 'a15b94bd-1d7c-44bc-9519-c0c2dfc541c6' },
  ],
};

describe('levelFromPaperName', () => {
  it('reads AM / EM / H2 off the typed name, AM before EM', () => {
    expect(levelFromPaperName('2022 Emath Paper 1')).toBe('EM');
    expect(levelFromPaperName('rainie am tys 2022 p2')).toBe('AM');
    expect(levelFromPaperName('E MATH • GCE 2022 • Paper 1')).toBe('EM');
    expect(levelFromPaperName('Additional Mathematics 4049/01')).toBe('AM');
    expect(levelFromPaperName('JC2 H2 2025 P1')).toBe('H2');
    expect(levelFromPaperName('Practice Again (3 papers)')).toBeNull();
  });
});

describe('sectionsFromCompletion', () => {
  const rows = sectionsFromCompletion({ jobId: 'job1', runId: 'run1', studentName: 'Alessi Tay', paperName: '2022 Emath Paper 1', subject: 'math', skills, result });

  it('files one row per TAUGHT skill, numbered as the sheet numbers its Practice sets — a ② show line is not a section', () => {
    expect(rows.map(r => [r.section_index, r.title.slice(0, 8)])).toEqual([[1, 'Choosing'], [2, 'Using Ev'], [3, 'Deciding']]);
    expect(rows.every(r => r.tier === 'teach')).toBe(true);
  });

  it('lines the completion\'s practice items up with the section numbers: bank ids kept, authored ones counted', () => {
    expect(rows[0].practice_question_ids).toEqual(['33decb5c-3760-4f4b-ba1a-990e24b32ba7', 'f3bad3ba-cd3f-41c4-a792-66d940fdd007']);
    expect(rows[0].authored_practice).toBe(0);
    expect(rows[1].practice_question_ids).toEqual(['40f7f3bb-29e5-402c-a6e2-3c1b8d21e371']);
    expect(rows[1].authored_practice).toBe(1);
    expect(rows[1].practice_texts).toEqual(['Prove that triangle PQR is congruent to triangle STU, naming the test.']);
  });

  it('carries the missed step (gap), the level, the paper and the docx the section lives in', () => {
    expect(rows[0].gap).toBe('uses same-segment theorem when one angle is at the centre');
    expect(rows[1].gap).toBeNull();
    expect(rows[0].level).toBe('EM');
    expect(rows[0].docx_path).toContain('3 Practice Again.docx');
    expect(rows[0].questions).toEqual(['Q17']);
    expect(rows[0].marks).toBe(4);
  });

  it('never throws on a malformed payload — a bad completion files nothing, not a crash', () => {
    expect(sectionsFromCompletion({ jobId: 'j', runId: null, skills: [], result: null })).toEqual([]);
    expect(sectionsFromCompletion({ jobId: 'j', runId: null, skills: [{ title: '', marks: 1, questions: [], why: '', tier: 'teach' }], result: { questions: 'nope' } })).toEqual([]);
    expect(sectionsFromCompletion({ jobId: 'j', runId: null, skills: [skills[0]], result: { questions: [{ section: 'x' }, null, 4] } })[0].practice_question_ids).toEqual([]);
  });
});

describe('searchTerms', () => {
  it('keeps the content words of the missed step and drops TeX, stop words and duplicates', () => {
    expect(searchTerms('Choosing Between Angle At The Centre', 'uses same-segment theorem when one angle is at the centre $\\angle QOR$'))
      .toBe('choosing between angle centre uses same segment theorem one');
    expect(searchTerms('', null, undefined)).toBe('');
  });
});

describe('describeHit', () => {
  it('names the sheet the section came from, so the worker and the Telegram line say what was reused', () => {
    expect(describeHit({ id: 'x', title: 'Deciding Between HCF And LCM', gap: 'picks LCM', level: 'EM', subject: 'math', student_name: 'Alessi Tay', paper_name: '2022 Emath Paper 1', questions: ['Q8'], docx_path: null, section_index: 3, created_at: '2026-09-17T01:34:47Z', last_vetted_at: '2026-09-18T00:00:00Z', practice_question_ids: [] }))
      .toBe("Deciding Between HCF And LCM — gap: picks LCM (Alessi Tay's 2022 Emath Paper 1 2026-09-17, Practice 3 · vetted)");
  });
});
