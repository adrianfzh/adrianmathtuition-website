import { describe, expect, it } from 'vitest';
import { figureServable, hasPrintableAnswer } from './kiosk-pool';

// The two predicates ARE the servability invariant (docs/KIOSK.md §5b–5c):
// answer-gated + text-only-or-verified-figure. Both the worksheet pool and the
// student mock assembly (/api/portal/print-paper) import these — these tests
// pin the single copy of the gate.

describe('hasPrintableAnswer', () => {
  it('accepts a top-level answer', () => {
    expect(hasPrintableAnswer({ answer: '$x=3$', parts: null })).toBe(true);
  });

  it('accepts an answer that lives only on a part', () => {
    expect(hasPrintableAnswer({ answer: null, parts: [{ label: 'a', answer: '7' }] })).toBe(true);
  });

  it('accepts an answer that lives only on a subpart', () => {
    expect(
      hasPrintableAnswer({ answer: null, parts: [{ label: 'a', subparts: [{ label: 'i', answer: '7' }] }] })
    ).toBe(true);
  });

  it('rejects rows with no answer anywhere', () => {
    expect(hasPrintableAnswer({ answer: null, parts: null })).toBe(false);
    expect(hasPrintableAnswer({ answer: '', parts: [{ label: 'a', text: 'find x' }] })).toBe(false);
  });

  it('rejects whitespace-only top-level answers', () => {
    expect(hasPrintableAnswer({ answer: '   ', parts: null })).toBe(false);
  });
});

describe('figureServable', () => {
  it('always serves text-only questions', () => {
    expect(figureServable({ has_image: false })).toBe(true);
    expect(figureServable({ has_image: null })).toBe(true);
  });

  it('serves engine-drawn figures regardless of watermark status', () => {
    expect(figureServable({ has_image: true, figure_url: 'figures/q1.svg', image_watermark_status: null })).toBe(true);
  });

  it('serves scanned figures only when the watermark sweep marked them clean', () => {
    expect(figureServable({ has_image: true, figure_url: null, image_watermark_status: 'clean' })).toBe(true);
    expect(figureServable({ has_image: true, figure_url: null, image_watermark_status: 'flagged' })).toBe(false);
  });

  it('fails closed on unscanned/unknown watermark status', () => {
    expect(figureServable({ has_image: true, figure_url: null, image_watermark_status: null })).toBe(false);
    expect(figureServable({ has_image: true, figure_url: null })).toBe(false);
  });
});
