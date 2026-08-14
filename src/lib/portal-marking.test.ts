import { describe, it, expect } from 'vitest';
import { buildStudentMarking, type MarkingRunRow } from './portal-marking';

// Minimal shape of one entry in result_json.results[], matching what the bot's
// paper-marker writes and what mark-triage.ts reads.
function q(opts: {
  n: string;
  awarded: number;
  max: number;
  topic?: string;
  comment?: string;
  parts?: { label: string; awarded: number; max: number; error_summary?: string | null }[];
  flagged?: boolean;
  confidence?: string;
}) {
  return {
    question_number: opts.n,
    review_recommended: opts.flagged ?? false,
    match_confidence: opts.confidence ?? 'high',
    marking: {
      total_awarded: opts.awarded,
      total_max: opts.max,
      marking_confidence: opts.confidence ?? 'high',
      overall_comment: opts.comment ?? '',
      parts: opts.parts ?? [],
    },
    marking_output: { meta: { topic_detected: opts.topic ?? null } },
  };
}

function run(over: Partial<MarkingRunRow> & { id: string }): MarkingRunRow {
  return {
    created_at: '2026-08-01T02:00:00.000Z',
    paper_name: 'Paper',
    total_awarded: null,
    total_max: null,
    annotated_pdf_url: null,
    pdf_url: null,
    released_at: '2026-08-01T09:00:00.000Z',
    result_json: { results: [] },
    ...over,
  };
}

describe('buildStudentMarking — the release gate', () => {
  it('drops unreleased runs even when the caller passes them in', () => {
    const out = buildStudentMarking([
      run({ id: 'a', released_at: null, result_json: { results: [q({ n: '1', awarded: 2, max: 5 })] } }),
      run({ id: 'b', result_json: { results: [q({ n: '1', awarded: 4, max: 5 })] } }),
    ]);
    expect(out.papers.map(p => p.id)).toEqual(['b']);
  });

  it('returns an empty view when nothing has been released', () => {
    const out = buildStudentMarking([run({ id: 'a', released_at: null })]);
    expect(out).toEqual({ papers: [], averagePct: null, trendPts: null, focus: [] });
  });

  it('drops runs that never produced results (failed or still queued)', () => {
    const out = buildStudentMarking([run({ id: 'a', result_json: { status: 'queued' } })]);
    expect(out.papers).toEqual([]);
  });
});

describe('buildStudentMarking — scores', () => {
  it('prefers the stored totals, so a triage override is what the student sees', () => {
    // result_json still carries the AI's original 2/5; the row carries Adrian's
    // corrected 5/5 (mark-triage writes both on override).
    const out = buildStudentMarking([
      run({
        id: 'a',
        total_awarded: 5,
        total_max: 5,
        result_json: { results: [q({ n: '1', awarded: 2, max: 5 })] },
      }),
    ]);
    expect(out.papers[0].awarded).toBe(5);
    expect(out.papers[0].pct).toBe(100);
  });

  it('recomputes totals when the row has none', () => {
    const out = buildStudentMarking([
      run({ id: 'a', result_json: { results: [q({ n: '1', awarded: 3, max: 4 }), q({ n: '2', awarded: 1, max: 6 })] } }),
    ]);
    expect(out.papers[0]).toMatchObject({ awarded: 4, max: 10, pct: 40 });
  });

  it('leaves pct null rather than dividing by a zero-mark paper', () => {
    const out = buildStudentMarking([
      run({ id: 'a', total_awarded: 0, total_max: 0, result_json: { results: [q({ n: '1', awarded: 0, max: 0 })] } }),
    ]);
    expect(out.papers[0].pct).toBeNull();
    expect(out.averagePct).toBeNull();
  });

  it('lists papers newest first but measures the trend oldest → newest', () => {
    const out = buildStudentMarking([
      run({ id: 'old', created_at: '2026-06-01T02:00:00Z', total_awarded: 5, total_max: 10, result_json: { results: [q({ n: '1', awarded: 5, max: 10 })] } }),
      run({ id: 'new', created_at: '2026-08-01T02:00:00Z', total_awarded: 8, total_max: 10, result_json: { results: [q({ n: '1', awarded: 8, max: 10 })] } }),
    ]);
    expect(out.papers.map(p => p.id)).toEqual(['new', 'old']);
    expect(out.averagePct).toBe(65);
    expect(out.trendPts).toBe(30); // improving reads positive
  });

  it('has no trend from a single paper', () => {
    const out = buildStudentMarking([
      run({ id: 'a', total_awarded: 8, total_max: 10, result_json: { results: [q({ n: '1', awarded: 8, max: 10 })] } }),
    ]);
    expect(out.trendPts).toBeNull();
  });
});

describe('buildStudentMarking — per question', () => {
  it('keeps only the parts that actually lost marks, labelled', () => {
    const out = buildStudentMarking([
      run({
        id: 'a',
        result_json: {
          results: [
            q({
              n: '4',
              awarded: 3,
              max: 6,
              comment: 'Good start, lost the chain rule.',
              parts: [
                { label: '(a)', awarded: 2, max: 2, error_summary: 'no errors' },
                { label: '(b)', awarded: 1, max: 4, error_summary: 'differentiated the inside function only' },
              ],
            }),
          ],
        },
      }),
    ]);
    const question = out.papers[0].questions[0];
    expect(question.slips).toEqual(['(b): differentiated the inside function only']);
    expect(question.comment).toBe('Good start, lost the chain rule.');
    expect(question.full).toBe(false);
  });

  it('never leaks triage internals into the student view', () => {
    const out = buildStudentMarking([
      run({
        id: 'a',
        result_json: { results: [q({ n: '1', awarded: 1, max: 5, flagged: true, confidence: 'low' })] },
      }),
    ]);
    const serialised = JSON.stringify(out);
    for (const leak of ['review_recommended', 'match_confidence', 'marking_confidence', 'triage_override', 'low']) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('orders `dropped` by marks lost, biggest first', () => {
    const out = buildStudentMarking([
      run({
        id: 'a',
        result_json: {
          results: [
            q({ n: '1', awarded: 4, max: 5 }), // −1
            q({ n: '2', awarded: 5, max: 5 }), // full, excluded
            q({ n: '3', awarded: 1, max: 7 }), // −6
          ],
        },
      }),
    ]);
    expect(out.papers[0].dropped.map(d => d.questionNumber)).toEqual(['3', '1']);
    expect(out.papers[0].questions).toHaveLength(3);
  });

  it('prefers the annotated PDF and falls back to the plain one', () => {
    const rows = [
      run({ id: 'both', annotated_pdf_url: 'https://x/annotated.pdf', pdf_url: 'https://x/plain.pdf', result_json: { results: [q({ n: '1', awarded: 1, max: 1 })] } }),
      run({ id: 'plain', created_at: '2026-07-01T02:00:00Z', pdf_url: 'https://x/plain.pdf', result_json: { results: [q({ n: '1', awarded: 1, max: 1 })] } }),
      run({ id: 'none', created_at: '2026-06-01T02:00:00Z', result_json: { results: [q({ n: '1', awarded: 1, max: 1 })] } }),
    ];
    const urls = buildStudentMarking(rows).papers.map(p => p.pdfUrl);
    expect(urls).toEqual(['https://x/annotated.pdf', 'https://x/plain.pdf', null]);
  });
});

describe('buildStudentMarking — focus areas', () => {
  it('surfaces weak topics but ignores ones with too few marks behind them', () => {
    const out = buildStudentMarking([
      run({
        id: 'a',
        result_json: {
          results: [
            // 4/12 across two questions — a real weakness.
            q({ n: '1', awarded: 2, max: 6, topic: 'Vectors' }),
            q({ n: '2', awarded: 2, max: 6, topic: 'vectors ' }),
            // 1/3 on a single small question — not enough to call it a weakness.
            q({ n: '3', awarded: 1, max: 3, topic: 'Complex Numbers' }),
            // Strong: stays off the list.
            q({ n: '4', awarded: 9, max: 10, topic: 'Differentiation' }),
          ],
        },
      }),
    ]);
    expect(out.focus).toHaveLength(1);
    expect(out.focus[0]).toMatchObject({ topic: 'Vectors', awarded: 4, max: 12, pct: 33 });
  });

  it('aggregates a topic across papers rather than per paper', () => {
    const out = buildStudentMarking([
      run({ id: 'a', created_at: '2026-07-01T02:00:00Z', result_json: { results: [q({ n: '1', awarded: 1, max: 5, topic: 'Integration' })] } }),
      run({ id: 'b', created_at: '2026-08-01T02:00:00Z', result_json: { results: [q({ n: '1', awarded: 2, max: 5, topic: 'Integration' })] } }),
    ]);
    expect(out.focus).toHaveLength(1);
    expect(out.focus[0]).toMatchObject({ topic: 'Integration', awarded: 3, max: 10, questions: 2 });
  });

  it('does not build focus areas out of unreleased papers', () => {
    const out = buildStudentMarking([
      run({ id: 'a', released_at: null, result_json: { results: [q({ n: '1', awarded: 0, max: 10, topic: 'Vectors' })] } }),
    ]);
    expect(out.focus).toEqual([]);
  });
});

describe('buildStudentMarking — practice items', () => {
  it('surfaces result_json.practice for the student, minus internals', () => {
    const out = buildStudentMarking([
      run({
        id: 'a',
        result_json: {
          results: [q({ n: '3', awarded: 2, max: 5 })],
          practice: {
            created_at: '2026-08-14T02:00:00Z',
            model: 'opus',        // internal — must not surface
            costUsd: 0.42,        // internal — must not surface
            docx_url: 'https://blob/practice.docx',
            items: [
              {
                for: '3', source: 'db', id: 'q-123',
                question: 'Find $x$ such that $2^x = 8$.', answer: '$x = 3$',
                origin: 'Methodist 2023', topic: 'Indices', note: 'Same law of indices.',
              },
              // Generated item: no origin/topic, empty answer allowed.
              { for: '5', source: 'generated', id: null, question: 'Differentiate $x^2$.', answer: '', origin: null, topic: null, note: '' },
              // Malformed rows (no question text) are dropped, not rendered blank.
              { for: '7', source: 'db' },
              'not even an object',
            ],
          },
        },
      }),
    ]);
    expect(out.papers[0].practice).toEqual([
      {
        for: '3', question: 'Find $x$ such that $2^x = 8$.', answer: '$x = 3$',
        topic: 'Indices', origin: 'Methodist 2023', note: 'Same law of indices.',
      },
      { for: '5', question: 'Differentiate $x^2$.', answer: '', topic: null, origin: null, note: null },
    ]);
    expect(out.papers[0].practiceDocxUrl).toBe('https://blob/practice.docx');
    // The student view never carries the bot's cost/model bookkeeping.
    expect(JSON.stringify(out.papers[0].practice)).not.toMatch(/opus|costUsd|source|q-123/);
  });

  it('leaves practice empty (not undefined) on runs without a practice block', () => {
    const out = buildStudentMarking([
      run({ id: 'a', result_json: { results: [q({ n: '1', awarded: 5, max: 5 })] } }),
    ]);
    expect(out.papers[0].practice).toEqual([]);
    expect(out.papers[0].practiceDocxUrl).toBeNull();
  });
});
