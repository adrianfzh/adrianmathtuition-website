import { describe, it, expect } from 'vitest';
import { adminLines, sheetStoryLine, heldSheetsLine, receiptLine, needsLook } from './papers-admin-lines';

describe('sheetStoryLine', () => {
  it('says who asked, the batch, and where it is', () => {
    expect(sheetStoryLine({ status: 'assigned', required_at: '2026-09-11T05:49:00Z', reminder_count: 1, reminded_at: '2026-09-15T01:00:00Z', source_run_ids: ['a', 'b'] }, null))
      .toBe('sheet assigned by Adrian 11 Sept · one sheet for 2 papers · not handed in yet · nudged ×1, last 15 Sept');
    expect(sheetStoryLine({ status: 'marked', required_at: null, created_at: '2026-09-10T00:00:00Z', submitted_at: '2026-09-12T06:14:00Z' }, null))
      .toBe('sheet requested by the student 10 Sept · handed in 12 Sept and marked');
  });
  it('falls back to the job when there is no sheet, and to nothing when there is neither', () => {
    expect(sheetStoryLine(null, { status: 'claimed', stage: 'writing', requested_by: 'student', noSheet: false })).toBe('sheet being written (the student asked, writing)');
    expect(sheetStoryLine(null, { status: 'done', noSheet: true })).toContain('nothing worth practising');
    expect(sheetStoryLine(null, { status: 'done', noSheet: false })).toBe('sheet written, with Adrian — not released');
    expect(sheetStoryLine(null, null)).toBeNull();
  });
});

describe('heldSheetsLine / receiptLine', () => {
  it('counts held and withdrawn, and says nothing when there are none', () => {
    expect(heldSheetsLine([{ status: 'held' }, { status: 'revoked' }])).toBe('1 sheet held · 1 withdrawn — the student does not see these');
    expect(heldSheetsLine([])).toBeNull();
  });
  it('reads the receipt in plain words', () => {
    expect(receiptLine({ pages: 36, usage: { externalReads: 36, costUsd: 9.4329 }, remark: true })).toBe('36 pages · all read on the Mac · $9.43 API · re-marked');
    expect(receiptLine({ pages: 14, usage: { externalReads: 0, costUsd: 0 } })).toBe('14 pages · read on the API · $0 API');
    expect(receiptLine({ pages: 1, usage: null })).toBe('1 page · read on the API');
  });
});

describe('adminLines', () => {
  it('lists the story, the held line, the receipt, then up to four watch-outs', () => {
    const lines = adminLines({ sheet: null, job: null, held: [], facts: { pages: 3, usage: { externalReads: 3, costUsd: 0.2 }, notes: ['A', '', 'B', 'C', 'D', 'E'] } });
    expect(lines[0]).toBe('3 pages · all read on the Mac · $0.20 API');
    expect(lines.slice(1)).toEqual(['⚠ A', '⚠ B', '⚠ C', '⚠ D']);
  });
});

describe('needsLook', () => {
  it('is a system-released paper with no ✓ Looked at stamp', () => {
    expect(needsLook({ released_at: '2026-09-16T10:00:00Z', released_via: 'auto:handin', checked_at: null })).toBe(true);
  });
  it('clears once Adrian ticks it, and never fires for a paper he released himself or one not yet released', () => {
    expect(needsLook({ released_at: '2026-09-16T10:00:00Z', released_via: 'auto:handin', checked_at: '2026-09-17T01:00:00Z' })).toBe(false);
    expect(needsLook({ released_at: '2026-09-16T10:00:00Z', released_via: 'desk', checked_at: null })).toBe(false);
    expect(needsLook({ released_at: '2026-09-16T10:00:00Z', released_via: 'auto:handin', checked_at: null, admin_viewed_at: '2026-09-17T00:00:00Z' })).toBe(false);
    expect(needsLook({ released_at: null, released_via: 'auto:handin', checked_at: null })).toBe(false);
  });
});
