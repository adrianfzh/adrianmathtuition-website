import { describe, it, expect } from 'vitest';
import { ERASE_BY_IDENTITY, KEPT_WITH_MARKED_PAPERS, photoSheetKeys } from './erasure';

const erased = ERASE_BY_IDENTITY.map((t) => t.table);

describe('Delete my account — what goes and what stays', () => {
  it('erases essays, humanities answers, worksheet pen marks and the app-use log (5 Oct 2026)', () => {
    for (const t of ['essay_runs', 'humanities_runs', 'student_work_ink', 'portal_event_log']) expect(erased).toContain(t);
  });
  it('erases their suggestions (5 Oct 2026)', () => {
    expect(erased).toContain('portal_suggestions');
  });
  it('still erases the notebook, clippings, asks and the rest', () => {
    for (const t of ['notebook_mistakes', 'notebook_private_notes', 'portal_notes', 'ask_skills']) expect(erased).toContain(t);
  });
  it('keeps the marked papers and the student\'s writing on them', () => {
    for (const t of KEPT_WITH_MARKED_PAPERS) expect(erased).not.toContain(t);
    expect(KEPT_WITH_MARKED_PAPERS).toContain('student_ink');
  });
});

describe('photoSheetKeys', () => {
  it('takes only the photos listed on photo-sheet jobs', () => {
    const keys = photoSheetKeys([
      { kind: 'photo-sheet', photos: [{ key: 'handins/recA/1.jpg' }, { key: 'handins/recA/2.jpg' }] },
      { kind: 'practice-again', photos: [{ key: 'handins/recA/marked.jpg' }] },
      { kind: 'photo-sheet', photos: null },
    ]);
    expect(keys).toEqual(['handins/recA/1.jpg', 'handins/recA/2.jpg']);
  });
  it('never returns a folder or a key outside handins/ (the marked papers share that folder)', () => {
    expect(photoSheetKeys([{ kind: 'photo-sheet', photos: [{ key: 'handins/recA/' }, { key: 'runs/x/p.jpg' }, { key: 'handins/recA/sub/x.jpg' }] }])).toEqual([]);
  });
});
