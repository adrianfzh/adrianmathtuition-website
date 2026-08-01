import { describe, expect, it } from 'vitest';
import { draftIsEmpty, draftKey, makeDraft, parseDraft, serializeDraft } from './draft-store';
import type { Stroke } from './types';

const stroke: Stroke = {
  tool: 'pen', color: '#dc2626', width: 5.123,
  points: [{ x: 10.1234, y: 20.5678, p: 0.71234 }, { x: 30, y: 40, p: 0.5 }],
};

describe('draft roundtrip', () => {
  it('serialize → parse preserves structure (with rounding)', () => {
    const d = makeDraft('run-1', { 0: [stroke], 2: [] }, 1754000000000);
    const back = parseDraft(serializeDraft(d));
    expect(back).not.toBeNull();
    expect(back!.runId).toBe('run-1');
    expect(back!.savedAt).toBe(1754000000000);
    expect(back!.doneAt).toBeNull();
    // Empty page pruned; inked page intact.
    expect(Object.keys(back!.pages)).toEqual(['0']);
    const s = back!.pages[0][0];
    expect(s.tool).toBe('pen');
    expect(s.points[0]).toEqual({ x: 10.1, y: 20.6, p: 0.71 });
    expect(s.width).toBe(5.1);
  });
  it('keeps the snapped marker and doneAt stamp', () => {
    const snapped: Stroke = { ...stroke, snapped: 'line' };
    const d = makeDraft('run-2', { 1: [snapped] }, 100, 200);
    const back = parseDraft(serializeDraft(d))!;
    expect(back.pages[1][0].snapped).toBe('line');
    expect(back.doneAt).toBe(200);
  });
});

describe('parseDraft rejects the unusable', () => {
  it('garbage json → null', () => {
    expect(parseDraft('{nope')).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(undefined)).toBeNull();
  });
  it('wrong version → null', () => {
    expect(parseDraft(JSON.stringify({ v: 2, runId: 'x', pages: {} }))).toBeNull();
  });
  it('malformed strokes → null (never a half-restored draft)', () => {
    expect(parseDraft(JSON.stringify({ v: 1, runId: 'x', pages: { 0: [{ tool: 'crayon' }] } }))).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, runId: 'x', pages: { 0: [{ tool: 'pen', color: '#000', width: 2, points: [{ x: 'NaN' }] }] } }))).toBeNull();
  });
});

describe('helpers', () => {
  it('draftIsEmpty', () => {
    expect(draftIsEmpty(makeDraft('r', {}, 0))).toBe(true);
    expect(draftIsEmpty(makeDraft('r', { 0: [] }, 0))).toBe(true);
    expect(draftIsEmpty(makeDraft('r', { 0: [stroke] }, 0))).toBe(false);
  });
  it('draftKey is versioned and run-scoped', () => {
    expect(draftKey('abc')).toBe('annotate-draft:v1:abc');
  });
});
