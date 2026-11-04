import { describe, it, expect } from 'vitest';
import { splitAltWorking, altDraftProblems, checkProblems, altServable, altView, type AltDraft, type AltChecks, type AltRow } from './alt-method';

const good: AltDraft = {
  question_id: '142097ff-2167-41c7-a28a-408596b00d0b',
  main_method: 'Elimination',
  alt_method: 'Substitution',
  working: [
    'From $5 = 27 - 3b + c$: $c = 3b - 22$',
    'Sub into $20 = 12 + 2b + c$:',
    '$20 = 12 + 2b + 3b - 22$',
    '$5b = 30$, so $b = 6$',
    '$c = 3(6) - 22 = -4$',
    '**Answer:** $b = 6$, $c = -4$',
  ].join('\n'),
  better: 'Elimination is quicker here because both equations already have $c$ with coefficient 1, so subtracting removes it in one step.',
  alt_answer: 'b = 6, c = -4',
};

const passed: AltChecks = { same: true, solver_answer: 'b = 6, c = -4', working_ok: true, different: true, in_syllabus: true };

describe('altDraftProblems', () => {
  it('passes a clean draft', () => {
    expect(altDraftProblems(good)).toEqual([]);
  });
  it('refuses the same method twice', () => {
    expect(altDraftProblems({ ...good, alt_method: 'elimination' })).toContain('the two methods have the same name');
  });
  it('needs a bold Answer line', () => {
    expect(altDraftProblems({ ...good, working: good.working.replace('**Answer:**', 'So') })).toContain('working must end with a bold **Answer:** line');
  });
  it('the better line is ONE sentence that says why', () => {
    expect(altDraftProblems({ ...good, better: 'Elimination is quicker. It is shorter.' })).toEqual(
      expect.arrayContaining(['better line must be ONE sentence', 'better line must say why ("… because …")']),
    );
  });
  it('refuses casual words (Adrian: plain Singapore-classroom wording)', () => {
    expect(altDraftProblems({ ...good, better: 'Elimination is a neat trick here because $c$ cancels.' })).toEqual(
      expect.arrayContaining(['casual word "trick"', 'casual word "neat"']),
    );
  });
  it('does not read "superscript" as "super"', () => {
    expect(altDraftProblems({ ...good, working: good.working + '\nNote the superscript.' }).some(p => p.includes('super'))).toBe(false);
  });
  it('keeps mark codes and model names out of student text', () => {
    expect(altDraftProblems({ ...good, working: good.working.replace('$5b = 30$', '$5b = 30$ [M1]') })).toContain('mark codes, "mark scheme", a model name or a name in student text');
  });
  it('refuses a reordering dressed as a method', () => {
    expect(altDraftProblems({ ...good, better: 'It is the same method in a different order, so either works because both are fine.' })).toContain('reads as the same method in another order');
  });
});

describe('checkProblems / altServable', () => {
  const row: AltRow = { question_id: good.question_id, main_method: 'Elimination', alt_method: 'Substitution', working: good.working, better: good.better, status: 'approved', checks: passed };
  it('a missing check refuses', () => {
    expect(checkProblems(null)).toEqual(['no blind check']);
  });
  it('a blind solve that disagrees refuses, whatever the status', () => {
    expect(altServable({ ...row, checks: { ...passed, same: false, solver_answer: 'b = 5' } })).toBe(false);
  });
  it('waiting rows never reach a student', () => {
    expect(altServable({ ...row, status: 'pending' })).toBe(false);
    expect(altView({ ...row, status: 'rejected' })).toBeNull();
  });
  it('approved + passed check = shown, without the check details', () => {
    expect(altView(row)).toEqual({ method: 'Substitution', mainMethod: 'Elimination', working: good.working, better: good.better });
  });
  it("Adrian's preview shows a waiting row that passed, tagged waiting — never a failed one", () => {
    expect(altView({ ...row, status: 'pending' }, true)?.waiting).toBe(true);
    expect(altView({ ...row, status: 'pending', checks: { ...passed, working_ok: false } }, true)).toBeNull();
    expect(altView({ ...row, status: 'rejected' }, true)).toBeNull();
    expect(altView(row, true)?.waiting).toBeUndefined();
  });
});

describe('splitAltWorking', () => {
  it('splits off the bold Answer line and drops the stars elsewhere', () => {
    expect(splitAltWorking('**(b)**\n$x = 2$\n**Answer:** $x = 2$')).toEqual({ body: '(b)\n$x = 2$', answer: '$x = 2$' });
  });
  it('a plain "Answer:" line works too; no answer line → null', () => {
    expect(splitAltWorking('$x=1$\nAnswer: $x=1$').answer).toBe('$x=1$');
    expect(splitAltWorking('$x=1$').answer).toBeNull();
  });
});
