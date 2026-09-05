import { describe, it, expect } from 'vitest';
import {
  sanitizeSheetQuestions, practiceAgainRows, practiceAgainTitle, bankIdsNamed, heldItemsLine,
  MAX_SHEET_QUESTIONS, type PracticeAgainJob,
} from './practice-again';

const BANK_A = '6f1d2c3b-4a5e-4f60-8a9b-0c1d2e3f4a5b';
const BANK_B = '7a2e3d4c-5b6f-4a71-9b0c-1d2e3f4a5b6c';
const job: PracticeAgainJob = {
  id: 'f0d82c18-0000-4000-8000-000000000001',
  run_id: 'f0d82c18-0000-4000-8000-000000000002',
  airtable_student_id: 'recAbCdEfGhIjKlMn',
  paper_name: 'AM 2021 P1',
};

describe('sanitizeSheetQuestions — the worker payload is data, not a promise', () => {
  it('keeps a bank id, keeps a written question with its answer, drops the rest', () => {
    const { questions, skipped } = sanitizeSheetQuestions([
      { section: 'Practice 1', index: 1, skill_title: 'Using f(x) = divisor × quotient + remainder', question_id: BANK_A, marks: 3, topic: 'Polynomials' },
      { section: 'Practice 1', index: 2, skill_title: 'Using f(x) = divisor × quotient + remainder', question_id: null, text_latex: 'Find the remainder when $x^3-2x+1$ is divided by $x-2$.', answer_latex: '5', marks: '2' },
      { section: 'Practice 2', index: 1, text_latex: 'A question with no answer' },     // unmarkable
      'not an object',
      null,
      { question_id: 'not-a-uuid' },                                                   // nothing usable
    ]);
    expect(questions).toHaveLength(2);
    expect(skipped).toBe(4);
    expect(questions[0]).toMatchObject({ position: 0, index: 1, questionId: BANK_A, marks: 3, topic: 'Polynomials', textLatex: null });
    expect(questions[1]).toMatchObject({ position: 1, index: 2, questionId: null, answerLatex: '5', marks: 2 });
  });
  it('positions are the payload order AFTER dropping, so the same payload always keys the same rows', () => {
    const a = sanitizeSheetQuestions([{ question_id: BANK_A }, 'junk', { question_id: BANK_B }]).questions.map(q => [q.position, q.questionId]);
    const b = sanitizeSheetQuestions([{ question_id: BANK_A }, 'junk', { question_id: BANK_B }]).questions.map(q => [q.position, q.questionId]);
    expect(a).toEqual([[0, BANK_A], [1, BANK_B]]);
    expect(a).toEqual(b);
  });
  it('a non-array, a missing key, or garbage yields nothing and throws nothing', () => {
    expect(sanitizeSheetQuestions(undefined)).toEqual({ questions: [], skipped: 0 });
    expect(sanitizeSheetQuestions('questions')).toEqual({ questions: [], skipped: 0 });
    expect(sanitizeSheetQuestions({ 0: { question_id: BANK_A } })).toEqual({ questions: [], skipped: 0 });
  });
  it('caps the list and counts the overflow as skipped', () => {
    const many = Array.from({ length: MAX_SHEET_QUESTIONS + 5 }, () => ({ question_id: BANK_A }));
    const { questions, skipped } = sanitizeSheetQuestions(many);
    expect(questions).toHaveLength(MAX_SHEET_QUESTIONS);
    expect(skipped).toBe(5);
  });
  it('normalises the bank id to lowercase and clamps marks to a sane range', () => {
    const { questions } = sanitizeSheetQuestions([
      { question_id: BANK_A.toUpperCase(), marks: 999 },
      { text_latex: 'q', answer_latex: 'a', marks: 0 },
      { text_latex: 'q', answer_latex: 'a', marks: 4.4 },
    ]);
    expect(questions[0].questionId).toBe(BANK_A);
    expect(questions[0].marks).toBeNull();
    expect(questions[1].marks).toBeNull();
    expect(questions[2].marks).toBe(4);
  });
});

describe('practiceAgainRows — bank when the bank has it, generated when the worker wrote it, skipped otherwise', () => {
  const { questions } = sanitizeSheetQuestions([
    { skill_title: 'Chain rule', question_id: BANK_A, topic: 'Differentiation' },
    { skill_title: 'Chain rule', question_id: BANK_B, text_latex: 'Differentiate $(2x+1)^5$.', answer_latex: '$10(2x+1)^4$', marks: 2 },
    { skill_title: 'Chain rule', question_id: BANK_B },
    { section: 'Practice 3', index: 2, text_latex: 'Solve $2^x = 8$.', answer_latex: '$x=3$', marks: 1 },
  ]);

  it('builds held practice-again rows keyed on the job + position, stamped with the paper subject', () => {
    const { rows, skipped } = practiceAgainRows(job, questions, { bankIds: new Set([BANK_A]), subject: 'A Math' });
    expect(rows).toHaveLength(3);
    expect(skipped).toEqual([{ position: 2, reason: 'not-in-bank' }]);
    for (const r of rows) {
      expect(r).toMatchObject({
        airtable_student_id: job.airtable_student_id, status: 'held', source: 'practice-again',
        source_run_id: job.run_id, sheet_job_id: job.id, subject: 'A Math', pdf_url: null, due_on: null,
      });
    }
    // The bank one
    expect(rows[0]).toMatchObject({ kind: 'question', question_id: BANK_A, sheet_index: 0, title: 'Chain rule', topic: 'Differentiation', question_text: null, answer_latex: null, marks: null });
    // Named a bank id the bank does not have, but wrote the question → generated
    expect(rows[1]).toMatchObject({ kind: 'generated', question_id: null, sheet_index: 1, question_text: 'Differentiate $(2x+1)^5$.', answer_latex: '$10(2x+1)^4$', marks: 2 });
    // No skill title → the sheet's own numbering
    expect(rows[2]).toMatchObject({ kind: 'generated', sheet_index: 3, title: 'Practice 3 · Q2', skill_title: null });
  });
  it('sheet_index survives a skipped entry (positions are not renumbered), so re-runs stay idempotent', () => {
    const { rows } = practiceAgainRows(job, questions, { bankIds: new Set([BANK_A]) });
    expect(rows.map(r => r.sheet_index)).toEqual([0, 1, 3]);
  });
  it('the same inputs build the same rows — the store upserts ON CONFLICT DO NOTHING on (sheet_job_id, sheet_index)', () => {
    const a = practiceAgainRows(job, questions, { bankIds: new Set([BANK_A]), subject: 'A Math' }).rows;
    const b = practiceAgainRows(job, questions, { bankIds: new Set([BANK_A]), subject: 'A Math' }).rows;
    expect(a).toEqual(b);
    expect(new Set(a.map(r => `${r.sheet_job_id}:${r.sheet_index}`)).size).toBe(a.length);
  });
  it('no subject stays null (shown to everyone), and a blank one too', () => {
    expect(practiceAgainRows(job, questions, { bankIds: new Set([BANK_A]) }).rows[0].subject).toBeNull();
    expect(practiceAgainRows(job, questions, { bankIds: new Set([BANK_A]), subject: '  ' }).rows[0].subject).toBeNull();
  });
  it('bankIdsNamed dedupes and drops nulls', () => {
    expect(bankIdsNamed(questions)).toEqual([BANK_A, BANK_B]);
  });
});

describe('practiceAgainTitle', () => {
  it('prefers the skill title, then the sheet numbering, then a plain fallback', () => {
    expect(practiceAgainTitle({ skillTitle: 'Completing the square', section: 'Practice 1', index: 1, position: 0 })).toBe('Completing the square');
    expect(practiceAgainTitle({ skillTitle: null, section: 'Practice 2', index: 3, position: 7 })).toBe('Practice 2 · Q3');
    expect(practiceAgainTitle({ skillTitle: null, section: null, index: null, position: 4 })).toBe('Practice again · Q5');
  });
});

describe('heldItemsLine', () => {
  it('summarises a first run, a re-run, and a run with skips', () => {
    expect(heldItemsLine({ created: 5, already: 0, bank: 3, generated: 2, skipped: 0 })).toBe('🔁 5 practice items held for release (3 from the bank, 2 written)');
    expect(heldItemsLine({ created: 0, already: 5, bank: 5, generated: 0, skipped: 0 })).toBe('🔁 5 practice items held for release (5 from the bank) · 5 already there');
    expect(heldItemsLine({ created: 1, already: 0, bank: 1, generated: 0, skipped: 2 })).toBe('🔁 1 practice item held for release (1 from the bank) · 2 skipped');
    expect(heldItemsLine({ created: 0, already: 0, bank: 0, generated: 0, skipped: 0 })).toBeNull();
    expect(heldItemsLine({ created: 0, already: 0, bank: 0, generated: 0, skipped: 3 })).toBe('3 skipped');
  });
});
