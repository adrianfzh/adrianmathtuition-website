import { describe, it, expect } from 'vitest';
import { flattenExamTopics, parseExtractionResponse } from './exam-topic-extract';

describe('flattenExamTopics', () => {
  it('JC levels get the JC list', () => {
    const jc = flattenExamTopics('JC1', 'H2 Math');
    expect(jc).toContain('APGP');
    expect(jc).toContain('Series and Sequences');
    expect(jc).toContain('Distributions (Normal)');
  });

  it('Sec 4 E Math cascades down to S2/S1 without duplicates', () => {
    const em = flattenExamTopics('Sec 4', 'E Math');
    expect(em.length).toBe(new Set(em).size); // deduped
    expect(em.some(t => /trigonometry/i.test(t))).toBe(true);
  });

  it('empty inputs still return a non-empty list (defaults)', () => {
    expect(flattenExamTopics('', '').length).toBeGreaterThan(0);
  });
});

describe('parseExtractionResponse', () => {
  const canonical = ['APGP', 'Series and Sequences', 'Vectors', 'Integration (Techniques)'];

  it('maps case-insensitively onto canonical casing and drops unknowns', () => {
    const out = parseExtractionResponse(
      '{"topics": ["apgp", "VECTORS", "Sampling Badgers"], "examDate": null, "note": null}',
      canonical
    );
    expect(out.topics).toEqual(['APGP', 'Vectors']);
    expect(out.examDate).toBeNull();
    expect(out.note).toBeNull();
  });

  it('tolerates markdown fences and surrounding prose', () => {
    const out = parseExtractionResponse(
      'Here you go:\n```json\n{"topics": ["Integration (Techniques)"], "examDate": "2026-10-02", "note": "Until 10.1.6 only"}\n```',
      canonical
    );
    expect(out.topics).toEqual(['Integration (Techniques)']);
    expect(out.examDate).toBe('2026-10-02');
    expect(out.note).toBe('Until 10.1.6 only');
  });

  it('dedupes repeated topics', () => {
    const out = parseExtractionResponse('{"topics": ["APGP", "apgp ", "APGP"]}', canonical);
    expect(out.topics).toEqual(['APGP']);
  });

  it('rejects malformed dates and blank notes', () => {
    const out = parseExtractionResponse(
      '{"topics": [], "examDate": "2 Oct 2026", "note": "   "}',
      canonical
    );
    expect(out.examDate).toBeNull();
    expect(out.note).toBeNull();
  });

  it('caps runaway notes at 200 chars', () => {
    const out = parseExtractionResponse(`{"topics": [], "note": "${'x'.repeat(500)}"}`, canonical);
    expect(out.note?.length).toBe(200);
  });

  it('non-array topics field yields empty topics', () => {
    const out = parseExtractionResponse('{"topics": "APGP"}', canonical);
    expect(out.topics).toEqual([]);
  });

  it('throws when there is no JSON object at all', () => {
    expect(() => parseExtractionResponse('sorry, cannot read this photo', canonical)).toThrow();
  });
});
