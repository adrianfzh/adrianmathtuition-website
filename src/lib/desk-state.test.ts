import { describe, it, expect } from 'vitest';
import {
  laneFor, sheetStageLabel, approveBlockers, releaseBlockers, deskFlags, defaultLane,
  amendedStatusFor, latestLiveJob, noSheetOf, pdfStaleOf, DESK_LANES, LANE_LABEL,
} from './desk-state';

const tagged = { student_id: 'recStudent', released_at: null, annotated_pdf_url: null, result_json: { results: [] } };
const done = { status: 'done', stage: null, error: null };

describe('laneFor — every run lands in exactly one lane', () => {
  it('released outranks everything, tagged or not', () => {
    expect(laneFor({ ...tagged, released_at: '2026-09-02T10:00:00Z' }, done)).toBe('released');
    expect(laneFor({ student_id: null, released_at: '2026-09-02T10:00:00Z' }, null)).toBe('released');
  });
  it('an untagged run needs a student before anything else', () => {
    expect(laneFor({ student_id: null, released_at: null }, done)).toBe('untagged');
  });
  it('a finished sheet makes it ready to vet', () => {
    expect(laneFor(tagged, done)).toBe('ready');
  });
  it('no job, a queued, a claimed or a failed job all mean "sheet on the way"', () => {
    expect(laneFor(tagged, null)).toBe('awaiting-sheet');
    expect(laneFor(tagged, { status: 'queued' })).toBe('awaiting-sheet');
    expect(laneFor(tagged, { status: 'claimed', stage: 'drafting' })).toBe('awaiting-sheet');
    expect(laneFor(tagged, { status: 'failed', error: 'plan cap' })).toBe('awaiting-sheet');
  });
  it('the four lanes are the four tabs, each labelled', () => {
    expect(DESK_LANES).toEqual(['untagged', 'awaiting-sheet', 'ready', 'released']);
    for (const l of DESK_LANES) expect(LANE_LABEL[l]).toBeTruthy();
  });
});

describe('latestLiveJob — cancelled jobs never hide a finished sheet', () => {
  const j = (id: string, status: string, at: string) => ({ id, status, created_at: at });
  it('takes the newest job', () => {
    const jobs = [j('a', 'done', '2026-09-01T10:00:00Z'), j('b', 'queued', '2026-09-02T10:00:00Z')];
    expect(latestLiveJob(jobs)?.id).toBe('b');
  });
  it('skips a cancelled re-queue so the done sheet still counts', () => {
    const jobs = [j('a', 'done', '2026-09-01T10:00:00Z'), j('b', 'cancelled', '2026-09-02T10:00:00Z')];
    expect(latestLiveJob(jobs)?.id).toBe('a');
    expect(laneFor(tagged, latestLiveJob(jobs))).toBe('ready');
  });
  it('is null with nothing live', () => {
    expect(latestLiveJob([])).toBeNull();
    expect(latestLiveJob([j('b', 'cancelled', '2026-09-02T10:00:00Z')])).toBeNull();
  });
});

describe('sheetStageLabel', () => {
  it('names each state in Adrian’s words', () => {
    expect(sheetStageLabel(null)).toBe('no sheet yet');
    expect(sheetStageLabel({ status: 'queued' })).toBe('queued');
    expect(sheetStageLabel({ status: 'claimed', stage: 'verifying' })).toBe('verifying…');
    expect(sheetStageLabel({ status: 'claimed' })).toBe('drafting…');
    expect(sheetStageLabel({ status: 'done' })).toBe('sheet ready');
    expect(sheetStageLabel({ status: 'failed', error: 'plan cap hit' })).toBe('failed: plan cap hit');
    expect(sheetStageLabel({ status: 'cancelled' })).toBe('cancelled');
  });
});

describe('approveBlockers — the reasons the big button is grey', () => {
  it('is empty when everything is in place', () => {
    expect(approveBlockers(tagged, done, 0, 'none')).toEqual([]);
    expect(approveBlockers(tagged, done, 0, 'found')).toEqual([]);
  });
  it('an already-released run says only that', () => {
    expect(approveBlockers({ ...tagged, released_at: '2026-09-02T10:00:00Z' }, null, 3, 'none')).toEqual(['already released']);
  });
  it('untagged', () => {
    const r = approveBlockers({ student_id: null, released_at: null }, done, 0, 'none');
    expect(r).toEqual(['tag the paper to a student first']);
  });
  it('pending reviews, with the count and the verb agreeing', () => {
    expect(approveBlockers(tagged, done, 1, 'none')[0]).toBe('1 question still needs review — Agree or Override each one');
    expect(approveBlockers(tagged, done, 3, 'none')[0]).toBe('3 questions still need review — Agree or Override each one');
  });
  it('no done sheet — one reason per sheet state', () => {
    expect(approveBlockers(tagged, null, 0, 'none')).toEqual(['no self-study sheet yet — queue one']);
    expect(approveBlockers(tagged, { status: 'queued' }, 0, 'none')).toEqual(['the self-study sheet is still queued']);
    expect(approveBlockers(tagged, { status: 'claimed', stage: 'verifying' }, 0, 'none')).toEqual(['the self-study sheet is being written (verifying)']);
    expect(approveBlockers(tagged, { status: 'failed', error: 'x' }, 0, 'none')).toEqual(['the self-study sheet failed — retry it']);
  });
  it('a stale PDF blocks unless a NEWER amended copy is in the folder', () => {
    const stale = { ...tagged, result_json: { results: [], pdf_stale: { at: 'x', reason: 'Q3 overridden' } } };
    expect(approveBlockers(stale, done, 0, 'none')).toEqual([
      'a mark was overridden after the PDF was drawn, so it prints the old total — save "2 Marked by Adrian.pdf" into the folder, or Rebuild PDFs',
    ]);
    // An older copy does not resolve it.
    expect(approveBlockers(stale, done, 0, 'found')).toHaveLength(1);
    // Dropbox down: say so rather than guess.
    expect(approveBlockers(stale, done, 0, 'unknown')[0]).toMatch(/Dropbox could not be checked/);
    // The release path will attach the newer copy and clear the flag.
    expect(approveBlockers(stale, done, 0, 'newer-than-attached')).toEqual([]);
  });
  it('stacks every reason, sheet last', () => {
    const r = approveBlockers({ student_id: null, released_at: null }, null, 2, 'none');
    expect(r).toEqual([
      'tag the paper to a student first',
      '2 questions still need review — Agree or Override each one',
      'no self-study sheet yet — queue one',
    ]);
  });
});

// ── "no sheet needed" (Adrian, 3 Sep 2026) ───────────────────────────────────
// Kassandra Lim's 89/90 and 87/90: the worker read both papers correctly and
// concluded there was nothing to teach. That closes the job as `done` with
// `result.noSheet`, so the paper is Ready to vet and Approve & release sends it
// on its own — the old route was `fail`, which requeued twice and then alarmed.
describe('a done job that says "nothing to teach"', () => {
  const nothing = { status: 'done', stage: 'no sheet needed', error: null,
    result: { noSheet: true, reason: '89/90 — the one lost mark was a misread' } };

  it('is a finished job, so the paper is Ready to vet', () => {
    expect(laneFor(tagged, nothing)).toBe('ready');
  });
  it('says so in the row, with the reason', () => {
    expect(sheetStageLabel(nothing)).toBe('no sheet needed — 89/90 — the one lost mark was a misread');
  });
  it('truncates a long reason so it still fits a queue row', () => {
    const label = sheetStageLabel({ status: 'done', result: { noSheet: true, reason: 'x'.repeat(200) } });
    expect(label.length).toBeLessThan(90);
    expect(label.endsWith('…')).toBe(true);
  });
  it('NEVER blocks Approve & release — that is the whole point of it', () => {
    expect(approveBlockers(tagged, nothing, 0, 'none')).toEqual([]);
  });
  it('holds on everything else exactly as before', () => {
    expect(approveBlockers(tagged, nothing, 2, 'none')).toEqual(['2 questions still need review — Agree or Override each one']);
    expect(approveBlockers({ student_id: null, released_at: null }, nothing, 0, 'none')).toEqual(['tag the paper to a student first']);
    const stale = { ...tagged, result_json: { results: [], pdf_stale: true } };
    expect(approveBlockers(stale, nothing, 0, 'none')).toHaveLength(1);
  });
  it('is not a flag — nothing went wrong', () => {
    expect(deskFlags(tagged, nothing, 'none')).toEqual([]);
  });
  it('noSheetOf only reads a FINISHED job', () => {
    expect(noSheetOf(nothing)).toEqual({ noSheet: true, reason: '89/90 — the one lost mark was a misread' });
    expect(noSheetOf({ status: 'claimed', result: { noSheet: true, reason: 'x' } }).noSheet).toBe(false);
    expect(noSheetOf({ status: 'done', result: { docx_path: '/a.docx' } }).noSheet).toBe(false);
    expect(noSheetOf(null).noSheet).toBe(false);
  });
  it('an ordinary finished sheet still reads "sheet ready"', () => {
    expect(sheetStageLabel({ status: 'done', result: { docx_path: '/a.docx' } })).toBe('sheet ready');
    expect(sheetStageLabel(done)).toBe('sheet ready');
  });
});

describe('releaseBlockers — "Release without sheet" ignores only the sheet', () => {
  it('lets a vetted paper go without its sheet', () => {
    expect(releaseBlockers(tagged, 0, 'none')).toEqual([]);
    expect(approveBlockers(tagged, null, 0, 'none')).toHaveLength(1);
  });
  it('still holds on pending reviews and a stale PDF', () => {
    const stale = { ...tagged, result_json: { pdf_stale: true } };
    expect(releaseBlockers(stale, 1, 'none')).toHaveLength(2);
  });
});

describe('deskFlags', () => {
  it('names a stale PDF, a failed sheet, and a newer copy waiting in Dropbox', () => {
    const run = { ...tagged, annotated_pdf_url: 'https://x/a.pdf', result_json: { pdf_stale: true } };
    expect(deskFlags(run, { status: 'failed', error: 'e' }, 'newer-than-attached')).toEqual([
      'PDF shows the old total', 'sheet failed', 'your copy in Dropbox is newer than the attached one',
    ]);
  });
  it('a newer copy with NOTHING attached is not a warning — release will simply attach it', () => {
    expect(deskFlags(tagged, done, 'newer-than-attached')).toEqual([]);
  });
  it('is empty on a clean row', () => {
    expect(deskFlags(tagged, done, 'none')).toEqual([]);
    expect(pdfStaleOf(tagged)).toBe(false);
  });
});

describe('defaultLane', () => {
  it('opens Ready to vet when it has rows, else the waiting lane', () => {
    expect(defaultLane({ ready: 2, 'awaiting-sheet': 5 })).toBe('ready');
    expect(defaultLane({ ready: 0, 'awaiting-sheet': 5 })).toBe('awaiting-sheet');
    expect(defaultLane({})).toBe('awaiting-sheet');
  });
});

describe('amendedStatusFor — reuses the paper-folder attach rules', () => {
  const adrian = { name: 'Marked (Adrian).pdf', path: '/students/s/2026-09-01 p/marked (adrian).pdf', modified: '2026-09-02T09:00:00Z', tag: 'file' };
  const ai = { name: 'Marked (AI).pdf', path: '/students/s/2026-09-01 p/marked (ai).pdf', modified: '2026-09-01T09:00:00Z', tag: 'file' };
  it('unknown when the folder could not be listed', () => {
    expect(amendedStatusFor(tagged, null)).toEqual({ status: 'unknown' });
  });
  it('none when only the machine’s copy is there', () => {
    expect(amendedStatusFor(tagged, [ai])).toEqual({ status: 'none' });
  });
  it('newer-than-attached when nothing is attached yet', () => {
    const r = amendedStatusFor(tagged, [ai, adrian]);
    expect(r.status).toBe('newer-than-attached');
    expect(r.name).toBe('Marked (Adrian).pdf');
  });
  it('found when it is the very file already attached', () => {
    const run = { ...tagged, annotated_pdf_url: 'https://blob/x.pdf',
      result_json: { amended_from_dropbox: { path: adrian.path, modified: adrian.modified, at: '2026-09-02T09:05:00Z' } } };
    expect(amendedStatusFor(run, [ai, adrian]).status).toBe('found');
  });
  it('found when the attached copy is newer than the folder’s', () => {
    const run = { ...tagged, annotated_pdf_url: 'https://blob/x.pdf', result_json: { amended_at: '2026-09-03T09:00:00Z' } };
    expect(amendedStatusFor(run, [adrian]).status).toBe('found');
  });
  it('newer-than-attached when he saved again after attaching', () => {
    const run = { ...tagged, annotated_pdf_url: 'https://blob/x.pdf', result_json: { amended_at: '2026-09-01T12:00:00Z' } };
    expect(amendedStatusFor(run, [adrian]).status).toBe('newer-than-attached');
  });
});
