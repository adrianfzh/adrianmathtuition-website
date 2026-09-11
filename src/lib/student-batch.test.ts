import { describe, it, expect } from 'vitest';
import {
  studentBatchGuard, marksLostAcross, paperMarks, shelvedGaps, waveTwoFocus,
  pickStates, tickBar, outsideWindow,
  BATCH_WINDOW_DAYS, MAX_BATCH_PAPERS, STRONG_BATCH_MARKS, shortPaperName, practiceAgainRequestLine,
  NOTE_STALE, NOTE_IN_FLIGHT,
  type StudentBatchRun, type PickPaper,
  shelfWorthAWave, WAVE_MIN_MARKS_PER_GAP,
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

describe('wave two — the shelf and the focus the worker reads', () => {
  it('reads the flat result.shelved of an older job', () => {
    // …and offers only the gaps that cost the bar: the 1-mark rod stays off the card
    expect(shelvedGaps({ docx_path: 'x', shelved: ['Q6(b) cubic divided by a quadratic factor — compare coefficients (3 marks), for wave 2', ' Resolving a rod joined at 90 degrees — Q4(a), 1 mark '] }))
      .toEqual(['Q6(b) cubic divided by a quadratic factor — compare coefficients (3 marks), for wave 2']);
    // a bare name is not a gap on the old list — it named sections dropped, disputes and filing notes alike
    expect(shelvedGaps({ docx_path: 'x', shelved: ['Polynomials', ' Plane geometry '] })).toEqual([]);
  });
  it("reads the richer result.gaps.shelved the worker writes since 11 Sep 2026, and prefers it", () => {
    expect(shelvedGaps({
      docx_path: 'x',
      shelved: ['the old flat name'],
      gaps: { found: 5, covered: 3, shelved: [
        { skill: 'Polynomials — remainder theorem', runs: [{ run_id: 'a', questions: ['Q9(c)'], marks: 3 }], why: 'one-off, oldest paper' },
        { skill: 'Plane geometry', runs: [{ run_id: 'a', questions: ['Q11(b)'], marks: 4 }], why: 'no room' },
        { skill: 'Surds', runs: [{ run_id: 'a', questions: ['Q1'], marks: 1 }], why: 'one mark' },
      ] },
    })).toEqual(['Polynomials — remainder theorem', 'Plane geometry']);
  });
  it('is empty for a job that wrote no sheet, or shelved nothing', () => {
    expect(shelvedGaps({ noSheet: true, reason: 'nothing to teach', shelved: ['x'] })).toEqual([]);
    expect(shelvedGaps({ docx_path: 'x' })).toEqual([]);
    expect(shelvedGaps({ docx_path: 'x', gaps: { found: 3, covered: 3, shelved: [] } })).toEqual([]);
    expect(shelvedGaps(null)).toEqual([]);
  });
  it('hands the worker a focus it can read as `focus.wave` and `focus.shelved`', () => {
    const focus = JSON.parse(waveTwoFocus(['chain rule', 'exact form in a show-that']));
    expect(focus.wave).toBe(2);
    expect(focus.shelved).toEqual(['chain rule', 'exact form in a show-that']);
    expect(focus.instruction).toContain('EXACTLY');
  });
  it('drops the tail of a very long shelf rather than cutting the JSON', () => {
    const focus = waveTwoFocus(Array.from({ length: 20 }, (_, i) => `a very long shelved gap number ${i} `.repeat(4)));
    expect(focus.length).toBeLessThanOrEqual(2000);
    expect(() => JSON.parse(focus)).not.toThrow();
    expect(JSON.parse(focus).shelved.length).toBeGreaterThan(0);
  });
});

describe("what Adrian's Telegram says", () => {
  it('drops the level from a paper name the maths already states', () => {
    expect(shortPaperName('A Math · GCE 2025 · Paper 1')).toBe('GCE 2025 · Paper 1');
    expect(shortPaperName('H2 Math · Prelim · Paper 2')).toBe('Prelim · Paper 2');
    expect(shortPaperName('Marked paper')).toBe('Marked paper');
  });
  it('names the papers and says the sheet goes out on its own', () => {
    const line = practiceAgainRequestLine({ who: 'Isabelle', subject: 'A Math', papers: ['GCE 2025 · Paper 1', 'GCE 2025 · Paper 2', 'GCE 2023 · Paper 2'] });
    expect(line).toContain('asked for ONE Practice Again sheet for 3 papers');
    expect(line).toContain('(A Math · GCE 2025 · Paper 1, GCE 2025 · Paper 2, GCE 2023 · Paper 2)');
    expect(line).toContain('queued for the Mac');
    expect(line).toContain('goes out on its own once written and checked');
  });
  it('keeps the single-paper wording for a single paper', () => {
    const line = practiceAgainRequestLine({ who: 'Isabelle', papers: ['GCE 2025 · Paper 1'] });
    expect(line).toContain('asked for Practice Again on GCE 2025 · Paper 1');
    expect(line).not.toContain('papers (');
  });
  it('says so when it is the next wave', () => {
    expect(practiceAgainRequestLine({ who: 'Isabelle', subject: 'E Math', papers: ['a', 'b'], wave: 2 }))
      .toContain('asked for the next wave of their Practice Again sheet for 2 papers');
    expect(practiceAgainRequestLine({ who: 'Isabelle', papers: ['a'], wave: 2 }))
      .toContain('teaches what the last sheet shelved');
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

describe(`shelfWorthAWave — the bar is ${WAVE_MIN_MARKS_PER_GAP} marks PER GAP (Adrian, 11 Sep 2026)`, () => {
  const rich = (entries: Array<{ skill: string; marks?: number; runs?: Array<{ marks: number }> }>) => ({ gaps: { found: 9, covered: 9 - entries.length, shelved: entries } });
  it('one gap at the bar is enough', () => {
    expect(shelfWorthAWave(rich([{ skill: 'a', runs: [{ marks: 3 }] }]))).toEqual({ worth: true, count: 1, marks: 3 });
    expect(shelfWorthAWave(rich([{ skill: 'a', marks: 5 }]))).toMatchObject({ worth: true, count: 1, marks: 5 });
  });
  it('small gaps never add up to it — two one-mark gaps are not offered', () => {
    expect(shelfWorthAWave(rich([{ skill: 'a', runs: [{ marks: 1 }] }, { skill: 'b', runs: [{ marks: 1 }] }]))).toEqual({ worth: false, count: 0, marks: 0 });
    expect(shelfWorthAWave(rich([{ skill: 'a', runs: [{ marks: 2 }] }, { skill: 'b', runs: [{ marks: 2 }] }, { skill: 'c', runs: [{ marks: 2 }] }]))).toEqual({ worth: false, count: 0, marks: 0 });
  });
  it('a gap spread over two papers counts what it cost across both', () => {
    expect(shelfWorthAWave(rich([{ skill: 'a', runs: [{ marks: 2 }, { marks: 1 }] }]))).toEqual({ worth: true, count: 1, marks: 3 });
  });
  it('only the gaps at the bar are counted and offered', () => {
    const r = rich([{ skill: 'big', runs: [{ marks: 4 }] }, { skill: 'small', runs: [{ marks: 1 }] }, { skill: 'bigger', runs: [{ marks: 3 }] }]);
    expect(shelfWorthAWave(r)).toEqual({ worth: true, count: 2, marks: 7 });
    expect(shelvedGaps(r)).toEqual(['big', 'bigger']);
  });
  it('the old flat list is read the way Adrian reads it: a question with its marks is a gap, a note is not', () => {
    const isabelle = [
      "2025 P2 Q2(b), 1 mark — scaling keeps the maximum at h = 2 (she solved the first day's model for T = 3): next wave",
      '2025 P2 Q11(b), 1 mark — midpoint means each object covers 15 cm, not 30: next wave',
      '2023 P2: 8 marks unmapped by allocation (counted_max 82 of 90) — every question was marked, the [n] were read low',
      'Sections dropped from the 10 Sep merge: "Checking Every Root" faces 3b (2025 P1 Q6(a), now full marks on the re-mark)',
      'Bank answers found WRONG while verifying (worth fixing on the bank): Xinmin 2025 P2 Q10(a) stores a = 4, b = 1/8',
      'Filed OVER the 10 Sep merged sheet in the same batch folder (one folder, one sheet)',
    ];
    // two real gaps, but one mark each — read correctly, and NOT offered (the bar is 3 marks per gap)
    expect(shelfWorthAWave({ docx_path: 'x', shelved: isabelle })).toEqual({ worth: false, count: 0, marks: 0 });
    expect(shelvedGaps({ docx_path: 'x', shelved: isabelle })).toEqual([]);
    const withOneBig = [...isabelle, '2025 P2 Q10(b)(ii), 4 marks — the largest loss on the paper, kept for the next wave'];
    expect(shelfWorthAWave({ docx_path: 'x', shelved: withOneBig })).toEqual({ worth: true, count: 1, marks: 4 });
    expect(shelvedGaps({ docx_path: 'x', shelved: withOneBig })).toEqual([withOneBig[6]]);
  });
  it('disputes, slips, "taught by the last sheet" and pages never photographed are notes, not gaps', () => {
    expect(shelfWorthAWave({ shelved: [
      'Q16(b) circle theorem, 1 mark — disputed by second look — check on the desk',
      'Q7, 3 marks — transfer (copy) slip, no practice.',
      'Q8(a),(b) four points on a circle (3 marks) — taught by the 3 Sep sheet',
      '2025 P1 Q12 — 9 marks, not on her photographed pages',
      'Q7 — left blank AND never graded; it is inside the 15 marks the marker could not locate',
    ] })).toEqual({ worth: false, count: 0, marks: 0 });
    // one closing line disowns the whole list
    expect(shelfWorthAWave({ shelved: [
      'Clearing a fraction on both sides — Q9(a), 1 mark',
      'Stating the answer as a range of x — Q10(e), 1 mark',
      "(these 6 marks are slips, not skills — reported as 'show' tier, no practice set)",
    ] }).count).toBe(0);
    // NOT taught is the opposite of taught
    expect(shelfWorthAWave({ shelved: ['NEW ON THE RE-MARK, NOT TAUGHT ON THE MERGED SHEET — Q2(b), 3 marks, with a marker gap'] })).toMatchObject({ count: 1, marks: 3 });
  });
  it('one legacy gap at the bar is enough; two-mark gaps and bare names never are', () => {
    expect(shelfWorthAWave({ shelved: ['Q6(b) cubic divided by a quadratic factor — compare coefficients (3 marks), for wave 2'] })).toEqual({ worth: true, count: 1, marks: 3 });
    expect(shelfWorthAWave({ shelved: ['(Q9, 2 marks) show-that discipline', 'Zhonghua Q26 constructions/loci — 2m'] })).toEqual({ worth: false, count: 0, marks: 0 });
    expect(shelfWorthAWave({ shelved: ['a', 'b'] })).toEqual({ worth: false, count: 0, marks: 0 });
  });
  it('no sheet, no shelf, junk → never', () => {
    expect(shelfWorthAWave({ noSheet: true, shelved: ['a', 'b'] }).worth).toBe(false);
    expect(shelfWorthAWave({}).worth).toBe(false);
    expect(shelfWorthAWave(null).worth).toBe(false);
    expect(shelfWorthAWave(rich([{ skill: '' }, { skill: '  ' }])).count).toBe(0);
  });
});
