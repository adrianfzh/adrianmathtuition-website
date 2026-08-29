import { describe, it, expect } from 'vitest';
import {
  extractFlagged,
  recomputeTotals,
  applyOverride,
  applyAgree,
  isFlagged,
  isReleasable,
  pendingCount,
  computeAutoHold,
  TriageIndexError,
} from './mark-triage';

// Shaped from a real `paper_marking_runs.result_json` row (2026-08-11) — the
// nesting is load-bearing: marks live at results[].marking.total_awarded, and
// the topic the bleed table reads lives at results[].marking_output.meta.
const question = (over: Record<string, unknown> = {}) => ({
  question_number: '3',
  photo_index: 6,
  region: 'full page, parts (c), (d), (e)',
  match_confidence: 'high',
  question_found: true,
  review_recommended: false,
  review_reasons: [],
  marking: {
    _ok: true,
    parts: [
      { label: '(c)', awarded: 1, max: 1, error_summary: null },
      { label: '(e)', awarded: 1, max: 3, error_summary: 'Used BC instead of the base AC.' },
    ],
    total_awarded: 4,
    total_max: 6,
    overall_comment: 'Parts (c) and (d) are fully correct.',
    marking_confidence: 'high',
  },
  marking_output: { meta: { level_detected: 'Sec 3/4 A-Math', topic_detected: 'Coordinate geometry' } },
  ...over,
});

const run = (...results: unknown[]) => ({ source: 'paper', results, totals: { awarded: 0, max: 0 } });

describe('extractFlagged', () => {
  it('returns only questions the marker asked to review', () => {
    const rj = run(
      question(),
      question({ question_number: '4', review_recommended: true, review_reasons: ['Question match was uncertain.'] }),
      question({ question_number: '5' })
    );
    const s = extractFlagged(rj);
    expect(s.flagged.map(q => q.questionNumber)).toEqual(['4']);
    expect(s.totalQuestions).toBe(3);
    expect(s.unflaggedCount).toBe(2);
  });

  it('carries the index into results[] so mutations address the right question', () => {
    const rj = run(question(), question(), question({ review_recommended: true }));
    expect(extractFlagged(rj).flagged[0].index).toBe(2);
  });

  it('surfaces the review reasons, part-level error summaries and detected topic', () => {
    const rj = run(question({ review_recommended: true, review_reasons: ['No question found — marked from the working alone.'] }));
    const q = extractFlagged(rj).flagged[0];
    expect(q.reviewReasons).toEqual(['No question found — marked from the working alone.']);
    expect(q.parts.find(p => p.label === '(e)')?.errorSummary).toBe('Used BC instead of the base AC.');
    expect(q.topic).toBe('Coordinate geometry');
  });

  it('treats a reviewed question as no longer flagged', () => {
    const rj = run(question({ review_recommended: true, triage_reviewed: true }));
    expect(extractFlagged(rj).flagged).toHaveLength(0);
    expect(extractFlagged(rj).unflaggedCount).toBe(1);
  });

  it('survives a run with no results at all', () => {
    expect(extractFlagged({ source: 'paper' }).flagged).toEqual([]);
    expect(extractFlagged(null).totalQuestions).toBe(0);
    expect(extractFlagged({ results: 'nonsense' }).totalQuestions).toBe(0);
  });
});

describe('recomputeTotals', () => {
  it('sums awarded and max across every question', () => {
    expect(recomputeTotals(run(question(), question()))).toEqual({ awarded: 8, max: 12 });
  });

  it('treats missing or non-numeric marks as zero rather than NaN', () => {
    const rj = run(question({ marking: { total_awarded: null, total_max: 'six' } }), question());
    expect(recomputeTotals(rj)).toEqual({ awarded: 4, max: 6 });
  });
});

describe('grounded totals survive triage', () => {
  // Eva's Set 3 P1 shape: the bot grounded /89 to the official /90
  // (totals.max_source 'registry', bot ai/paper-totals.js). An Agree/Override
  // here must NOT re-sum the denominator back to the guess-sum.
  const groundedRun = (...results: unknown[]) => ({
    source: 'paper',
    results,
    totals: { awarded: 66, max: 90, counted_max: 89, max_source: 'registry' },
  });

  it('recomputeTotals keeps a registry-grounded max, re-sums awarded only', () => {
    expect(recomputeTotals(groundedRun(question(), question()))).toEqual({ awarded: 8, max: 90 });
  });

  it('applyOverride keeps the grounded max and its breadcrumbs', () => {
    const rj = groundedRun(question({ review_recommended: true }), question());
    const next = applyOverride(rj, 0, 6, 'full credit', '2026-08-14T10:00:00Z');
    expect(next.totals).toEqual({ awarded: 10, max: 90, counted_max: 89, max_source: 'registry' });
  });

  it('applyAgree keeps the grounded max and its breadcrumbs', () => {
    const rj = groundedRun(question({ review_recommended: true }));
    const next = applyAgree(rj, 0, '2026-08-14T10:00:00Z');
    expect(next.totals).toEqual({ awarded: 4, max: 90, counted_max: 89, max_source: 'registry' });
  });

  it('an "out of ___" override max is preserved the same way', () => {
    const rj = {
      source: 'paper',
      results: [question({ review_recommended: true })],
      totals: { awarded: 31, max: 40, counted_max: 38, max_source: 'override' },
    };
    const next = applyOverride(rj, 0, 6, '', 'now');
    expect(next.totals).toEqual({ awarded: 6, max: 40, counted_max: 38, max_source: 'override' });
  });

  it('extractFlagged header shows the grounded max, not the counted sum', () => {
    const s = extractFlagged(groundedRun(question(), question()));
    expect(s.max).toBe(90);
    expect(s.awarded).toBe(8);
  });

  it('a counted run is untouched — sums exactly as before grounding existed', () => {
    const rj = {
      source: 'paper',
      results: [question({ review_recommended: true }), question()],
      totals: { awarded: 8, max: 12, counted_max: 12, max_source: 'counted' },
    };
    const next = applyOverride(rj, 0, 6, '', 'now');
    expect(next.totals).toEqual({ awarded: 10, max: 12, counted_max: 12, max_source: 'counted' });
  });
});

describe('applyOverride', () => {
  it('changes the mark and recomputes the paper total', () => {
    const rj = run(question({ review_recommended: true }), question());
    const next = applyOverride(rj, 0, 6, 'Full credit — the base was read correctly.', '2026-08-11T10:00:00Z');
    expect(recomputeTotals(next)).toEqual({ awarded: 10, max: 12 });
    expect(next.totals).toEqual({ awarded: 10, max: 12 });
  });

  it('resolves the flag so the row drops off the triage list', () => {
    const rj = run(question({ review_recommended: true }));
    const next = applyOverride(rj, 0, 5, '', '2026-08-11T10:00:00Z');
    expect(extractFlagged(next).flagged).toHaveLength(0);
    expect(pendingCount(next)).toBe(0);
  });

  it('records the AI original, the note and the timestamp', () => {
    const rj = run(question({ review_recommended: true }));
    const q = extractFlagged(applyOverride(rj, 0, 6, 'gave ecf', '2026-08-11T10:00:00Z')).flagged;
    expect(q).toHaveLength(0); // resolved — read it back off the raw json instead
    const raw = (applyOverride(rj, 0, 6, 'gave ecf', '2026-08-11T10:00:00Z').results as Record<string, unknown>[])[0];
    expect(raw.triage_override).toEqual({ awarded: 6, previous: 4, note: 'gave ecf', at: '2026-08-11T10:00:00Z' });
  });

  it('keeps the ORIGINAL AI mark as `previous` across repeated overrides', () => {
    // Otherwise a second edit overwrites the only record of what the AI actually
    // said, and there is no way back to it.
    const rj = run(question({ review_recommended: true }));
    const once = applyOverride(rj, 0, 6, 'first', '2026-08-11T10:00:00Z');
    const twice = applyOverride(once, 0, 5, 'second', '2026-08-11T11:00:00Z');
    const raw = (twice.results as Record<string, unknown>[])[0];
    expect((raw.triage_override as Record<string, unknown>).previous).toBe(4);
    expect((raw.triage_override as Record<string, unknown>).awarded).toBe(5);
  });

  it('clamps to [0, total_max] so a slip cannot skew the paper total', () => {
    const rj = run(question({ review_recommended: true }));
    expect(recomputeTotals(applyOverride(rj, 0, 99, '', 'now'))).toEqual({ awarded: 6, max: 6 });
    expect(recomputeTotals(applyOverride(rj, 0, -3, '', 'now'))).toEqual({ awarded: 0, max: 6 });
  });

  it('does not mutate the input — a failed write must leave the row untouched', () => {
    const rj = run(question({ review_recommended: true }));
    const before = JSON.stringify(rj);
    applyOverride(rj, 0, 6, 'x', 'now');
    expect(JSON.stringify(rj)).toBe(before);
  });

  it('throws rather than silently no-op on an out-of-range index', () => {
    expect(() => applyOverride(run(question()), 7, 3, '', 'now')).toThrow(TriageIndexError);
  });
});

describe('applyAgree', () => {
  it('resolves the flag without touching the marks', () => {
    const rj = run(question({ review_recommended: true }));
    const next = applyAgree(rj, 0, '2026-08-11T10:00:00Z');
    expect(recomputeTotals(next)).toEqual({ awarded: 4, max: 6 });
    expect(extractFlagged(next).flagged).toHaveLength(0);
  });

  it('does not mutate the input', () => {
    const rj = run(question({ review_recommended: true }));
    const before = JSON.stringify(rj);
    applyAgree(rj, 0, 'now');
    expect(JSON.stringify(rj)).toBe(before);
  });
});

describe('isReleasable', () => {
  it('is true for a run the marker never flagged — releasable without opening it', () => {
    expect(isReleasable(run(question(), question()))).toBe(true);
  });

  it('is false while any flag is unresolved', () => {
    expect(isReleasable(run(question(), question({ review_recommended: true })))).toBe(false);
  });

  it('becomes true once every flag is agreed or overridden', () => {
    const rj = run(question({ review_recommended: true }), question({ review_recommended: true }));
    const step1 = applyAgree(rj, 0, 'now');
    expect(isReleasable(step1)).toBe(false);
    expect(isReleasable(applyOverride(step1, 1, 2, '', 'now'))).toBe(true);
  });
});

describe('isFlagged', () => {
  it('needs review_recommended true and triage_reviewed not set', () => {
    expect(isFlagged({ review_recommended: true })).toBe(true);
    expect(isFlagged({ review_recommended: true, triage_reviewed: true })).toBe(false);
    expect(isFlagged({ review_recommended: false })).toBe(false);
    expect(isFlagged({})).toBe(false);
  });
});

describe('computeAutoHold', () => {
  // Mirror of the bot's lib/release-gates.js — keep the two in lockstep. Born
  // from Alessi's auto-released 38/66 (15/16 parts question_found:false,
  // 2026-08-29); each gate here is pinned so a refactor can't silently drop one.
  it('clean run: no hold, no reasons', () => {
    const h = computeAutoHold(run(question(), question(), question()));
    expect(h.hold).toBe(false);
    expect(h.reasons).toEqual([]);
  });

  it('gate U: unreadable pages hold', () => {
    const h = computeAutoHold({ ...run(question()), unreadable_pages: [2, 5] });
    expect(h.hold).toBe(true);
    expect(h.reasons.join(' ')).toContain('2 pages could not be read');
  });

  it('gate E: zero marked questions hold', () => {
    const h = computeAutoHold(run());
    expect(h.hold).toBe(true);
    expect(h.reasons.join(' ')).toContain('no questions were marked');
  });

  it('gate Q: half or more marked blind holds; a lone blind question does not', () => {
    const blind = question({ question_found: false });
    expect(computeAutoHold(run(blind, blind, question(), question())).hold).toBe(true);
    expect(computeAutoHold(run(blind, question(), question(), question())).hold).toBe(false);
  });

  it('gate R: reconcile findings hold; redraw receipts alone do not', () => {
    const finding = {
      ...run(question(), question()),
      reconciliation: { relabels: [], superseded_parts: [{ q: '2' }], notes: [] },
    };
    expect(computeAutoHold(finding).hold).toBe(true);
    const receiptOnly = {
      ...run(question(), question()),
      reconciliation: { relabels: [], superseded_parts: [], notes: [], redraws: ['Photo 2 redrawn.'] },
    };
    expect(computeAutoHold(receiptOnly).hold).toBe(false);
  });

  it('never throws on garbage input — holds via gate E instead', () => {
    expect(computeAutoHold(null).hold).toBe(true);
    expect(computeAutoHold({}).hold).toBe(true);
    expect(computeAutoHold('nope').hold).toBe(true);
  });
});
