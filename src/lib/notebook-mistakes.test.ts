import { describe, it, expect } from 'vitest';
import {
  applyObservation,
  bandOf,
  displayOrder,
  entriesFromRun,
  foldObservations,
  latestSighting,
  markCorrected,
  mistakeTitle,
  observationsFromAttempt,
  partLabel,
  questionNumberOf,
  sightingLine,
  stateLabel,
  sweepStudentFixed,
  tagToErrorKind,
  PAPER_CLEAN_WEIGHT,
  STUDENT_FIXED_DAYS,
  type MistakeEntry,
  type MistakeEvidence,
  type Observation,
} from './notebook-mistakes';

const NOW = new Date('2026-09-06T04:00:00Z');
const SID = 'recSTUDENT1';

// ── fixtures ────────────────────────────────────────────────────────────────

type PartFx = { label?: string; max: number; awarded: number; kind?: string | null };
type QFx = { n: string; topic: string | null; parts: PartFx[] };

/** A paper_marking_runs.result_json with the shape the marker writes. */
function run(questions: QFx[], diagnosis?: unknown) {
  return {
    results: questions.map(q => ({
      question_number: q.n,
      marking: {
        total_max: q.parts.reduce((s, p) => s + p.max, 0),
        total_awarded: q.parts.reduce((s, p) => s + p.awarded, 0),
        parts: q.parts.map(p => ({ label: p.label ?? '', max: p.max, awarded: p.awarded })),
      },
      marking_output: {
        meta: { topic_detected: q.topic },
        parts: q.parts.map(p => ({ label: p.label ?? '', max: p.max, awarded: p.awarded, error_kind: p.kind ?? null })),
      },
    })),
    ...(diagnosis ? { diagnosis } : {}),
  };
}

function ev(over: Partial<MistakeEvidence> = {}): MistakeEvidence {
  return { kind: 'paper', ref: 'run-1', label: 'Q3', paper: 'Prelim P1', date: '2026-09-01T02:00:00Z', clean: false, ...over };
}

function entry(over: Partial<MistakeEntry> = {}): MistakeEntry {
  return {
    airtable_student_id: SID, subject: 'A Math', title: 'Sign in Trigonometry', error_kind: 'sign', topic: 'Trigonometry',
    state: 'dark', seen_count: 1, clean_count: 0, came_back: false,
    evidence: [ev()], practice_ids: [], last_seen_at: '2026-09-01T02:00:00Z', last_clean_at: null, student_fixed_at: null,
    ...over,
  };
}

function mistake(over: Partial<Extract<Observation, { kind: 'mistake' }>> = {}): Observation {
  return {
    kind: 'mistake', title: 'Sign in Trigonometry', errorKind: 'sign', topic: 'Trigonometry', subject: 'A Math',
    evidence: ev({ ref: 'run-2', date: '2026-09-03T02:00:00Z' }), ...over,
  };
}

function clean(over: Partial<Extract<Observation, { kind: 'clean' }>> = {}): Observation {
  return {
    kind: 'clean', topic: 'Trigonometry', weight: 1,
    evidence: ev({ kind: 'attempt', ref: 'att-1', paper: null, label: 'Trigonometry', date: '2026-09-04T02:00:00Z', clean: true }),
    ...over,
  };
}

// ── titles + labels ─────────────────────────────────────────────────────────

describe('titles and labels', () => {
  it('names a kind-in-topic entry with the student word for the kind', () => {
    expect(mistakeTitle('sign', 'Trigonometry')).toBe('Sign in Trigonometry');
    expect(mistakeTitle('transfer', 'Vectors')).toBe('Copied wrongly in Vectors');
    expect(mistakeTitle('careless', '  Circles   and   tangents ')).toBe('Careless in Circles and tangents');
  });
  it('reads question numbers off the labels workers write', () => {
    expect(questionNumberOf('Q11(a)(ii)')).toBe('11');
    expect(questionNumberOf('11')).toBe('11');
    expect(questionNumberOf('q 7')).toBe('7');
    expect(questionNumberOf('(b)')).toBeNull();
    expect(questionNumberOf('?')).toBeNull();
  });
  it('builds Q-labels from a number and a part label in either style', () => {
    expect(partLabel('11', '(a)')).toBe('Q11(a)');
    expect(partLabel('11', 'a')).toBe('Q11(a)');
    expect(partLabel('11', '')).toBe('Q11');
    expect(partLabel('(b)', '')).toBe('(b)');
  });
  it('maps the practice grader tags onto the nine kinds and passes kinds through', () => {
    expect(tagToErrorKind('sign-error')).toBe('sign');
    expect(tagToErrorKind('conceptual-gap')).toBe('concept');
    expect(tagToErrorKind('method-error')).toBe('concept');
    expect(tagToErrorKind('misread-question')).toBe('misread');
    expect(tagToErrorKind('arithmetic')).toBe('arithmetic');
    expect(tagToErrorKind('nonsense')).toBeNull();
    expect(tagToErrorKind(null)).toBeNull();
  });
});

// ── entriesFromRun ──────────────────────────────────────────────────────────

describe('entriesFromRun — no diagnosis (parts with error kinds)', () => {
  const rj = run([
    { n: '1', topic: 'Surds', parts: [{ max: 3, awarded: 3 }] },
    { n: '3', topic: 'Trigonometry', parts: [{ label: '(a)', max: 2, awarded: 2 }, { label: '(b)', max: 3, awarded: 1, kind: 'sign' }] },
    { n: '7', topic: 'Trigonometry', parts: [{ max: 4, awarded: 2, kind: 'sign' }] },
    { n: '8', topic: 'Vectors', parts: [{ max: 5, awarded: 3, kind: 'concept' }, { max: 2, awarded: 1 }] },
    { n: '9', topic: null, parts: [{ max: 2, awarded: 0, kind: 'arithmetic' }] },
  ]);
  const obs = entriesFromRun(rj, 'run-1', '2026-09-01T02:00:00Z', { paperName: 'Prelim P1', subject: 'A Math' });

  it('groups lost parts by (topic, kind) into one mistake each, labelled with every part', () => {
    const mistakes = obs.filter(o => o.kind === 'mistake');
    expect(mistakes.map(m => m.title).sort()).toEqual(['Concept in Vectors', 'Marks lost in Vectors', 'Sign in Trigonometry']);
    const trig = mistakes.find(m => m.title === 'Sign in Trigonometry')!;
    expect(trig.evidence).toEqual({ kind: 'paper', ref: 'run-1', label: 'Q3(b), Q7', paper: 'Prelim P1', date: '2026-09-01T02:00:00Z', clean: false });
    expect(trig.kind === 'mistake' && trig.errorKind).toBe('sign');
    expect(trig.kind === 'mistake' && trig.topic).toBe('Trigonometry');
    expect(trig.kind === 'mistake' && trig.subject).toBe('A Math');
  });
  it('files a lost part with no kind under its topic alone ("Marks lost in …"); a question with no topic is still skipped', () => {
    const mistakes = obs.filter(o => o.kind === 'mistake');
    expect(mistakes.some(m => /arithmetic/i.test(m.title ?? ''))).toBe(false);   // Q9 has no topic
    const unclassified = mistakes.find(m => m.title === 'Marks lost in Vectors')!;   // Q8's second part: lost 1, no kind
    expect(unclassified.kind === 'mistake' && unclassified.errorKind).toBeNull();
    expect(unclassified.evidence).toMatchObject({ ref: 'run-1', label: 'Q8', clean: false });
    // the classified Vectors part keeps its own entry — the two never merge
    expect(mistakes.find(m => m.title === 'Concept in Vectors')!.evidence).toMatchObject({ label: 'Q8' });
  });
  it('emits a paper-weight clean result for every topic tested with nothing lost', () => {
    const cleans = obs.filter(o => o.kind === 'clean');
    expect(cleans).toHaveLength(1);
    expect(cleans[0]).toMatchObject({ kind: 'clean', topic: 'Surds', weight: PAPER_CLEAN_WEIGHT });
    expect(cleans[0].evidence).toMatchObject({ ref: 'run-1', clean: true, label: 'Q1', paper: 'Prelim P1' });
  });
  it('handles a run with no results at all', () => {
    expect(entriesFromRun({}, 'r', '2026-09-01T00:00:00Z')).toEqual([]);
    expect(entriesFromRun(null, 'r', '2026-09-01T00:00:00Z')).toEqual([]);
  });
});

describe('entriesFromRun — with a sheet diagnosis', () => {
  const rj = run(
    [
      { n: '6', topic: 'Similarity', parts: [{ label: '(b)', max: 3, awarded: 0, kind: 'concept' }, { label: '(c)', max: 2, awarded: 1, kind: 'careless' }] },
      { n: '4', topic: 'Graphs', parts: [{ label: '(c)', max: 2, awarded: 0, kind: 'misread' }] },
      { n: '2', topic: 'Indices', parts: [{ max: 3, awarded: 3 }] },
    ],
    {
      at: '2026-09-02T00:00:00Z', sheetJobId: 'job-1',
      skills: [
        { title: 'Using AA To Prove Two Triangles Are Similar', marks: 4, questions: ['Q6(b)', 'Q6(c)'], why: '…', tier: 'teach' },
        { title: 'Finding The Line To Draw To Solve An Equation Graphically', marks: 2, questions: ['Q4(c)'], why: '…', tier: 'teach' },
        { title: 'Laws Of Indices', marks: 0, questions: ['Q2'], why: 'fine', tier: 'show' },
      ],
    },
  );
  const obs = entriesFromRun(rj, 'run-9', '2026-09-05T01:00:00Z', { paperName: 'EM Prelim P2' });

  it('titles the mistakes by skill, reading topic + dominant kind off the questions it names', () => {
    const mistakes = obs.filter(o => o.kind === 'mistake');
    expect(mistakes.map(m => m.title)).toEqual([
      'Using AA To Prove Two Triangles Are Similar',
      'Finding The Line To Draw To Solve An Equation Graphically',
    ]);
    expect(mistakes[0]).toMatchObject({ topic: 'Similarity', errorKind: 'concept' });
    expect(mistakes[0].evidence).toMatchObject({ ref: 'run-9', label: 'Q6(b), Q6(c)', paper: 'EM Prelim P2', clean: false });
    expect(mistakes[1]).toMatchObject({ topic: 'Graphs', errorKind: 'misread' });
  });
  it('does NOT also emit the kind-in-topic entries — the sheet names the pattern', () => {
    expect(obs.some(o => o.kind === 'mistake' && /in Similarity$/.test(o.title ?? ''))).toBe(false);
  });
  it('a skill listed at 0 marks is a clean result on that title; a zero-loss topic is a clean result too', () => {
    const cleans = obs.filter(o => o.kind === 'clean');
    expect(cleans).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Laws Of Indices', weight: PAPER_CLEAN_WEIGHT }),
      expect.objectContaining({ topic: 'Indices', weight: PAPER_CLEAN_WEIGHT }),
    ]));
  });
});

// ── observationsFromAttempt ─────────────────────────────────────────────────

describe('observationsFromAttempt', () => {
  const base = { attemptId: 4471, topic: 'Trigonometry', at: '2026-09-04T02:00:00Z' };
  it('correct → one attempt-weight clean result on the topic', () => {
    const obs = observationsFromAttempt({ ...base, verdict: 'correct', tags: [] });
    expect(obs).toEqual([{
      kind: 'clean', topic: 'Trigonometry', assignmentId: null, weight: 1,
      evidence: { kind: 'attempt', ref: '4471', label: 'Trigonometry', paper: null, date: base.at, clean: true },
    }]);
  });
  it('wrong → one mistake per distinct kind among the tags', () => {
    const obs = observationsFromAttempt({ ...base, verdict: 'wrong', tags: ['sign-error', 'sign-error', 'arithmetic-slip'] });
    expect(obs.map(o => o.kind === 'mistake' && o.title)).toEqual(['Sign in Trigonometry', 'Arithmetic in Trigonometry']);
    expect(obs[0].evidence.clean).toBe(false);
  });
  it('partial counts as the mistake showing', () => {
    const obs = observationsFromAttempt({ ...base, verdict: 'partial', tags: ['rounding'] });
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ kind: 'mistake', title: 'Rounding in Trigonometry', errorKind: 'rounding' });
  });
  it('on a Practice item → ONE observation carrying the assignment id, title as the fallback', () => {
    const obs = observationsFromAttempt({ ...base, verdict: 'wrong', tags: ['conceptual-gap'], assignmentId: 'a-1' });
    expect(obs).toEqual([expect.objectContaining({ kind: 'mistake', assignmentId: 'a-1', title: 'Concept in Trigonometry', errorKind: 'concept' })]);
    const right = observationsFromAttempt({ ...base, verdict: 'correct', tags: [], assignmentId: 'a-1' });
    expect(right[0]).toMatchObject({ kind: 'clean', assignmentId: 'a-1', topic: 'Trigonometry' });
  });
  it('names nothing when there is no recognisable tag and no assignment, or no topic', () => {
    expect(observationsFromAttempt({ ...base, verdict: 'wrong', tags: ['made-up'] })).toEqual([]);
    expect(observationsFromAttempt({ ...base, topic: null, verdict: 'wrong', tags: ['sign-error'] })).toEqual([]);
    expect(observationsFromAttempt({ ...base, topic: null, verdict: 'correct', tags: [] })).toEqual([]);
  });
});

// ── applyObservation: every transition ──────────────────────────────────────

describe('applyObservation — mistakes', () => {
  it('creates a dark entry on first evidence', () => {
    const e = applyObservation(null, mistake(), NOW)!;
    expect(e).toMatchObject({ state: 'dark', seen_count: 1, clean_count: 0, came_back: false, title: 'Sign in Trigonometry', error_kind: 'sign', topic: 'Trigonometry', subject: 'A Math' });
    expect(e.evidence).toHaveLength(1);
    expect(e.last_seen_at).toBe('2026-09-03T02:00:00Z');   // the evidence date, not `now`
  });
  it('a title-less mistake (assignment-only) creates nothing', () => {
    expect(applyObservation(null, mistake({ title: null, assignmentId: 'a-1' }), NOW)).toBeNull();
  });
  it('darkens a dark entry further: seen_count++ and no came_back', () => {
    const e = applyObservation(entry(), mistake(), NOW)!;
    expect(e).toMatchObject({ state: 'dark', seen_count: 2, came_back: false });
    expect(e.evidence.map(x => x.ref)).toEqual(['run-1', 'run-2']);
  });
  it.each(['light', 'fixed', 'student_fixed'] as const)('new evidence in state %s → dark, came back, clean count reset', state => {
    const e = applyObservation(entry({ state, clean_count: 1, last_clean_at: '2026-09-02T00:00:00Z' }), mistake(), NOW)!;
    expect(e).toMatchObject({ state: 'dark', came_back: true, clean_count: 0, seen_count: 2 });
  });
  it('is idempotent on the evidence ref', () => {
    const before = entry();
    expect(applyObservation(before, mistake({ evidence: ev({ ref: 'run-1' }) }), NOW)).toBe(before);
  });
  it('fills a missing subject / kind / topic from the observation, never overwrites one', () => {
    const e = applyObservation(entry({ subject: null, error_kind: null }), mistake({ subject: 'E Math', errorKind: 'careless', topic: 'Other' }), NOW)!;
    expect(e).toMatchObject({ subject: 'E Math', error_kind: 'careless', topic: 'Trigonometry' });
  });
  it('a placeholder linked before any evidence is born dark, not "came back"', () => {
    const placeholder = entry({ seen_count: 0, evidence: [], state: 'dark', practice_ids: ['a-1'] });
    const e = applyObservation(placeholder, mistake(), NOW)!;
    expect(e).toMatchObject({ state: 'dark', seen_count: 1, came_back: false });
  });
});

describe('applyObservation — clean results', () => {
  it('one attempt right → light', () => {
    expect(applyObservation(entry(), clean(), NOW)).toMatchObject({ state: 'light', clean_count: 1, last_clean_at: '2026-09-04T02:00:00Z' });
  });
  it('a second attempt right → fixed', () => {
    const light = applyObservation(entry(), clean(), NOW)!;
    const fixed = applyObservation(light, clean({ evidence: ev({ kind: 'attempt', ref: 'att-2', clean: true }) }), NOW)!;
    expect(fixed).toMatchObject({ state: 'fixed', clean_count: 2 });
  });
  it('a clean paper counts as two: dark → fixed in one step', () => {
    const e = applyObservation(entry(), clean({ weight: PAPER_CLEAN_WEIGHT, evidence: ev({ ref: 'run-5', clean: true }) }), NOW)!;
    expect(e).toMatchObject({ state: 'fixed', clean_count: 2 });
  });
  it('student_fixed → fixed after ONE clean result of any weight', () => {
    const e = applyObservation(entry({ state: 'student_fixed', student_fixed_at: '2026-09-02T00:00:00Z' }), clean(), NOW)!;
    expect(e).toMatchObject({ state: 'fixed', clean_count: 1 });
  });
  it('reaching fixed clears the came-back tag; fixed stays fixed', () => {
    const cameBack = entry({ came_back: true });
    const light = applyObservation(cameBack, clean(), NOW)!;
    expect(light.came_back).toBe(true);
    const fixed = applyObservation(light, clean({ evidence: ev({ kind: 'attempt', ref: 'att-2', clean: true }) }), NOW)!;
    expect(fixed).toMatchObject({ state: 'fixed', came_back: false });
    const still = applyObservation(fixed, clean({ evidence: ev({ kind: 'attempt', ref: 'att-3', clean: true }) }), NOW)!;
    expect(still.state).toBe('fixed');
  });
  it('never creates an entry, and ignores a ref already recorded', () => {
    expect(applyObservation(null, clean(), NOW)).toBeNull();
    const before = entry();
    expect(applyObservation(before, clean({ evidence: ev({ ref: 'run-1', clean: true }) }), NOW)).toBe(before);
  });
});

describe('markCorrected + sweepStudentFixed', () => {
  it('dark or light → student_fixed with the timestamp; fixed and student_fixed are untouched', () => {
    expect(markCorrected(entry(), NOW)).toMatchObject({ state: 'student_fixed', student_fixed_at: NOW.toISOString() });
    expect(markCorrected(entry({ state: 'light', clean_count: 1 }), NOW).state).toBe('student_fixed');
    const fixed = entry({ state: 'fixed' });
    expect(markCorrected(fixed, NOW)).toBe(fixed);
    const sf = entry({ state: 'student_fixed', student_fixed_at: '2026-09-01T00:00:00Z' });
    expect(markCorrected(sf, NOW)).toBe(sf);
  });
  it(`fixes a "Corrected" entry after ${STUDENT_FIXED_DAYS} quiet days, not before`, () => {
    const at = new Date(NOW.getTime() - (STUDENT_FIXED_DAYS - 1) * 86400e3).toISOString();
    const young = entry({ state: 'student_fixed', student_fixed_at: at, came_back: true });
    expect(sweepStudentFixed(young, NOW)).toBe(young);
    const old = entry({ state: 'student_fixed', student_fixed_at: new Date(NOW.getTime() - STUDENT_FIXED_DAYS * 86400e3).toISOString(), came_back: true });
    expect(sweepStudentFixed(old, NOW)).toMatchObject({ state: 'fixed', came_back: false });
    const dark = entry();
    expect(sweepStudentFixed(dark, NOW)).toBe(dark);
  });
});

// ── foldObservations: targeting ─────────────────────────────────────────────

describe('foldObservations', () => {
  type Row = MistakeEntry & { id: string };
  const row = (over: Partial<MistakeEntry> & { id: string }): Row => ({ ...entry(over), ...over });

  it('creates entries stamped with the identity and reports them', () => {
    const r = foldObservations<Row>([], entriesFromRun(run([
      { n: '3', topic: 'Trigonometry', parts: [{ max: 3, awarded: 1, kind: 'sign' }] },
    ]), 'run-1', '2026-09-01T00:00:00Z'), NOW, SID);
    expect(r.created).toHaveLength(1);
    expect(r.created[0]).toMatchObject({ airtable_student_id: SID, title: 'Sign in Trigonometry', state: 'dark' });
    expect(r.updated).toEqual([]);
  });

  it('one paper darkens what it saw and cleans other entries on its clean topics — never the same entry', () => {
    const trig = row({ id: 'e1' });
    const circles = row({ id: 'e2', title: 'Concept in Circles', error_kind: 'concept', topic: 'Circles', evidence: [ev({ ref: 'run-0' })] });
    const rj = run([
      { n: '3', topic: 'Trigonometry', parts: [{ max: 3, awarded: 1, kind: 'sign' }] },
      { n: '5', topic: 'Circles', parts: [{ max: 4, awarded: 4 }] },
    ]);
    const r = foldObservations([trig, circles], entriesFromRun(rj, 'run-2', '2026-09-03T00:00:00Z'), NOW, SID);
    const byId = new Map(r.updated.map(u => [u.id, u]));
    expect(byId.get('e1')).toMatchObject({ state: 'dark', seen_count: 2 });
    expect(byId.get('e2')).toMatchObject({ state: 'fixed', clean_count: 2 });
    expect(byId.get('e1')!.evidence.filter(x => x.ref === 'run-2')).toHaveLength(1);   // darkened once, not also cleaned
  });

  it('a clean topic result reaches sheet-titled entries on that topic too', () => {
    const skill = row({ id: 'e3', title: 'Solving A Trigonometric Equation In A Double Angle', error_kind: null, topic: 'Trigonometry' });
    const r = foldObservations([skill], [clean({ weight: 2, evidence: ev({ ref: 'run-7', clean: true }) })], NOW, SID);
    expect(r.updated[0]).toMatchObject({ id: 'e3', state: 'fixed' });
  });

  it('an assignment-linked observation reaches the linked entries instead of its title', () => {
    const skill = row({ id: 'e4', title: 'Rationalising A Surd Denominator', error_kind: null, topic: 'Surds', practice_ids: ['a-1'] });
    const wrong = foldObservations([skill], observationsFromAttempt({ attemptId: 1, verdict: 'wrong', topic: 'Surds', tags: ['sign-error'], assignmentId: 'a-1', at: '2026-09-05T00:00:00Z' }), NOW, SID);
    expect(wrong.created).toEqual([]);                                            // no "Sign in Surds" born
    expect(wrong.updated[0]).toMatchObject({ id: 'e4', seen_count: 2, state: 'dark' });
    const right = foldObservations([skill], observationsFromAttempt({ attemptId: 2, verdict: 'correct', topic: 'Surds', tags: [], assignmentId: 'a-1', at: '2026-09-05T00:00:00Z' }), NOW, SID);
    expect(right.updated[0]).toMatchObject({ id: 'e4', state: 'light', clean_count: 1 });
  });

  it('falls back to the title when nothing is linked to the assignment', () => {
    const r = foldObservations<Row>([], observationsFromAttempt({ attemptId: 1, verdict: 'wrong', topic: 'Surds', tags: ['sign-error'], assignmentId: 'a-9', at: '2026-09-05T00:00:00Z' }), NOW, SID);
    expect(r.created[0]).toMatchObject({ title: 'Sign in Surds' });
  });

  it('a clean result by title reaches exactly that entry', () => {
    const a = row({ id: 'e5', title: 'Laws Of Indices', topic: 'Indices', error_kind: null });
    const b = row({ id: 'e6', title: 'Careless in Indices', topic: 'Indices', error_kind: 'careless' });
    const r = foldObservations([a, b], [clean({ topic: null, title: 'Laws Of Indices', weight: 2, evidence: ev({ ref: 'run-8', clean: true }) })], NOW, SID);
    expect(r.updated.map(u => u.id)).toEqual(['e5']);
  });

  it('re-folding the same run changes nothing (idempotent on the evidence ref)', () => {
    const rj = run([{ n: '3', topic: 'Trigonometry', parts: [{ max: 3, awarded: 1, kind: 'sign' }] }, { n: '4', topic: 'Surds', parts: [{ max: 2, awarded: 2 }] }]);
    const obs = entriesFromRun(rj, 'run-1', '2026-09-01T00:00:00Z');
    const first = foldObservations<Row>([row({ id: 'e7', title: 'Careless in Surds', topic: 'Surds', error_kind: 'careless' })], obs, NOW, SID);
    const rows = first.all.map((e, i) => ({ ...e, id: (e as Row).id ?? `new-${i}` })) as Row[];
    const again = foldObservations(rows, obs, NOW, SID);
    expect(again.created).toEqual([]);
    expect(again.updated).toEqual([]);
  });
});

// ── display ─────────────────────────────────────────────────────────────────

describe('display', () => {
  it('bands and words', () => {
    expect(bandOf('dark')).toBe('still-happening');
    expect(bandOf('light')).toBe('getting-better');
    expect(bandOf('student_fixed')).toBe('getting-better');
    expect(bandOf('fixed')).toBe('fixed');
    expect(stateLabel('dark')).toBe('Still happening');
    expect(stateLabel('student_fixed')).toBe('Getting better');
    expect(stateLabel('fixed')).toBe('Fixed');
  });
  it('orders dark newest-first, then getting better, then fixed; hides entries with no evidence', () => {
    const rows = [
      entry({ title: 'A', state: 'fixed', last_clean_at: '2026-09-05T00:00:00Z' }),
      entry({ title: 'B', state: 'dark', last_seen_at: '2026-09-01T00:00:00Z' }),
      entry({ title: 'C', state: 'dark', last_seen_at: '2026-09-04T00:00:00Z' }),
      entry({ title: 'D', state: 'light', last_clean_at: '2026-09-03T00:00:00Z' }),
      entry({ title: 'E', state: 'student_fixed', student_fixed_at: '2026-09-05T00:00:00Z' }),
      entry({ title: 'P', state: 'dark', seen_count: 0, evidence: [] }),
    ];
    const d = displayOrder(rows);
    expect(d.stillHappening.map(e => e.title)).toEqual(['C', 'B']);
    expect(d.gettingBetter.map(e => e.title)).toEqual(['E', 'D']);
    expect(d.fixed.map(e => e.title)).toEqual(['A']);
  });
  it('the sighting line names the paper, the question and the day it was seen', () => {
    const e = entry({ evidence: [ev({ ref: 'run-1', date: '2026-08-20T02:00:00Z', label: 'Q3(b), Q7' }), ev({ ref: 'run-2', date: '2026-09-01T02:00:00Z', clean: true })] });
    const seen = latestSighting(e);
    expect(seen?.ref).toBe('run-1');
    expect(sightingLine(seen)).toBe('Prelim P1 · Q3(b), Q7 · 20 Aug');
    expect(sightingLine({ kind: 'attempt', ref: '9', label: 'Surds', paper: null, date: '2026-09-04T18:00:00Z', clean: false })).toBe('Practice · Surds · 5 Sep');
    expect(sightingLine(null)).toBe('');
  });
});
