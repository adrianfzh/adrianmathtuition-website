import { describe, it, expect } from 'vitest';
import {
  DAILY_GENERATE_CAP,
  DAILY_FIND_CAP,
  countGenerationsToday,
  countFinderCallsToday,
  practiceEligibility,
  parseSimilarBody,
  parseGenerateBody,
  resolveQbLevel,
  normalizeMatches,
  extractQuestionId,
  MAX_IMAGE_BASE64,
  MAX_SEARCH_TEXT,
  MAX_SEED_TEXT,
  parseMarksFromText,
  bankLevelSubject,
  subjectGateCandidates,
  classifyFindCandidates,
  findLevelOptions,
  resolveFindLevel,
  previewOf,
  primaryFiling,
  candidateTopic,
  FIND_TIERS,
  FIND_TIER_LABEL,
  type FindCandidate,
  type FindFiling,
  type GenerationCountingClient,
} from './portal-find';

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const UUID2 = '223e4567-e89b-42d3-a456-426614174000';

// ── Eligibility: mirror of practice_next's gates + the parts-answer widening ──
describe('practiceEligibility', () => {
  const base = { question_text: 'Solve $x^2 = 4$.', answer: 'x = ±2' };

  it('accepts a plain bank question with a top-level answer', () => {
    expect(practiceEligibility(base)).toEqual({ ok: true });
  });
  it('accepts a solution-only question (no answer field)', () => {
    expect(practiceEligibility({ question_text: 'Prove it.', solution: 'LHS = …' }).ok).toBe(true);
  });
  it('accepts an answer that lives only in parts[].answer', () => {
    const q = { question_text: 'Q', parts: [{ label: 'a', text: 'find x', answer: '3' }] };
    expect(practiceEligibility(q).ok).toBe(true);
  });
  it('accepts an answer nested in a subpart', () => {
    const q = {
      question_text: 'Q',
      parts: [{ label: 'a', text: '', subparts: [{ label: 'i', text: 'find y', answer: '7' }] }],
    };
    expect(practiceEligibility(q).ok).toBe(true);
  });
  it('rejects a question with no answer or solution anywhere', () => {
    const r = practiceEligibility({ question_text: 'Q', parts: [{ label: 'a', text: 'find x' }] });
    expect(r).toEqual({ ok: false, reason: 'no answer on file' });
  });
  it('whitespace-only answers do not count', () => {
    expect(practiceEligibility({ question_text: 'Q', answer: '  ', solution: '\n' }).ok).toBe(false);
  });
  it('rejects deleted rows', () => {
    expect(practiceEligibility({ ...base, deleted_at: '2026-01-01T00:00:00Z' }).ok).toBe(false);
  });
  it('rejects flag-buried rows (flagged_count >= 3), same bar as practice_next', () => {
    expect(practiceEligibility({ ...base, flagged_count: 3 }).ok).toBe(false);
    expect(practiceEligibility({ ...base, flagged_count: 2 }).ok).toBe(true);
  });
  it('rejects unverified AI rows, accepts verified ones', () => {
    expect(practiceEligibility({ ...base, ai_generated: true }).ok).toBe(false);
    expect(practiceEligibility({ ...base, ai_generated: true, verified: true }).ok).toBe(true);
  });
  it('rejects a row with an answer but nothing to show', () => {
    expect(practiceEligibility({ answer: '42' })).toEqual({ ok: false, reason: 'no question text' });
  });
  it('an image-only stem counts as content', () => {
    expect(practiceEligibility({ has_image: true, answer: '42' }).ok).toBe(true);
    expect(practiceEligibility({ image_url: 'fig.png', answer: '42' }).ok).toBe(true);
  });
});

// ── Cap counting: SGT day, generated=true rows only ──────────────────────────
describe('countGenerationsToday', () => {
  type Row = { airtable_student_id: string; generated: boolean; created_at: string };

  function client(rows: Row[], log: string[] = []): GenerationCountingClient {
    return {
      from(table: string) {
        log.push(`from:${table}`);
        const preds: ((r: Row) => boolean)[] = [];
        const b = {
          select: () => b,
          eq: (c: string, v: string | boolean) => {
            log.push(`${c}=${v}`);
            preds.push((r) => (r as unknown as Record<string, unknown>)[c] === v);
            return b;
          },
          gte: (c: string, v: string) => {
            log.push(`${c}>=${v}`);
            preds.push((r) => r.created_at >= v);
            return b;
          },
          then: (res: (x: { count: number | null; error: unknown }) => unknown) =>
            Promise.resolve(res({ count: rows.filter((r) => preds.every((p) => p(r))).length, error: null })),
        };
        return b as unknown as ReturnType<GenerationCountingClient['from']>;
      },
    };
  }

  const now = new Date('2026-08-28T06:00:00Z'); // 14:00 SGT → day starts 27 Aug 16:00Z

  it('counts only this student, only generated=true, only since SGT midnight', async () => {
    const rows: Row[] = [
      { airtable_student_id: 'recA', generated: true, created_at: '2026-08-27T20:00:00Z' },  // counts
      { airtable_student_id: 'recA', generated: true, created_at: '2026-08-28T05:00:00Z' },  // counts
      { airtable_student_id: 'recA', generated: false, created_at: '2026-08-28T05:30:00Z' }, // failed / bank hit
      { airtable_student_id: 'recB', generated: true, created_at: '2026-08-28T05:00:00Z' },  // someone else
      { airtable_student_id: 'recA', generated: true, created_at: '2026-08-27T10:00:00Z' },  // yesterday SGT
    ];
    expect(await countGenerationsToday(client(rows), 'recA', now)).toBe(2);
  });

  it('queries the portal_generation_log table with the SGT boundary', async () => {
    const log: string[] = [];
    await countGenerationsToday(client([], log), 'recA', now);
    expect(log).toContain('from:portal_generation_log');
    expect(log).toContain('generated=true');
    expect(log).toContain('created_at>=2026-08-27T16:00:00.000Z');
  });

  it('a null count (query error) fails open at 0, matching the submit cap', async () => {
    const broken: GenerationCountingClient = {
      from: () => ({
        select: () => {
          const b = {
            eq: () => b,
            gte: () => b,
            then: (res: (x: { count: number | null; error: unknown }) => unknown) =>
              Promise.resolve(res({ count: null, error: new Error('boom') })),
          };
          return b as never;
        },
      }),
    };
    expect(await countGenerationsToday(broken, 'recA', now)).toBe(0);
  });

  it('cap is ten a day (SPEC-PORTAL-V2 §4)', () => {
    expect(DAILY_GENERATE_CAP).toBe(10);
  });

  // ── The finder cap (/similar + the /generate attempts backstop) ────────────
  // Phase G 2026-08-28: /similar (vision extraction, model money per call) had
  // NO daily brake, and /generate's 5/day counted only successes, so failed
  // 4-gate runs were unlimited. countFinderCallsToday counts EVERY ledger row.
  it('countFinderCallsToday counts every row today — hits, misses and failures alike', async () => {
    const rows: Row[] = [
      { airtable_student_id: 'recA', generated: true, created_at: '2026-08-27T20:00:00Z' },  // counts
      { airtable_student_id: 'recA', generated: false, created_at: '2026-08-28T05:30:00Z' }, // miss/fail — counts
      { airtable_student_id: 'recB', generated: false, created_at: '2026-08-28T05:00:00Z' }, // someone else
      { airtable_student_id: 'recA', generated: false, created_at: '2026-08-27T10:00:00Z' }, // yesterday SGT
    ];
    expect(await countFinderCallsToday(client(rows), 'recA', now)).toBe(2);
  });

  it('countFinderCallsToday queries the same ledger with the SGT boundary and no generated filter', async () => {
    const log: string[] = [];
    await countFinderCallsToday(client([], log), 'recA', now);
    expect(log).toContain('from:portal_generation_log');
    expect(log).toContain('created_at>=2026-08-27T16:00:00.000Z');
    expect(log).not.toContain('generated=true');
  });

  it('finder cap fails open at 0 on a query error, and sits well above the generate cap', async () => {
    const broken: GenerationCountingClient = {
      from: () => ({
        select: () => {
          const b = {
            eq: () => b,
            gte: () => b,
            then: (res: (x: { count: number | null; error: unknown }) => unknown) =>
              Promise.resolve(res({ count: null, error: new Error('boom') })),
          };
          return b as never;
        },
      }),
    };
    expect(await countFinderCallsToday(broken, 'recA', now)).toBe(0);
    expect(DAILY_FIND_CAP).toBe(25);
    expect(DAILY_FIND_CAP).toBeGreaterThan(DAILY_GENERATE_CAP);
  });
});

// ── Request validation ───────────────────────────────────────────────────────
describe('parseSimilarBody', () => {
  it('accepts a bare-base64 photo', () => {
    const r = parseSimilarBody({ imageBase64: 'abc123', level: 'AM' });
    expect(r).toEqual({ ok: true, value: { mode: 'photo', imageBase64: 'abc123', level: 'AM' } });
  });
  it('strips a data-URL prefix', () => {
    const r = parseSimilarBody({ imageBase64: 'data:image/jpeg;base64,xyz' });
    expect(r.ok && r.value.mode === 'photo' && r.value.imageBase64).toBe('xyz');
  });
  it('rejects an oversized photo with 413', () => {
    const r = parseSimilarBody({ imageBase64: 'a'.repeat(MAX_IMAGE_BASE64 + 1) });
    expect(!r.ok && r.status).toBe(413);
  });
  it('accepts a text search and trims/caps it', () => {
    const r = parseSimilarBody({ text: `  quadratic inequality ${'x'.repeat(MAX_SEARCH_TEXT)}` });
    expect(r.ok && r.value.mode === 'search' && r.value.text.length).toBe(MAX_SEARCH_TEXT);
  });
  it('rejects both photo and text together', () => {
    expect(parseSimilarBody({ imageBase64: 'a', text: 'b' }).ok).toBe(false);
  });
  it('rejects neither, empty text, and non-object bodies with 400', () => {
    for (const bad of [{}, { text: '   ' }, null, 'nope', { imageBase64: 'data:image/jpeg;base64,' }]) {
      const r = parseSimilarBody(bad);
      expect(!r.ok && r.status).toBe(400);
    }
  });
});

describe('parseGenerateBody', () => {
  it('requires seedText', () => {
    expect(parseGenerateBody({}).ok).toBe(false);
    expect(parseGenerateBody({ seedText: '   ' }).ok).toBe(false);
  });
  it('caps seedText and normalises kind', () => {
    const r = parseGenerateBody({ seedText: 'q'.repeat(MAX_SEED_TEXT + 50), kind: 'photo', level: 'EM' });
    expect(r.ok && r.value.seedText.length).toBe(MAX_SEED_TEXT);
    expect(r.ok && r.value.kind).toBe('photo');
  });
  it('unknown kind falls back to search; topic optional', () => {
    const r = parseGenerateBody({ seedText: 'solve x', kind: 'weird' });
    expect(r.ok && r.value.kind).toBe('search');
    expect(r.ok && r.value.topic).toBeNull();
  });
  it('findLogId survives only as a uuid', () => {
    const withId = parseGenerateBody({ seedText: 'solve x', findLogId: UUID });
    expect(withId.ok && withId.value.findLogId).toBe(UUID);
    const junk = parseGenerateBody({ seedText: 'solve x', findLogId: 'row-1' });
    expect(junk.ok && junk.value.findLogId).toBeNull();
  });
  it('keeps a real topic', () => {
    const r = parseGenerateBody({ seedText: 'solve x', topic: ' Quadratic Equations ' });
    expect(r.ok && r.value.topic).toBe('Quadratic Equations');
  });
});

// ── Level resolution: the account gates, the client only picks within it ─────
describe('resolveQbLevel', () => {
  it('keeps the requested level when the account unlocks it', () => {
    expect(resolveQbLevel('AM', 'Sec 4', ['E Math', 'A Math'])).toBe('AM');
  });
  it('falls back to the first allowed level when the request is not unlocked', () => {
    expect(resolveQbLevel('JC2', 'Sec 4', ['E Math', 'A Math'])).toBe('EM');
  });
  it('no request → first allowed level', () => {
    expect(resolveQbLevel(null, 'JC2', ['H2 Math'])).toBe('JC2');
    expect(resolveQbLevel(undefined, 'Sec 1', null)).toBe('S1');
  });
});

// ── Bot response normalisation ───────────────────────────────────────────────
describe('normalizeMatches', () => {
  it('keeps well-formed matches and maps total_marks', () => {
    const out = normalizeMatches([
      { id: UUID, preview: 'Solve $x^2=4$', topics: ['Quadratic Equations'], total_marks: 4 },
    ]);
    expect(out).toEqual([{ id: UUID, preview: 'Solve $x^2=4$', topics: ['Quadratic Equations'], totalMarks: 4 }]);
  });
  it('drops entries without a real uuid or preview; non-arrays → []', () => {
    expect(normalizeMatches([{ id: 'not-a-uuid', preview: 'x' }, { id: UUID, preview: '' }, 'junk'])).toEqual([]);
    expect(normalizeMatches({ id: UUID })).toEqual([]);
    expect(normalizeMatches(undefined)).toEqual([]);
  });
  it('caps at 5 matches and 3 topics, zero marks → null', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: UUID.replace('123e', `${i}23e`),
      preview: 'q',
      topics: ['a', 'b', 'c', 'd'],
      total_marks: 0,
    }));
    const out = normalizeMatches(many);
    expect(out).toHaveLength(5);
    expect(out[0].topics).toEqual(['a', 'b', 'c']);
    expect(out[0].totalMarks).toBeNull();
  });
});

describe('extractQuestionId', () => {
  it('finds the id under any of the contract spellings', () => {
    expect(extractQuestionId({ questionId: UUID })).toBe(UUID);
    expect(extractQuestionId({ question_id: UUID })).toBe(UUID);
    expect(extractQuestionId({ id: UUID })).toBe(UUID);
    expect(extractQuestionId({ question: { id: UUID2 } })).toBe(UUID2);
  });
  it('rejects non-uuids and junk shapes', () => {
    expect(extractQuestionId({ questionId: 'DROP TABLE' })).toBeNull();
    expect(extractQuestionId({})).toBeNull();
    expect(extractQuestionId(null)).toBeNull();
    expect(extractQuestionId('id')).toBeNull();
  });
});

// ── Find a question: the tier rule (SPEC-PORTAL-V2 §4) ───────────────────────
describe('parseMarksFromText', () => {
  it('sums bracketed part marks', () => {
    expect(parseMarksFromText('Find x. [2] Hence find y. [3]')).toBe(5);
    expect(parseMarksFromText('Solve the equation. [ 4 ]')).toBe(4);
  });
  it('reads "(4 marks)" / "4 marks" when there are no brackets', () => {
    expect(parseMarksFromText('Solve … (4 marks)')).toBe(4);
    expect(parseMarksFromText('Total 6 Marks')).toBe(6);
  });
  it('null when nothing is printed, zero, a whole page (>20), or no text', () => {
    expect(parseMarksFromText('Solve x^2 = 4')).toBeNull();
    expect(parseMarksFromText('[0]')).toBeNull();
    expect(parseMarksFromText('[8] [8] [8]')).toBeNull();
    expect(parseMarksFromText(null)).toBeNull();
    expect(parseMarksFromText('')).toBeNull();
  });
});

describe('bankLevelSubject + subjectGateCandidates', () => {
  it('maps every bank level variant onto the three subjects; Sec 1–2 sit in the O-Level family', () => {
    expect(bankLevelSubject('AM')).toBe('A Math');
    expect(bankLevelSubject('S3_AM')).toBe('A Math');
    expect(bankLevelSubject('AM_NA')).toBe('A Math');
    expect(bankLevelSubject('EM')).toBe('E Math');
    expect(bankLevelSubject('S3_EM_NT')).toBe('E Math');
    expect(bankLevelSubject('S1')).toBe('E Math');
    expect(bankLevelSubject('S2')).toBe('E Math');
    expect(bankLevelSubject('JC1')).toBe('H2 Math');
    expect(bankLevelSubject('JC2_H1')).toBe('H2 Math');
    expect(bankLevelSubject('IB')).toBeNull();
    expect(bankLevelSubject(null)).toBeNull();
  });
  it('drops candidates outside the student’s subjects, keeps the order of the rest', () => {
    const { kept, dropped } = subjectGateCandidates(
      [{ id: 'a', level: 'AM' }, { id: 'b', level: 'EM' }, { id: 'c', level: 'JC2' }, { id: 'd', level: null }],
      ['E Math'],
    );
    expect(kept.map((k) => k.id)).toEqual(['b']);
    expect(dropped.map((d) => d.id)).toEqual(['a', 'c', 'd']);
    expect(dropped[0].reason).toMatch(/A Math/);
    expect(dropped[2].reason).toMatch(/unknown bank level/);
  });
});

const TAN: FindFiling = { id: 1, topic: 'Circles', name: 'Tangent at a Point on the Circle', primary: true };
const GEN: FindFiling = { id: 2, topic: 'Circles', name: 'Standard and general form of a circle', primary: true };
const CHORD: FindFiling = { id: 3, topic: 'Circles', name: 'Chords and where a line cuts a circle', primary: true };
const AREA: FindFiling = { id: 9, topic: 'Coordinate Geometry', name: 'Area of polygon / shoelace / triangle', primary: true };

function cand(id: string, filings: FindFiling[], o: Partial<FindCandidate> = {}): FindCandidate {
  return { id, preview: 'q', level: 'AM', topics: ['Circles'], marks: 4, filings, ...o };
}

describe('classifyFindCandidates — the tier rule', () => {
  it('two candidates sharing a sub-skill are similar; the other sub-skill is rejected with its reason', () => {
    const r = classifyFindCandidates([cand('a', [TAN]), cand('b', [GEN]), cand('c', [TAN])]);
    expect(r.similar.map((c) => c.id)).toEqual(['a', 'c']);
    expect(r.reference).toMatchObject({ subgroupId: 1, subgroupName: TAN.name, topic: 'Circles', marks: 4, marksFrom: 'anchor' });
    const b = r.verdicts.find((v) => v.id === 'b')!;
    expect(b.tier).toBeNull();
    expect(b.reason).toMatch(/different sub-skill/);
    expect(r.verdicts[0].reason).toMatch(/shares “Tangent at a Point on the Circle” \(Circles\) with 1 other match$/);
  });
  it('one candidate alone is never similar — the sub-skill needs corroboration', () => {
    const r = classifyFindCandidates([cand('a', [TAN])]);
    expect(r.similar).toEqual([]);
    expect(r.verdicts[0].reason).toMatch(/corroboration/);
    expect(r.reference.subgroupId).toBe(1);
  });
  it('three different sub-skills of one topic → nothing similar (same chapter is not enough)', () => {
    const r = classifyFindCandidates([cand('a', [TAN]), cand('b', [GEN]), cand('c', [CHORD])]);
    expect(r.similar).toEqual([]);
    expect(r.verdicts.every((v) => v.tier === null)).toBe(true);
  });
  it('unfiled candidates are rejected and cannot vote', () => {
    const r = classifyFindCandidates([cand('a', []), cand('b', [])]);
    expect(r.similar).toEqual([]);
    expect(r.verdicts.every((v) => /not filed/.test(v.reason))).toBe(true);
    expect(r.reference.subgroupId).toBeNull();
  });
  it('marks: the student’s printed marks are the reference; more than one apart is rejected', () => {
    const r = classifyFindCandidates(
      [cand('a', [TAN], { marks: 4 }), cand('b', [TAN], { marks: 7 }), cand('c', [TAN], { marks: 5 })],
      { studentMarks: 5 },
    );
    expect(r.similar.map((c) => c.id)).toEqual(['a', 'c']);
    expect(r.reference).toMatchObject({ marks: 5, marksFrom: 'student' });
    expect(r.verdicts[1].reason).toMatch(/7 marks vs 5/);
  });
  it('marks: without printed marks the top-ranked member anchors; unknown bank marks are rejected', () => {
    const r = classifyFindCandidates([cand('a', [TAN], { marks: 6 }), cand('b', [TAN], { marks: null }), cand('c', [TAN], { marks: 4 })]);
    expect(r.similar.map((c) => c.id)).toEqual(['a']);
    expect(r.reference).toMatchObject({ marks: 6, marksFrom: 'anchor' });
    expect(r.verdicts[1].reason).toMatch(/marks unknown/);
    expect(r.verdicts[2].reason).toMatch(/4 marks vs 6/);
  });
  it('no marks anywhere → the marks check is skipped', () => {
    const r = classifyFindCandidates([cand('a', [TAN], { marks: null }), cand('b', [TAN], { marks: null })]);
    expect(r.similar.map((c) => c.id)).toEqual(['a', 'b']);
    expect(r.reference.marksFrom).toBeNull();
  });
  it('a secondary filing counts only when the question is tagged with that topic', () => {
    const passing = cand('b', [AREA, { ...TAN, primary: false }], { topics: ['Coordinate Geometry'] });
    const tagged = cand('c', [AREA, { ...TAN, primary: false }], { topics: ['Coordinate Geometry', 'Circles'] });
    const r = classifyFindCandidates([cand('a', [TAN]), passing, tagged]);
    expect(r.reference.subgroupId).toBe(1);
    expect(r.similar.map((c) => c.id)).toEqual(['a', 'c']);
    expect(r.verdicts[1].reason).toMatch(/in passing/);
  });
  it('a tie between sub-skills goes to the one seen first in bot order', () => {
    const r = classifyFindCandidates([cand('a', [GEN]), cand('b', [TAN]), cand('c', [TAN]), cand('d', [GEN])]);
    expect(r.reference.subgroupId).toBe(2);
    expect(r.similar.map((c) => c.id)).toEqual(['a', 'd']);
  });
  it('never emits a tier other than similar; the two tiers and their labels are fixed', () => {
    const r = classifyFindCandidates([cand('a', [TAN]), cand('b', [GEN])]);
    for (const v of r.verdicts) expect([null, 'similar']).toContain(v.tier);
    expect(FIND_TIERS).toEqual(['similar', 'made-for-you']);
    expect(FIND_TIER_LABEL.similar).toBe('Similar question');
    expect(FIND_TIER_LABEL['made-for-you']).toBe('Made for you');
  });
  it('empty pool → empty result', () => {
    expect(classifyFindCandidates([])).toEqual({
      similar: [], verdicts: [],
      reference: { subgroupId: null, subgroupName: null, topic: null, marks: null, marksFrom: null },
    });
  });
});

describe('primaryFiling / candidateTopic', () => {
  it('two primary filings → the one matching the row’s own topic tag wins the headline', () => {
    const c = cand('a', [AREA, TAN], { topics: ['Circles', 'Coordinate Geometry'] });
    expect(primaryFiling(c)).toBe(TAN);
    expect(candidateTopic(c)).toBe('Circles');
  });
  it('no primary → first filing; no filing → first tag; nothing → null', () => {
    expect(primaryFiling(cand('a', [{ ...GEN, primary: false }, { ...TAN, primary: false }]))).toEqual({ ...GEN, primary: false });
    expect(candidateTopic(cand('a', [], { topics: ['Vectors'] }))).toBe('Vectors');
    expect(candidateTopic(cand('a', [], { topics: [] }))).toBeNull();
  });
});

describe('findLevelOptions / resolveFindLevel', () => {
  it('Sec 4 with both subjects → E Math + A Math; E Math only → E Math; A Math only → A Math', () => {
    expect(findLevelOptions({ level: 'Sec 4', subjects: ['E Math', 'A Math'] })).toEqual([{ key: 'EM', label: 'E Math' }, { key: 'AM', label: 'A Math' }]);
    expect(findLevelOptions({ level: 'Sec 4', subjects: ['E Math'] })).toEqual([{ key: 'EM', label: 'E Math' }]);
    expect(findLevelOptions({ level: 'Sec 4', subjects: ['A Math'] })).toEqual([{ key: 'AM', label: 'A Math' }]);
  });
  it('Sec 3 collapses the S3_* and Sec 4 keys onto the two families', () => {
    expect(findLevelOptions({ level: 'Sec 3', subjects: ['E Math', 'A Math'] }).map((o) => o.key)).toEqual(['EM', 'AM']);
  });
  it('JC → H2 only; Sec 1 → Sec 1; an account with no subjects listed keeps its level family', () => {
    expect(findLevelOptions({ level: 'JC2', subjects: ['H2 Math'] })).toEqual([{ key: 'JC', label: 'H2 Math' }]);
    expect(findLevelOptions({ level: 'Sec 1', subjects: ['Math'] })).toEqual([{ key: 'S1', label: 'Sec 1' }]);
    expect(findLevelOptions({ level: 'Sec 4', subjects: null }).map((o) => o.key)).toEqual(['EM', 'AM']);
  });
  it('resolveFindLevel keeps a valid pick, else the first option', () => {
    const acct = { level: 'Sec 4', subjects: ['E Math', 'A Math'] };
    expect(resolveFindLevel('AM', acct)).toBe('AM');
    expect(resolveFindLevel('JC', acct)).toBe('EM');
    expect(resolveFindLevel(null, acct)).toBe('EM');
  });
});

describe('previewOf', () => {
  it('stem + part texts with labels, never answers, capped with an ellipsis', () => {
    expect(previewOf({
      question_text: 'Given f(x).',
      parts: [{ label: 'a', text: 'Find f(2).', answer: '7' }, { label: 'b', text: '', subparts: [{ label: 'i', text: 'Show it.' }] }],
    })).toBe('Given f(x). (a) Find f(2). (i) Show it.');
    expect(previewOf({ question_text: 'x'.repeat(300) }).length).toBe(201);
    expect(previewOf({ question_text: null, parts: 'junk' })).toBe('');
  });
});
