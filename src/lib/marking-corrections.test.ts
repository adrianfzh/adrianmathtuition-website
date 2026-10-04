import { describe, expect, it } from 'vitest';
import { diffCorrections, levelOf } from './marking-corrections';
import { applyOverride } from './mark-triage';

const AT = '2026-10-05T03:00:00.000Z';
const ctx = { runId: 'run-1', source: 'desk' as const, at: AT, studentId: 'recS', paperName: 'kayla em p1', paperSubject: 'E Math', subject: 'math' };

function run() {
  return {
    results: [
      {
        question_number: '7', photo_index: 2,
        marking: {
          total_awarded: 3, total_max: 4,
          parts: [
            { label: '(a)', awarded: 1, max: 2, scheme: 'M1 A0', error_kind: 'units', error_summary: 'Answer should be 52.56 cm; do not convert again.' },
            { label: '(b)', awarded: 2, max: 2, scheme: 'M1 A1', error_summary: null },
          ],
        },
        marking_output: { meta: { topic_detected: 'Map scales' }, question: 'A map is drawn to a scale…' },
      },
      { question_number: '9', photo_index: 3, marking: { total_awarded: 0, total_max: 2 } },
    ],
  };
}

describe('diffCorrections', () => {
  it('a desk override on a part gives one marks row with before, after, the marker kind and the reason', () => {
    const before = run();
    const after = applyOverride(before, 0, 0, 'The ratio has no units; 5256 cm is right.', AT, 'misread', [{ label: '(a)', awarded: 2 }]);
    const rows = diffCorrections(before, after, ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      run_id: 'run-1', question: '7', part: '(a)', field: 'marks', marks_before: 1, marks_after: 2, marks_max: 2,
      marker_error_kind: 'units', tutor_error_kind: 'misread', tutor_reason: 'The ratio has no units; 5256 cm is right.',
      level: 'EM', topic: 'Map scales', org_id: 'tuition', corrected_by: 'adrian', source: 'desk', scheme: 'M1 A0',
      note_before: 'Answer should be 52.56 cm; do not convert again.',
    });
    expect(rows[0].context).toMatchObject({ question_text: 'A map is drawn to a scale…' });
  });

  it('full marks clears the note as part of the mark — no second row', () => {
    const before = run();
    const after = applyOverride(before, 0, 0, '', AT, undefined, [{ label: '(a)', awarded: 2 }]);
    const rows = diffCorrections(before, after, ctx);
    expect(rows.map(r => r.field)).toEqual(['marks']);
    expect(rows[0].tutor_reason).toBeNull();
  });

  it('a note edited in Annotate (mark unchanged) is a note row with the old and the new text', () => {
    const before = run();
    const after = JSON.parse(JSON.stringify(before));
    after.results[0].marking.parts[0].error_summary = 'Write the unit: 52.56 cm.';
    const rows = diffCorrections(before, after, { ...ctx, source: 'annotate' });
    expect(rows).toEqual([expect.objectContaining({ field: 'note', part: '(a)', note_before: 'Answer should be 52.56 cm; do not convert again.', note_after: 'Write the unit: 52.56 cm.', marks_before: 1, marks_after: 1, source: 'annotate' })]);
  });

  it('a verdict line changed is a verdict row; a deleted note is note_after null', () => {
    const before = run();
    const after = JSON.parse(JSON.stringify(before));
    after.results[0].marking.parts[0].verdict_line = 'Right method, one slip.';
    after.results[0].marking.parts[0].error_summary = null;
    const rows = diffCorrections(before, after, ctx);
    expect(rows.map(r => `${r.field}:${r.note_after}`).sort()).toEqual(['note:null', 'verdict:Right method, one slip.']);
  });

  it('a question with no parts records the question total; the chip path note is not a tutor reason', () => {
    const before = run();
    const after = applyOverride(before, 1, 1, 'score chip retyped in ✏️ Annotate', AT);
    const rows = diffCorrections(before, after, ctx);
    expect(rows).toEqual([expect.objectContaining({ question: '9', part: '', field: 'marks', marks_before: 0, marks_after: 1, marks_max: 2, tutor_reason: null })]);
  });

  it('nothing changed → no rows; a question only on one side is a re-mark, not a correction', () => {
    expect(diffCorrections(run(), run(), ctx)).toEqual([]);
    const after = run();
    after.results.push({ question_number: '10', photo_index: 4, marking: { total_awarded: 1, total_max: 3 } });
    expect(diffCorrections(run(), after, ctx)).toEqual([]);
    expect(diffCorrections(null, run(), ctx)).toEqual([]);
  });

  it('who corrected and which org ride every row (the tutor product reads them)', () => {
    const before = run();
    const after = applyOverride(before, 1, 2, 'x', AT);
    const [r] = diffCorrections(before, after, { ...ctx, correctedBy: 'tutor:abc', orgId: 'org-7' });
    expect(r).toMatchObject({ corrected_by: 'tutor:abc', org_id: 'org-7' });
  });

  it('levelOf maps paper subjects to level codes', () => {
    expect(levelOf('A Math')).toBe('AM');
    expect(levelOf('H2 Math')).toBe('JC');
    expect(levelOf('Chemistry')).toBe('CHEM');
    expect(levelOf('Other')).toBeNull();
  });
});
