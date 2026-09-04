import { describe, it, expect } from 'vitest';
import {
  replaceSolutionImageRefs,
  replaceSolutionImageRefsMany,
  repairPairsFor,
  verifyRefPairs,
  containsImageRef,
  partLabelFor,
  imageKey,
  sanitisePartSlug,
  cleanedObjectKey,
} from './solution-image-apply';

const OLD = 'sol_bb91e8165dd64296a7f3e137adc48866.png';
const FULL = `https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/${OLD}`;
const NEW = 'https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/solutions/cleaned/abc-b-12345678.png';

describe('imageKey — the three spellings that occur in the bank collapse to one', () => {
  it('bare filename, bucket-prefixed and full URL are the same key', () => {
    expect(imageKey(OLD)).toBe(OLD);
    expect(imageKey(`question_images/${OLD}`)).toBe(OLD);
    expect(imageKey(FULL)).toBe(OLD);
  });
});

describe('replaceSolutionImageRefs', () => {
  it('swaps a question-level solution_images entry stored bucket-prefixed', () => {
    const row = { solution_images: [`question_images/${OLD}`], parts: null };
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    expect(r.replaced).toBe(1);
    expect(r.fields).toEqual(['solution_images[0]']);
    expect(r.row.solution_images).toEqual([NEW]);
    // parts was null — it must not appear in the PATCH body at all
    expect('parts' in r.row).toBe(false);
  });

  it('swaps a solution_images entry stored as a FULL public URL', () => {
    const row = { solution_images: ['question_images/other.png', FULL] };
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    expect(r.replaced).toBe(1);
    expect(r.fields).toEqual(['solution_images[1]']);
    expect(r.row.solution_images).toEqual(['question_images/other.png', NEW]);
  });

  it('finds the flag by its BARE path even when the row stores the full URL', () => {
    const row = { parts: [{ label: '(b)', solution_image: FULL }] };
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    expect(r.replaced).toBe(1);
    expect(r.row.parts).toEqual([{ label: '(b)', solution_image: NEW }]);
  });

  it('reaches parts[].subparts[].solution_image — sub-parts are a real level', () => {
    const row = {
      parts: [
        { label: 'a', solution: 'no image here' },
        {
          label: 'b',
          solution_image: `question_images/${OLD}`,
          subparts: [
            { label: 'i', solution: 'text' },
            { label: 'ii', solution_image: FULL },
          ],
        },
      ],
    };
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    // ONE new object, referenced twice — both references must move
    expect(r.replaced).toBe(2);
    expect(r.fields).toEqual(['parts[1].solution_image', 'parts[1].subparts[1].solution_image']);
    const parts = r.row.parts as Array<Record<string, unknown>>;
    expect(parts[1].solution_image).toBe(NEW);
    expect((parts[1].subparts as Array<Record<string, unknown>>)[1].solution_image).toBe(NEW);
  });

  it('rewrites an inline {{IMG:…}} ref inside solution text and leaves the prose alone', () => {
    const row = { solution: `Plot the points.\n{{IMG:${OLD}}}\nThen read off $y$.` };
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    expect(r.replaced).toBe(1);
    expect(r.fields).toEqual(['solution']);
    expect(r.row.solution).toBe(`Plot the points.\n{{IMG:${NEW}}}\nThen read off $y$.`);
  });

  it('leaves every unrelated field byte-identical', () => {
    const row = {
      parts: [{ label: '(a)', marks: 3, answer: '$h = 2.22$', solution: 'working', solution_image: OLD }],
      solution_images: null,
    };
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    expect(r.row.parts).toEqual([
      { label: '(a)', marks: 3, answer: '$h = 2.22$', solution: 'working', solution_image: NEW },
    ]);
  });

  it('replaces nothing (and PATCHes nothing) when the key is absent', () => {
    const row = { parts: [{ label: 'a', solution_image: 'sol_someone_else.png' }], solution_images: [] };
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    expect(r.replaced).toBe(0);
    expect(r.fields).toEqual([]);
    expect(r.row).toEqual({});
  });

  it('an empty old path is a no-op, never a wildcard', () => {
    const row = { parts: [{ solution_image: OLD }] };
    expect(replaceSolutionImageRefs(row, '', NEW).replaced).toBe(0);
  });
});

describe('containsImageRef — the absence proof', () => {
  it('is true before the swap and false after it', () => {
    const row = { parts: [{ label: 'b', solution_image: FULL }], solution_images: [`question_images/${OLD}`] };
    expect(containsImageRef(row, OLD)).toBe(true);
    const r = replaceSolutionImageRefs(row, OLD, NEW);
    expect(containsImageRef({ ...row, ...r.row }, OLD)).toBe(false);
  });

  it('catches a survivor the field-name walk would miss (a stray mention in prose)', () => {
    const row = { parts: [{ solution_image: NEW }], solution: `see ${OLD} for the original` };
    expect(containsImageRef(row, OLD)).toBe(true);
  });

  it('is not fooled by the new cleaned object, which shares no key', () => {
    expect(containsImageRef({ solution_images: [NEW] }, OLD)).toBe(false);
  });
});

describe('partLabelFor', () => {
  it('names a sub-part as (b)(ii)', () => {
    const row = {
      parts: [
        { label: '(a)' },
        { label: 'b', subparts: [{ label: 'i' }, { label: 'ii', solution_image: FULL }] },
      ],
    };
    expect(partLabelFor(row, OLD)).toBe('(b)(ii)');
  });

  it('names a part as (b), and prefers the part label over solution_images', () => {
    const row = {
      parts: [{ label: '(b)', solution_image: OLD }],
      solution_images: [`question_images/${OLD}`],
    };
    expect(partLabelFor(row, OLD)).toBe('(b)');
  });

  it('falls back to solution_images[0] for a question-level image', () => {
    const row = { parts: [{ label: 'a' }], solution_images: [FULL] };
    expect(partLabelFor(row, OLD)).toBe('solution_images[0]');
  });

  it('names an inline solution ref', () => {
    expect(partLabelFor({ solution: `{{IMG:${OLD}}}` }, OLD)).toBe('solution');
  });

  it('returns null when the image is nowhere in the row', () => {
    expect(partLabelFor({ parts: [{ label: 'a' }] }, OLD)).toBeNull();
  });

  it('uses a positional fallback for an unlabelled part', () => {
    expect(partLabelFor({ parts: [{}, { solution_image: OLD }] }, OLD)).toBe('parts[1]');
  });
});

describe('the new object key mirrors apply.py', () => {
  it('sanitises the part label the way apply.py does', () => {
    expect(sanitisePartSlug('(b)(ii)')).toBe('b-ii');
    expect(sanitisePartSlug('solution_images[0]')).toBe('solution-images-0');
    expect(sanitisePartSlug(null)).toBe('x');
    expect(sanitisePartSlug('---')).toBe('x');
  });

  it('builds solutions/cleaned/<qid>-<part>-<sha8>.png', () => {
    expect(cleanedObjectKey('7b86d1b0-c8b3-4f29-8327-027f1ec1d818', '(b)', 'deadbeef'))
      .toBe('solutions/cleaned/7b86d1b0-c8b3-4f29-8327-027f1ec1d818-b-deadbeef.png');
    expect(cleanedObjectKey('q1', null, 'abc12345', 'jpg')).toBe('solutions/cleaned/q1-x-abc12345.jpg');
  });
});

/* ── the guarded write (the cand #59 lost update) ───────────────────────────
 * On 3 Sep 2026 two applies on Anglican High 2023 AM P1 Q15 landed 0.48 s
 * apart; the second read `parts` before the first wrote it and PATCHed a stale
 * array back, so the question returned to the STAMPED path while its flag said
 * 'fixed' and the render gate stopped hiding it. These cover the three pieces
 * that stop it: many-pair writes, the repair scan, and a verify that proves
 * EVERY pair rather than only the one this apply wrote. */
const OLD2 = 'sol_11112222333344445555666677778888.png';
const NEW2 = 'https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/solutions/cleaned/abc-a-87654321.png';
const toUrl = (k: string) => `https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/${k}`;

describe('replaceSolutionImageRefsMany', () => {
  it('applies two pairs in ONE body — both parts entries land together', () => {
    const row = { parts: [{ label: '(a)', solution_image: OLD2 }, { label: '(b)', solution_image: OLD }] };
    const r = replaceSolutionImageRefsMany(row, [
      { oldPath: OLD, newUrl: NEW },
      { oldPath: OLD2, newUrl: NEW2 },
    ]);
    expect(r.replaced).toBe(2);
    expect(r.row.parts).toEqual([
      { label: '(a)', solution_image: NEW2 },
      { label: '(b)', solution_image: NEW },
    ]);
    // per-pair bookkeeping: the caller logs its OWN pair, not the repair's
    expect(r.pairs[0]).toMatchObject({ oldPath: OLD, replaced: 1, fields: ['parts[1].solution_image'] });
    expect(r.pairs[1]).toMatchObject({ oldPath: OLD2, replaced: 1, fields: ['parts[0].solution_image'] });
  });

  it('reports a pair that matched nothing without failing the others', () => {
    const row = { solution_images: [OLD] };
    const r = replaceSolutionImageRefsMany(row, [
      { oldPath: OLD, newUrl: NEW },
      { oldPath: 'sol_absent.png', newUrl: NEW2 },
    ]);
    expect(r.pairs[0].replaced).toBe(1);
    expect(r.pairs[1].replaced).toBe(0);
    expect(r.row.solution_images).toEqual([NEW]);
  });

  it('touches no column when no pair matches — an empty PATCH body', () => {
    const r = replaceSolutionImageRefsMany({ parts: [{ solution_image: 'sol_other.png' }] },
      [{ oldPath: OLD, newUrl: NEW }]);
    expect(r.replaced).toBe(0);
    expect(Object.keys(r.row)).toEqual([]);
  });
});

describe('repairPairsFor — carrying a clobbered apply along', () => {
  const log = [{ id: 4013, old_path: OLD2, new_path: `question_images/${imageKey(NEW2)}` }];

  it('spots the clobber: the cleaned object gone, the stamped path live again', () => {
    const clobbered = { parts: [{ label: '(a)', solution_image: OLD2 }, { label: '(b)', solution_image: OLD }] };
    const r = repairPairsFor(clobbered, log, toUrl, OLD);
    expect(r.pairs).toEqual([{ oldPath: OLD2, newUrl: NEW2 }]);
    expect(r.notes[0]).toContain('repairing clobbered log #4013');
  });

  it('says nothing when the earlier apply is intact', () => {
    const intact = { parts: [{ solution_image: NEW2 }, { solution_image: OLD }] };
    expect(repairPairsFor(intact, log, toUrl, OLD)).toEqual({ pairs: [], notes: [] });
  });

  it('never repairs the pair this apply is writing itself', () => {
    const row = { parts: [{ solution_image: OLD }] };
    const ownLog = [{ id: 9, old_path: OLD, new_path: `question_images/${imageKey(NEW)}` }];
    expect(repairPairsFor(row, ownLog, toUrl, OLD).pairs).toEqual([]);
  });

  it('leaves an apply alone (and says so) when NEITHER path is in the row', () => {
    const r = repairPairsFor({ parts: [{ solution_image: OLD }] }, log, toUrl, OLD);
    expect(r.pairs).toEqual([]);
    expect(r.notes[0]).toContain('LEFT ALONE');
  });
});

describe('verifyRefPairs — the check the lost update slipped through', () => {
  const pairs = [{ oldPath: OLD, newUrl: NEW }, { oldPath: OLD2, newUrl: NEW2 }];

  it('passes only when every pair holds in the whole row', () => {
    expect(verifyRefPairs({ parts: [{ solution_image: NEW2 }, { solution_image: NEW }] }, pairs)).toEqual([]);
  });

  it('fails on the OTHER pair — the exact miss that served a stamped image', () => {
    // this apply's own path is gone and its object is live, so the old
    // single-pair verify would have passed; the earlier apply was clobbered.
    const problems = verifyRefPairs({ parts: [{ solution_image: OLD2 }, { solution_image: NEW }] }, pairs);
    expect(problems).toEqual([`old key still live: ${OLD2}`, `new object absent: ${imageKey(NEW2)}`]);
  });

  it('fails when the new object never landed in the row', () => {
    expect(verifyRefPairs({ parts: [{ solution_image: NEW2 }] }, pairs))
      .toEqual([`new object absent: ${imageKey(NEW)}`]);
  });
});
