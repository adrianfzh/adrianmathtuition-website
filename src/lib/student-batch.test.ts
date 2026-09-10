import { describe, it, expect } from 'vitest';
import {
  studentBatchGuard, marksLostAcross, paperMarks, shelvedGaps, waveTwoFocus,
  pickStates, tickBar, outsideWindow,
  BATCH_WINDOW_DAYS, MAX_BATCH_PAPERS, STRONG_BATCH_MARKS,
  NOTE_STALE, NOTE_IN_FLIGHT,
  type StudentBatchRun, type PickPaper,
} from './student-batch';

const NOW = Date.parse('2026-09-11T02:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 3600_000).toISOString();

/** A released, tagged, marked A Math paper that lost 20 marks. */
function run(over: Partial<StudentBatchRun> = {}): StudentBatchRun {
  return {
    id: over.id ?? 'run-1',
    paper_name: 'am tys 2025 p1',
    student_id: 'recStudent',
    student_name: 'A student',
    released_at: daysAgo(1),
    created_at: daysAgo(1),
    paper_subject: 'A Math',
    subject: 'math',
    result_json: { results: [], totals: { awarded: 70, max: 90 } },
    ...over,
  };
}

const two = () => [run({ id: 'a' }), run({ id: 'b' })];

describe('studentBatchGuard — how many papers', () => {
  it('refuses one paper — a single paper has its own Request button', () => {
    expect(studentBatchGuard([run({ id: 'a' })], [], { now: NOW }))
      .toMatchObject({ ok: false, status: 'count', http: 400, message: 'Choose two or three papers for one sheet.' });
  });
  it('takes two and three', () => {
    expect(studentBatchGuard(two(), [], { now: NOW })).toMatchObject({ ok: true });
    expect(studentBatchGuard([...two(), run({ id: 'c' })], [], { now: NOW })).toMatchObject({ ok: true });
  });
  it('refuses four', () => {
    const four = [...two(), run({ id: 'c' }), run({ id: 'd' })];
    expect(studentBatchGuard(four, [], { now: NOW })).toMatchObject({ ok: false, status: 'count', http: 400, message: 'Three papers at most for one sheet.' });
  });
  it('counts the same paper twice as one', () => {
    expect(studentBatchGuard([run({ id: 'a' }), run({ id: 'a' })], [], { now: NOW })).toMatchObject({ ok: false, status: 'count' });
  });
  it("refuses a paper that is not the student's own released run (a null row)", () => {
    expect(studentBatchGuard([run({ id: 'a' }), null], [], { now: NOW }))
      .toMatchObject({ ok: false, status: 'not-found', http: 404 });
  });
});

describe('studentBatchGuard — one maths', () => {
  it('refuses A Math ticked with E Math', () => {
    const mixed = [run({ id: 'a' }), run({ id: 'b', paper_subject: 'E Math' })];
    expect(studentBatchGuard(mixed, [], { now: NOW }))
      .toMatchObject({ ok: false, status: 'mixed-subjects', http: 400 });
  });
  it('two E Math papers are fine, and the subject comes back', () => {
    const em = [run({ id: 'a', paper_subject: 'E Math' }), run({ id: 'b', paper_subject: 'E Math' })];
    expect(studentBatchGuard(em, [], { now: NOW })).toMatchObject({ ok: true, subject: 'E Math' });
  });
});

describe(`studentBatchGuard — the ${BATCH_WINDOW_DAYS}-day window`, () => {
  it('takes a paper marked exactly at the edge', () => {
    const edge = [run({ id: 'a' }), run({ id: 'b', created_at: daysAgo(BATCH_WINDOW_DAYS) })];
    expect(studentBatchGuard(edge, [], { now: NOW })).toMatchObject({ ok: true });
  });
  it('refuses a paper older than the window, naming it', () => {
    const old = [run({ id: 'a' }), run({ id: 'b', created_at: daysAgo(6), paper_name: 'am tys 2023 p2' })];
    const out = studentBatchGuard(old, [], { now: NOW });
    expect(out).toMatchObject({ ok: false, status: 'stale', http: 400, runId: 'b' });
    expect((out as { message: string }).message).toContain('am tys 2023 p2');
  });
});

describe('studentBatchGuard — a sheet already in flight', () => {
  it('refuses while a job covering one of the papers is queued or claimed', () => {
    for (const status of ['queued', 'claimed']) {
      expect(studentBatchGuard(two(), [{ id: 'j', status, run_id: 'b' }], { now: NOW }))
        .toMatchObject({ ok: false, status: 'in-flight', http: 409, runId: 'b' });
    }
  });
  it('sees a BATCH job through run_ids, not just run_id', () => {
    expect(studentBatchGuard(two(), [{ id: 'j', status: 'queued', run_id: 'zz', run_ids: ['zz', 'a'] }], { now: NOW }))
      .toMatchObject({ ok: false, status: 'in-flight', runId: 'a' });
  });
  it('a FINISHED sheet is not a refusal — the worker reuses its examples', () => {
    expect(studentBatchGuard(two(), [{ id: 'j', status: 'done', run_id: 'a' }], { now: NOW })).toMatchObject({ ok: true });
  });
});

describe('studentBatchGuard — the per-paper rules both doors share', () => {
  it('refuses a science paper', () => {
    expect(studentBatchGuard([run({ id: 'a' }), run({ id: 'b', subject: 'physics' })], [], { now: NOW }))
      .toMatchObject({ ok: false, status: 'science', http: 400, runId: 'b' });
  });
  it('refuses a returned Practice Again sheet', () => {
    const sheet = run({ id: 'b', paper_name: 'Practice Again — AM TYS 2025 P1' });
    expect(studentBatchGuard([run({ id: 'a' }), sheet], [], { now: NOW }))
      .toMatchObject({ ok: false, status: 'practice-again', http: 409, runId: 'b' });
  });
  it('refuses a paper that is not out yet', () => {
    expect(studentBatchGuard([run({ id: 'a' }), run({ id: 'b', released_at: null })], [], { now: NOW }))
      .toMatchObject({ ok: false, status: 'not-released', runId: 'b' });
  });
  it('refuses a paper with no marking on it', () => {
    expect(studentBatchGuard([run({ id: 'a' }), run({ id: 'b', result_json: null })], [], { now: NOW }))
      .toMatchObject({ ok: false, status: 'no-marking', runId: 'b' });
  });
});

describe(`studentBatchGuard — the strong batch (under ${STRONG_BATCH_MARKS} marks lost)`, () => {
  const lost = (n: number, id: string) => run({ id, result_json: { results: [], totals: { awarded: 90 - n, max: 90 } } });

  it('refuses at 9 marks lost between the papers — as an answer, not an error', () => {
    const out = studentBatchGuard([lost(5, 'a'), lost(4, 'b')], [], { now: NOW });
    expect(out).toMatchObject({ ok: false, status: 'strong', http: 200, href: '/app/print' });
    expect((out as { message: string }).message).toContain('under 10 marks lost between them');
  });
  it('lets 10 marks lost through', () => {
    expect(studentBatchGuard([lost(5, 'a'), lost(5, 'b')], [], { now: NOW })).toMatchObject({ ok: true, marksLost: 10 });
  });
  it('cannot judge a batch whose papers carry no totals, so does not refuse it', () => {
    const blank = (id: string) => run({ id, result_json: { results: [] } });
    expect(studentBatchGuard([blank('a'), blank('b')], [], { now: NOW })).toMatchObject({ ok: true, marksLost: 0 });
  });
});

describe('studentBatchGuard — wave two is a continuation', () => {
  const lost = (n: number, id: string, at: string) =>
    run({ id, created_at: at, result_json: { results: [], totals: { awarded: 90 - n, max: 90 } } });

  it('skips the strong rule', () => {
    const strong = [lost(4, 'a', daysAgo(1)), lost(3, 'b', daysAgo(1))];
    expect(studentBatchGuard(strong, [], { now: NOW })).toMatchObject({ ok: false, status: 'strong' });
    expect(studentBatchGuard(strong, [], { now: NOW, wave: 2 })).toMatchObject({ ok: true });
  });
  it('skips the 5-day window — the papers were chosen when the first sheet was written', () => {
    const old = [lost(30, 'a', daysAgo(30)), lost(25, 'b', daysAgo(28))];
    expect(studentBatchGuard(old, [], { now: NOW })).toMatchObject({ ok: false, status: 'stale' });
    expect(studentBatchGuard(old, [], { now: NOW, wave: 2 })).toMatchObject({ ok: true });
  });
  it('still refuses a paper that is not theirs, another maths, or one in flight', () => {
    expect(studentBatchGuard([run({ id: 'a' }), null], [], { now: NOW, wave: 2 })).toMatchObject({ ok: false, status: 'not-found' });
    expect(studentBatchGuard([run({ id: 'a' }), run({ id: 'b', paper_subject: 'E Math' })], [], { now: NOW, wave: 2 }))
      .toMatchObject({ ok: false, status: 'mixed-subjects' });
    expect(studentBatchGuard(two(), [{ id: 'j', status: 'claimed', run_id: 'a' }], { now: NOW, wave: 2 }))
      .toMatchObject({ ok: false, status: 'in-flight' });
  });
});

describe('studentBatchGuard — the order it hands back', () => {
  it('puts the newest paper first, so the batch primary is the one they just sat', () => {
    const out = studentBatchGuard(
      [run({ id: 'old', created_at: daysAgo(4) }), run({ id: 'new', created_at: daysAgo(1) })],
      [], { now: NOW },
    );
    expect(out).toMatchObject({ ok: true, runIds: ['new', 'old'] });
  });
});

describe('marks lost', () => {
  it('prefers the stored columns (what a triage override writes) over result_json', () => {
    expect(paperMarks({ total_awarded: 60, total_max: 90, result_json: { totals: { awarded: 70, max: 90 } } }))
      .toEqual({ awarded: 60, max: 90 });
  });
  it('falls back to result_json.totals', () => {
    expect(paperMarks({ result_json: { totals: { awarded: 70, max: 90 } } })).toEqual({ awarded: 70, max: 90 });
  });
  it('is null when a run carries no totals at all', () => {
    expect(paperMarks({ result_json: { results: [] } })).toBeNull();
    expect(paperMarks(null)).toBeNull();
  });
  it('sums the losses and counts how many papers it could read', () => {
    expect(marksLostAcross([
      { total_awarded: 80, total_max: 90 },
      { result_json: { totals: { awarded: 40, max: 50 } } },
      { result_json: {} },
    ])).toEqual({ lost: 20, known: 2 });
  });
  it('never counts a negative loss', () => {
    expect(marksLostAcross([{ total_awarded: 95, total_max: 90 }])).toEqual({ lost: 0, known: 1 });
  });
});

describe('wave two — the shelf and the focus line', () => {
  it('reads result.shelved off a finished job', () => {
    expect(shelvedGaps({ docx_path: 'x', shelved: ['Polynomials', ' Plane geometry '] })).toEqual(['Polynomials', 'Plane geometry']);
  });
  it('is empty for a job that wrote no sheet, or shelved nothing', () => {
    expect(shelvedGaps({ noSheet: true, reason: 'nothing to teach', shelved: ['x'] })).toEqual([]);
    expect(shelvedGaps({ docx_path: 'x' })).toEqual([]);
    expect(shelvedGaps(null)).toEqual([]);
  });
  it('names the shelved gaps in the focus line the worker honours', () => {
    const line = waveTwoFocus(['chain rule', 'exact form in a show-that']);
    expect(line).toContain('Wave 2');
    expect(line).toContain('chain rule; exact form in a show-that');
  });
  it('fits the 300-character focus column, cut on a boundary', () => {
    const line = waveTwoFocus(Array.from({ length: 20 }, (_, i) => `a very long shelved gap number ${i}`));
    expect(line.length).toBeLessThanOrEqual(300);
    expect(line.endsWith('…')).toBe(true);
  });
});

// ── Tick mode on the Papers list ─────────────────────────────────────────────

function pick(over: Partial<PickPaper> = {}): PickPaper {
  return { id: 'a', name: 'A Math · GCE 2025 · Paper 1', subject: 'A Math', date: '2026-09-10', awarded: 70, max: 90, blocked: null, ...over };
}

describe('pickStates', () => {
  const am1 = pick({ id: 'a' }), am2 = pick({ id: 'b' }), am3 = pick({ id: 'c' }), am4 = pick({ id: 'd' });
  const em = pick({ id: 'e', subject: 'E Math' });

  it('leaves everything tickable before the first tick', () => {
    const s = pickStates([am1, am2, em], []);
    expect([...s.values()].every(v => !v.disabled)).toBe(true);
  });
  it('greys the other maths once the first paper is ticked', () => {
    const s = pickStates([am1, am2, em], ['a']);
    expect(s.get('b')).toEqual({ disabled: false, note: null });
    expect(s.get('e')).toEqual({ disabled: true, note: 'different maths' });
  });
  it('greys the rest at three ticks — the fourth is refused on screen', () => {
    const s = pickStates([am1, am2, am3, am4], ['a', 'b', 'c']);
    expect(s.get('d')).toEqual({ disabled: true, note: 'three papers at most' });
    expect(s.get('a')?.disabled).toBe(false);   // still untickable
  });
  it('keeps an absolute block, and its own words, whatever is ticked', () => {
    const s = pickStates([am1, pick({ id: 'b', blocked: NOTE_STALE }), pick({ id: 'c', blocked: NOTE_IN_FLIGHT })], ['a']);
    expect(s.get('b')).toEqual({ disabled: true, note: NOTE_STALE });
    expect(s.get('c')).toEqual({ disabled: true, note: NOTE_IN_FLIGHT });
  });
  it('never disables a ticked paper', () => {
    const s = pickStates([pick({ id: 'a', blocked: NOTE_STALE }), am2, am3, am4], ['a', 'b', 'c']);
    expect(s.get('a')).toEqual({ disabled: false, note: null });
  });
});

describe('tickBar', () => {
  it('says nothing with nothing ticked', () => {
    expect(tickBar([])).toEqual({ line: '', canRequest: false });
  });
  it('asks for a second paper of the same maths, and holds the button', () => {
    expect(tickBar([pick()])).toEqual({ line: 'Tick another A Math paper to make one sheet', canRequest: false });
  });
  it('describes the sheet at two and three, and opens the button', () => {
    const at2 = tickBar([pick({ id: 'a' }), pick({ id: 'b' })]);
    expect(at2.canRequest).toBe(true);
    expect(at2.line).toBe('One Practice Again sheet for 2 papers · A Math · the same gap in two papers becomes one section');
    expect(tickBar([pick({ id: 'a' }), pick({ id: 'b' }), pick({ id: 'c' })]).line).toContain('3 papers');
  });
  it('holds the button past three, however the ticks got there', () => {
    const four = Array.from({ length: MAX_BATCH_PAPERS + 1 }, (_, i) => pick({ id: String(i) }));
    expect(tickBar(four)).toEqual({ line: 'Three papers at most — untick one.', canRequest: false });
  });
  it('calls an untagged paper "maths", never "Other"', () => {
    expect(tickBar([pick({ subject: 'Other' })]).line).toBe('Tick another maths paper to make one sheet');
    expect(tickBar([pick({ subject: '' })]).line).toBe('Tick another maths paper to make one sheet');
  });
});

describe('outsideWindow', () => {
  it('is the same 5 days the guard uses', () => {
    expect(outsideWindow(daysAgo(BATCH_WINDOW_DAYS), NOW)).toBe(false);
    expect(outsideWindow(daysAgo(BATCH_WINDOW_DAYS + 1), NOW)).toBe(true);
  });
  it('treats an unreadable date as inside — a paper is never hidden by a bad stamp', () => {
    expect(outsideWindow(null, NOW)).toBe(false);
    expect(outsideWindow('not a date', NOW)).toBe(false);
  });
});
