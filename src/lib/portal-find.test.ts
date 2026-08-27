import { describe, it, expect } from 'vitest';
import {
  DAILY_GENERATE_CAP,
  countGenerationsToday,
  practiceEligibility,
  parseSimilarBody,
  parseGenerateBody,
  resolveQbLevel,
  normalizeMatches,
  extractQuestionId,
  MAX_IMAGE_BASE64,
  MAX_SEARCH_TEXT,
  MAX_SEED_TEXT,
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

  it('cap is five a day', () => {
    expect(DAILY_GENERATE_CAP).toBe(5);
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
