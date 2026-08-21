import { describe, it, expect } from 'vitest';
import {
  validateAssignment, isPending, pendingCount, dueLabel, isOverdue,
  assignmentHref, statusLabel, canTransition, homeCardSummary,
} from './assignments';

const SID = 'recAbCdEfGhIjKlMn';
const QID = '6f1d2c3b-4a5e-4f60-8a9b-0c1d2e3f4a5b';

describe('validateAssignment', () => {
  it('rejects a non-Airtable student id', () => {
    const r = validateAssignment({ studentId: 'nope', kind: 'question', questionId: QID });
    expect(r.ok).toBe(false);
  });
  it('question needs a uuid questionId and gets a default title from the topic', () => {
    const bad = validateAssignment({ studentId: SID, kind: 'question', questionId: 'x' });
    expect(bad.ok).toBe(false);
    const ok = validateAssignment({ studentId: SID, kind: 'question', questionId: QID, topic: 'Differentiation', tier: 'Advanced' });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.row.title).toBe('Differentiation question');
      expect(ok.row.tier).toBe('Advanced');
      expect(ok.row.pdf_url).toBeNull();
    }
  });
  it('worksheet needs an https pdfUrl and a title', () => {
    expect(validateAssignment({ studentId: SID, kind: 'worksheet', title: 'X', pdfUrl: 'http://x' }).ok).toBe(false);
    expect(validateAssignment({ studentId: SID, kind: 'worksheet', pdfUrl: 'https://x/y.pdf' }).ok).toBe(false);
    const ok = validateAssignment({ studentId: SID, kind: 'worksheet', title: '  CCHY 2023 P1  ', pdfUrl: 'https://x/y.pdf', pdfSource: 'dropbox:/a/b.pdf' });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.row.title).toBe('CCHY 2023 P1');
      expect(ok.row.question_id).toBeNull();
      expect(ok.row.pdf_source).toBe('dropbox:/a/b.pdf');
    }
  });
  it('validates dueOn and drops unknown tiers', () => {
    expect(validateAssignment({ studentId: SID, kind: 'question', questionId: QID, dueOn: '2026-13-40' }).ok).toBe(false);
    expect(validateAssignment({ studentId: SID, kind: 'question', questionId: QID, dueOn: 'Friday' }).ok).toBe(false);
    const ok = validateAssignment({ studentId: SID, kind: 'question', questionId: QID, dueOn: '2026-09-04', tier: 'Hard', note: '  why  ' });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.row.due_on).toBe('2026-09-04');
      expect(ok.row.tier).toBeNull();
      expect(ok.row.note).toBe('why');
    }
  });
  it('treats empty dueOn as no due date', () => {
    const ok = validateAssignment({ studentId: SID, kind: 'question', questionId: QID, dueOn: '' });
    expect(ok.ok && ok.row.due_on).toBeNull();
  });
});

describe('pending + summary', () => {
  it('counts assigned and submitted as pending, not marked/revoked', () => {
    expect(isPending('assigned')).toBe(true);
    expect(isPending('submitted')).toBe(true);
    expect(isPending('marked')).toBe(false);
    expect(isPending('revoked')).toBe(false);
    expect(pendingCount([{ status: 'assigned' }, { status: 'marked' }, { status: 'submitted' }])).toBe(2);
  });
  it('summarises the Home card', () => {
    expect(homeCardSummary([])).toBeNull();
    expect(homeCardSummary([{ status: 'marked' }])).toBeNull();
    expect(homeCardSummary([{ status: 'assigned' }, { status: 'assigned' }])).toBe('2 to do');
    expect(homeCardSummary([{ status: 'assigned' }, { status: 'submitted' }])).toBe('1 to do · 1 being marked');
  });
});

describe('dueLabel', () => {
  const today = '2026-08-21'; // a Friday
  it('labels today / tomorrow / weekday / date', () => {
    expect(dueLabel(null, today)).toBeNull();
    expect(dueLabel('2026-08-21', today)).toBe('by today');
    expect(dueLabel('2026-08-22', today)).toBe('by tomorrow');
    expect(dueLabel('2026-08-24', today)).toBe('by Mon');
    expect(dueLabel('2026-08-28', today)).toBe('by 28 Aug');
  });
  it('labels past dates softly', () => {
    expect(dueLabel('2026-08-19', today)).toBe('was due Wed');
    expect(dueLabel('2026-08-01', today)).toBe('was due 1 Aug');
  });
  it('isOverdue only for pending rows with a past due date', () => {
    expect(isOverdue({ status: 'assigned', due_on: '2026-08-19' }, today)).toBe(true);
    expect(isOverdue({ status: 'marked', due_on: '2026-08-19' }, today)).toBe(false);
    expect(isOverdue({ status: 'assigned', due_on: '2026-08-21' }, today)).toBe(false);
    expect(isOverdue({ status: 'assigned', due_on: null }, today)).toBe(false);
  });
});

describe('routing + transitions', () => {
  it('routes questions to the practice grader and worksheets to their page', () => {
    expect(assignmentHref({ id: 'a1', kind: 'question', status: 'assigned' })).toBe('/app/practice?assignment=a1');
    expect(assignmentHref({ id: 'a1', kind: 'worksheet', status: 'assigned' })).toBe('/app/assignments/a1');
  });
  it('status labels', () => {
    expect(statusLabel({ status: 'assigned', kind: 'question', score: null, out_of: null })).toBe('To do');
    expect(statusLabel({ status: 'submitted', kind: 'worksheet', score: null, out_of: null })).toBe('Being marked');
    expect(statusLabel({ status: 'marked', kind: 'question', score: 3, out_of: 5 })).toBe('Marked · 3/5');
    expect(statusLabel({ status: 'marked', kind: 'worksheet', score: null, out_of: null })).toBe('Marked');
  });
  it('transitions', () => {
    expect(canTransition('assigned', 'submitted')).toBe(true);
    expect(canTransition('assigned', 'marked')).toBe(true);
    expect(canTransition('submitted', 'marked')).toBe(true);
    expect(canTransition('marked', 'marked')).toBe(true);   // re-mark
    expect(canTransition('marked', 'assigned')).toBe(false);
    expect(canTransition('marked', 'revoked')).toBe(false);
    expect(canTransition('revoked', 'assigned')).toBe(false);
    expect(canTransition('assigned', 'revoked')).toBe(true);
  });
});
