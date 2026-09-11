import { describe, it, expect } from 'vitest';
import {
  laneFor, sheetStageLabel, isPracticeAgainHandin, releasedViaLabel, handinOriginOf, approveBlockers, releaseBlockers, deskFlags, defaultLane,
  amendedStatusFor, latestLiveJob, noSheetOf, pdfStaleOf, DESK_LANES, LANE_LABEL, orderLane, revisingOf, revisingLabel, sheetOutcomeOf, sheetInProgressOf,
  markingProgressOf,
  tickPlan, tickPlanLine,
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
  it('a finished sheet puts it in process (the lane the desk opens on)', () => {
    expect(laneFor(tagged, done)).toBe('ready');
  });
  it('no job, a queued, a claimed or a failed job all mean "no sheet yet"', () => {
    expect(laneFor(tagged, null)).toBe('awaiting-sheet');
    expect(laneFor(tagged, { status: 'queued' })).toBe('awaiting-sheet');
    expect(laneFor(tagged, { status: 'claimed', stage: 'drafting' })).toBe('awaiting-sheet');
    expect(laneFor(tagged, { status: 'failed', error: 'plan cap' })).toBe('awaiting-sheet');
  });
  it('the five lanes are the five tabs, each labelled', () => {
    expect(DESK_LANES).toEqual(['auto', 'untagged', 'awaiting-sheet', 'ready', 'released']);   // the automatic lane first (9 Sep 2026)
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
// `result.noSheet`, so the paper is In process and Approve & release sends it
// on its own — the old route was `fail`, which requeued twice and then alarmed.
describe('a done job that says "nothing to teach"', () => {
  const nothing = { status: 'done', stage: 'no sheet needed', error: null,
    result: { noSheet: true, reason: '89/90 — the one lost mark was a misread' } };

  it('is a finished job, so the paper is In process', () => {
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
  it('opens on the automatic lane unless the door refused something (9 Sep 2026)', () => {
    expect(defaultLane({ auto: 12, released: 30 })).toBe('auto');
    expect(defaultLane({})).toBe('auto');
    expect(defaultLane({ ready: 2, auto: 12 })).toBe('ready');
    expect(defaultLane({ 'awaiting-sheet': 1, auto: 12 })).toBe('awaiting-sheet');
    expect(defaultLane({ untagged: 1, ready: 2 })).toBe('untagged');
  });
  it('the automatic lane comes first in the tab order', () => {
    expect(DESK_LANES[0]).toBe('auto');
    expect(DESK_LANES[DESK_LANES.length - 1]).toBe('released');
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

describe('orderLane — the oldest waiting paper is at the top', () => {
  const rows = [
    { id: 'c', createdAt: '2026-09-07T01:36:00Z' },
    { id: 'a', createdAt: '2026-09-03T01:35:00Z' },
    { id: 'b', createdAt: '2026-09-06T00:42:00Z' },
  ];
  it('work lanes run oldest first', () => {
    expect(orderLane(rows, 'ready').map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(orderLane(rows, 'awaiting-sheet').map(r => r.id)).toEqual(['a', 'b', 'c']);
    // the automatic lane too — by the date MARKED, not released (9 Sep 2026)
    const auto = [
      { id: 'x', createdAt: '2026-09-01T00:00:00Z', releasedAt: '2026-09-09T06:00:00Z' },
      { id: 'y', createdAt: '2026-09-03T00:00:00Z', releasedAt: '2026-09-08T06:00:00Z' },
      { id: 'z', createdAt: '2026-09-02T00:00:00Z', releasedAt: null },
    ];
    expect(orderLane(auto, 'auto').map(r => r.id)).toEqual(['x', 'z', 'y']);
    expect(orderLane(rows, 'untagged').map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('Released is a history and stays newest first', () => {
    expect(orderLane(rows, 'released').map(r => r.id)).toEqual(['c', 'b', 'a']);
  });
  it('does not mutate its input and keeps ties in their given order', () => {
    const tie = [{ id: 'x', createdAt: '2026-09-01T00:00:00Z' }, { id: 'y', createdAt: '2026-09-01T00:00:00Z' }];
    expect(orderLane(tie, 'ready').map(r => r.id)).toEqual(['x', 'y']);
    expect(rows[0].id).toBe('c');
  });
});

describe('laneFor — released by the system (8 Sep 2026)', () => {
  const tagged = { student_id: 'recX', released_at: null } as const;
  it('an auto-released run waits in its own lane until Adrian has looked at it', () => {
    expect(laneFor({ ...tagged, released_at: '2026-09-08T10:00:00Z', released_via: 'auto:portal', checked_at: null }, null)).toBe('auto');
    expect(laneFor({ ...tagged, released_at: '2026-09-08T10:00:00Z', released_via: 'auto:portal', checked_at: '2026-09-08T12:00:00Z' }, null)).toBe('released');
    expect(laneFor({ ...tagged, released_at: '2026-09-08T10:00:00Z', released_via: 'portal', checked_at: null }, null)).toBe('released');
  });
});

describe('the system lane empties itself (8 Sep 2026)', () => {
  it('an auto-released paper nobody looked at files itself under Completed after 7 days', () => {
    const run = { student_id: 'recX', released_at: '2026-09-01T10:00:00Z', released_via: 'auto:portal', checked_at: null };
    expect(laneFor(run, null, Date.parse('2026-09-05T10:00:00Z'))).toBe('auto');
    expect(laneFor(run, null, Date.parse('2026-09-09T10:00:00Z'))).toBe('released');
  });
});

describe('who handed the paper in (9 Sep 2026)', () => {
  it('reads the stamp each door leaves; no stamp means Adrian uploaded it', () => {
    expect(handinOriginOf({ result_json: { portal_submission: true } })).toBe('app');
    expect(handinOriginOf({ result_json: { telegram_handin: { chat_id: '1' } } })).toBe('telegram');
    expect(handinOriginOf({ result_json: { scan: { file: 'x.pdf' } } })).toBe('scan');
    expect(handinOriginOf({ result_json: { results: [] } })).toBe('adrian');
    expect(handinOriginOf({ result_json: null })).toBe('adrian');
    expect(handinOriginOf(null)).toBe('adrian');
  });
});

describe('returned Practice Again sheets (9 Sep 2026)', () => {
  it('are told apart by the attached kind or the name', () => {
    expect(isPracticeAgainHandin({ paper_name: 'Practice Again — A Math 2021 Paper 1', result_json: {} })).toBe(true);
    expect(isPracticeAgainHandin({ paper_name: 'x', result_json: { source: { paper_kind: 'practice-again' } } })).toBe(true);
    expect(isPracticeAgainHandin({ paper_name: 'sophie am tys 2021 p1', result_json: { source: {} } })).toBe(false);
    expect(isPracticeAgainHandin(null)).toBe(false);
  });
  it('a quiet one clears itself from the automatic lane; a flagged one stays', () => {
    const run = { student_id: 's', released_at: '2026-09-09T06:00:00Z', released_via: 'auto:telegram', checked_at: null, result_json: { results: [] } };
    const now = Date.parse('2026-09-09T12:00:00Z');
    expect(laneFor(run, null, now, { quiet: true })).toBe('released');
    expect(laneFor(run, null, now, { quiet: false })).toBe('auto');
    expect(laneFor(run, null, now)).toBe('auto');
  });
});

describe('releasedViaLabel — the chip in Adrian\'s words (9 Sep 2026)', () => {
  it('says who released and whether the student was told', () => {
    expect(releasedViaLabel('auto:none')).toBe('by the system · not told — no Telegram linked');
    expect(releasedViaLabel('auto:telegram')).toBe('by the system · Telegram sent');
    expect(releasedViaLabel('auto:portal')).toBe('by the system · told on Telegram, copy in the app');
    expect(releasedViaLabel('telegram')).toBe('by you · Telegram sent');
    expect(releasedViaLabel('none')).toBe('by you · not told — no Telegram linked');
    expect(releasedViaLabel(null)).toBe('');
  });
});

describe('a sheet being revised comes back to "Still to deal with" (Adrian, 10 Sep 2026)', () => {
  const released = { student_id: 'recX', released_at: '2026-09-08T10:00:00Z', released_via: 'auto:portal', checked_at: '2026-09-08T12:00:00Z' };
  const revise = (status: string, round = 2) => ({ status, stage: `revise ${round} (Adrian): fix 3(b)`, result: { revise: { round, instructions: 'fix 3(b)' } } });
  it('the first tab is named in his words', () => {
    expect(LANE_LABEL.auto).toBe('Still to deal with');
  });
  it('a released, looked-at paper whose sheet is queued, running or failed for a revision is pulled back', () => {
    expect(laneFor(released, revise('queued'))).toBe('auto');
    expect(laneFor(released, revise('claimed'))).toBe('auto');
    expect(laneFor(released, revise('failed'))).toBe('auto');
  });
  it('once the revised sheet is filed the paper goes back to where it was', () => {
    expect(laneFor(released, revise('done'))).toBe('released');
    expect(laneFor({ ...released, checked_at: null }, revise('done'))).toBe('auto');   // the ordinary not-yet-looked-at rule still decides
  });
  it('a fresh sheet being written pulls the paper back too (Adrian, later on 10 Sep 2026: "show all that is currently processing")', () => {
    expect(laneFor(released, { status: 'queued', stage: null, result: null })).toBe('auto');
    expect(laneFor(released, { status: 'claimed', stage: 'drafting', result: { requested_by: 'student' } })).toBe('auto');
    expect(laneFor(released, { status: 'failed', error: 'plan cap hit' })).toBe('auto');
    // …and goes back to where it was the moment the sheet is filed, cancelled, or found unneeded
    expect(laneFor(released, done)).toBe('released');
    expect(laneFor(released, { status: 'cancelled' })).toBe('released');
    expect(laneFor(released, { status: 'done', result: { noSheet: true, reason: 'slips only' } })).toBe('released');
    expect(laneFor(released, null)).toBe('released');
  });
  it('sheetInProgressOf is the one test for "in motion"', () => {
    expect(sheetInProgressOf({ status: 'queued' })).toBe(true);
    expect(sheetInProgressOf({ status: 'claimed', stage: 'verifying' })).toBe(true);
    expect(sheetInProgressOf({ status: 'failed', error: 'x' })).toBe(true);
    expect(sheetInProgressOf(done)).toBe(false);
    expect(sheetInProgressOf({ status: 'cancelled' })).toBe(false);
    expect(sheetInProgressOf(null)).toBe(false);
  });
  it('an unreleased paper being revised keeps its ordinary lane', () => {
    expect(laneFor(tagged, revise('queued'))).toBe('awaiting-sheet');
    expect(laneFor(tagged, revise('done'))).toBe('ready');
  });
  it('revisingOf reads the round and the state, and is null once filed', () => {
    expect(revisingOf(revise('queued', 3))).toEqual({ state: 'queued', round: 3 });
    expect(revisingOf(revise('claimed'))).toEqual({ state: 'running', round: 2 });
    expect(revisingOf(revise('failed'))).toEqual({ state: 'failed', round: 2 });
    expect(revisingOf(revise('done'))).toBeNull();
    expect(revisingOf({ status: 'queued', result: null })).toBeNull();
    expect(revisingOf(null)).toBeNull();
    expect(revisingOf({ status: 'queued', result: { revise: { round: 'x' } } })).toEqual({ state: 'queued', round: 1 });
  });
  it('the chip says what is happening', () => {
    expect(revisingLabel({ state: 'queued', round: 2 })).toBe('✏️ sheet being revised (round 2) · waiting for the Mac');
    expect(revisingLabel({ state: 'running', round: 2 })).toBe('✏️ sheet being revised (round 2)');
    expect(revisingLabel({ state: 'failed', round: 2 })).toBe('✏️ revision 2 failed');
    expect(sheetStageLabel(revise('queued', 2))).toBe('revision 2 queued');
    expect(sheetStageLabel({ status: 'queued', result: null })).toBe('queued');
  });
  it('orderLane pins a paper being revised at the top of its lane, the rest in their usual order', () => {
    const rows = [
      { id: 'c', createdAt: '2026-09-07T01:36:00Z', revising: null },
      { id: 'a', createdAt: '2026-09-03T01:35:00Z' },
      { id: 'r', createdAt: '2026-09-05T00:00:00Z', revising: { state: 'queued' as const, round: 2 } },
      { id: 'b', createdAt: '2026-09-06T00:42:00Z' },
    ];
    expect(orderLane(rows, 'auto').map(r => r.id)).toEqual(['r', 'a', 'b', 'c']);
    expect(orderLane(rows, 'released').map(r => r.id)).toEqual(['r', 'c', 'b', 'a']);
  });
});

describe('sheetOutcomeOf + the label after the sheet went out (10 Sep 2026)', () => {
  const sheet = (over: Record<string, unknown>) => ({ kind: 'worksheet', status: 'assigned', created_at: '2026-09-09T19:09:31Z', ...over });
  it('nothing live → null; a revoked sheet is not the sheet; question rows are not the sheet', () => {
    expect(sheetOutcomeOf([])).toBeNull();
    expect(sheetOutcomeOf(null)).toBeNull();
    expect(sheetOutcomeOf([sheet({ status: 'revoked', revoked_at: '2026-09-09T19:09:31Z' })])).toBeNull();
    expect(sheetOutcomeOf([{ kind: 'question', status: 'assigned', created_at: '2026-09-09T10:00:00Z' }])).toBeNull();
  });
  it('released → handed in → marked, with the moment each happened', () => {
    expect(sheetOutcomeOf([sheet({})])).toEqual({ state: 'released', at: '2026-09-09T19:09:31Z', required: false });
    expect(sheetOutcomeOf([sheet({ status: 'submitted', submitted_at: '2026-09-10T02:00:00Z' })])).toEqual({ state: 'handed-in', at: '2026-09-10T02:00:00Z', required: false });
    expect(sheetOutcomeOf([sheet({ status: 'marked', submitted_at: '2026-09-10T02:00:00Z', marked_at: '2026-09-10T02:30:00Z' })])).toEqual({ state: 'marked', at: '2026-09-10T02:30:00Z', required: false });
  });
  it('the NEWEST live sheet is the sheet (Isabelle: a revoked first copy, then the sent one)', () => {
    const rows = [
      sheet({ status: 'revoked', created_at: '2026-09-09T18:15:25Z', revoked_at: '2026-09-09T19:09:31Z' }),
      sheet({ created_at: '2026-09-09T19:09:31Z' }),
    ];
    expect(sheetOutcomeOf(rows)?.state).toBe('released');
    // a handed-in older sheet keeps its row, but a newer sent sheet is what the row now shows
    const two = [sheet({ status: 'submitted', submitted_at: '2026-09-08T00:00:00Z', created_at: '2026-09-07T00:00:00Z' }), sheet({ created_at: '2026-09-09T00:00:00Z' })];
    expect(sheetOutcomeOf(two)?.state).toBe('released');
  });
  it('compulsory when Adrian set it', () => {
    expect(sheetOutcomeOf([sheet({ required_at: '2026-09-09T19:09:31Z' })])).toEqual({ state: 'released', at: '2026-09-09T19:09:31Z', required: true });
  });
  it('the label reads the outcome, and falls back to the job\'s own release stamp', () => {
    expect(sheetStageLabel(done, { state: 'released', at: null, required: false })).toBe('sheet released · not handed in yet');
    expect(sheetStageLabel(done, { state: 'handed-in', at: null, required: false })).toBe('sheet handed in · being marked');
    expect(sheetStageLabel(done, { state: 'marked', at: null, required: false })).toBe('sheet handed in · marked');
    expect(sheetStageLabel(done, { state: 'released', at: null, required: true })).toBe('sheet released · not handed in yet · compulsory');
    expect(sheetStageLabel({ ...done, auto_released_at: '2026-09-09T19:09:34Z' })).toBe('sheet sent');
    expect(sheetStageLabel({ ...done, auto_released_at: '2026-09-09T19:09:34Z' }, null)).toBe('sheet sent');
    expect(sheetStageLabel(done, null)).toBe('sheet ready');
    // a "nothing to teach" job never reads as released, whatever the rows say
    expect(sheetStageLabel({ status: 'done', result: { noSheet: true, reason: 'slips only' } }, { state: 'released', at: null, required: false })).toBe('no sheet needed — slips only');
    // an unfinished job ignores the outcome
    expect(sheetStageLabel({ status: 'claimed', stage: 'verifying' }, { state: 'released', at: null, required: false })).toBe('verifying…');
  });
});

// ── 10 Sep 2026: a paper being marked shows on the to-do tab as a status row ──
describe('markingProgressOf — where a queued paper is', () => {
  const queued = { queued_at: '2026-09-10T09:05:00Z', attempts: 0 };
  it('is null for a marked run and for a run that was never queued', () => {
    expect(markingProgressOf({ result_json: { results: [{}], queue: queued } })).toBeNull();
    expect(markingProgressOf({ result_json: { source: {} } })).toBeNull();
    expect(markingProgressOf(null)).toBeNull();
  });
  it('queued, with the next attempt named after a failure-free retry', () => {
    expect(markingProgressOf({ result_json: { queue: queued } })).toMatchObject({ state: 'queued', attempts: 0, queuedAt: '2026-09-10T09:05:00Z' });
    expect(markingProgressOf({ result_json: { queue: { ...queued, attempts: 1 } } })?.label).toMatch(/attempt 2 next/);
  });
  it('a Mac slot reading — with its page progress', () => {
    const p = markingProgressOf({ result_json: { queue: { ...queued, external_claim: { by: 'mac-plan-x', progress: { done: 8, total: 17 } } } } });
    expect(p).toMatchObject({ state: 'reading', done: 8, total: 17 });
    expect(p?.label).toMatch(/page 8\/17/);
  });
  it('read on the Mac, claim released, waiting for the bot to assemble', () => {
    const p = markingProgressOf({ result_json: { queue: { ...queued, external_claim: { by: 'mac-plan-x', released_at: '2026-09-10T10:00:00Z', progress: { done: 10, total: 10 } } } } });
    expect(p).toMatchObject({ state: 'assembling', done: 10, total: 10 });
    expect(p?.label).toMatch(/waiting for the bot/);
  });
  it('a handed-back claim (reads saved, bot to assemble) reads as assembling', () => {
    const p = markingProgressOf({ result_json: { queue: { ...queued, external_claim: { by: 'mac-plan-x', released_at: '2026-09-10T10:00:00Z', handed_back_at: '2026-09-10T10:00:00Z', progress: { done: 17, total: 17 } } } } });
    expect(p).toMatchObject({ state: 'assembling', done: 17, total: 17 });
    expect(p?.label).toMatch(/handed back/);
  });
  it('the bot itself holds the paper', () => {
    expect(markingProgressOf({ result_json: { queue: { ...queued, claimed_by: 'fly-worker' } } })).toMatchObject({ state: 'assembling' });
  });
  it('a failed attempt says so, with the error, and that the queue retries', () => {
    const p = markingProgressOf({ result_json: { queue: { ...queued, attempts: 2, last_error: 'vision unavailable' } } });
    expect(p).toMatchObject({ state: 'stuck', attempts: 2 });
    expect(p?.label).toMatch(/attempt 2 failed — vision unavailable/);
  });
  it('the page count falls back to the run\'s photos when the claim has no progress', () => {
    expect(markingProgressOf({ num_photos: 12, result_json: { queue: { ...queued, external_claim: { by: 'mac' } } } })).toMatchObject({ state: 'reading', done: null, total: 12 });
  });
});

describe('orderLane — a paper being marked pins above everything', () => {
  it('marking first, then a revision, then date order', () => {
    const rows = [
      { id: 'old', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'rev', createdAt: '2026-09-05T00:00:00Z', revising: { state: 'running' as const, round: 1 } },
      { id: 'mk', createdAt: '2026-09-09T00:00:00Z', marking: { state: 'queued' as const, label: 'x', done: null, total: null, attempts: 0, queuedAt: null } },
      { id: 'new', createdAt: '2026-09-08T00:00:00Z' },
    ];
    expect(orderLane(rows, 'auto').map(r => r.id)).toEqual(['mk', 'rev', 'old', 'new']);
  });
});

describe('tickPlan — one sheet per student per maths; a lone paper gets its own (11 Sep 2026)', () => {
  const row = (id: string, paperSubject: string | null, studentId = 's1', studentName = 'Isabelle'): { id: string; studentId: string; studentName: string; paperSubject: string | null } =>
    ({ id, studentId, studentName, paperSubject });
  it('three AM + two EM papers of one student → two merged sheets, one per maths', () => {
    const plan = tickPlan([row('a', 'A Math'), row('b', 'A Math'), row('c', 'A Math'), row('d', 'E Math'), row('e', 'E Math')]);
    expect(plan).toEqual({ kind: 'ok', groups: [
      { studentId: 's1', student: 'Isabelle', subject: 'A Math', runIds: ['a', 'b', 'c'] },
      { studentId: 's1', student: 'Isabelle', subject: 'E Math', runIds: ['d', 'e'] },
    ] });
    expect(tickPlanLine(plan)).toBe('📘 2 Practice Again sheets — Isabelle: A Math (3 papers merged), E Math (2 papers merged)');
  });
  it('one maths only → one merged sheet', () => {
    expect(tickPlanLine(tickPlan([row('a', 'A Math'), row('b', 'A Math')]))).toBe('📘 One Practice Again sheet — Isabelle: A Math (2 papers merged)');
  });
  it("a maths with a single ticked paper gets that paper's own sheet — Joey's lone A Math beside three E Math", () => {
    const plan = tickPlan([row('a', 'E Math', 's2', 'Joey'), row('b', 'E Math', 's2', 'Joey'), row('c', 'E Math', 's2', 'Joey'), row('d', 'A Math', 's2', 'Joey')]);
    expect(plan).toEqual({ kind: 'ok', groups: [
      { studentId: 's2', student: 'Joey', subject: 'E Math', runIds: ['a', 'b', 'c'] },
      { studentId: 's2', student: 'Joey', subject: 'A Math', runIds: ['d'] },
    ] });
    expect(tickPlanLine(plan)).toBe('📘 2 Practice Again sheets — Joey: E Math (3 papers merged), A Math (1 paper, its own sheet)');
  });
  it('a single ticked paper is one single sheet', () => {
    expect(tickPlanLine(tickPlan([row('a', 'A Math')]))).toBe('📘 One Practice Again sheet — Isabelle: A Math (1 paper, its own sheet)');
  });
  it('two students ticked together → separate sheets, never one shared', () => {
    const plan = tickPlan([row('a', 'A Math'), row('b', 'A Math', 's2', 'Alexis'), row('c', 'A Math')]);
    expect(plan).toEqual({ kind: 'ok', groups: [
      { studentId: 's1', student: 'Isabelle', subject: 'A Math', runIds: ['a', 'c'] },
      { studentId: 's2', student: 'Alexis', subject: 'A Math', runIds: ['b'] },
    ] });
    expect(tickPlanLine(plan)).toBe('📘 2 Practice Again sheets — Isabelle: A Math (2 papers merged) · Alexis: A Math (1 paper, its own sheet)');
  });
  it('nothing ticked → none', () => { expect(tickPlan([])).toEqual({ kind: 'none' }); });
});
