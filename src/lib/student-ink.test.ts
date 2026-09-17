import { describe, it, expect } from 'vitest';
import { validateInkPages, inkIsEmpty, inkStrokes, MAX_INK_PAGES } from './student-ink';

const stroke = (n = 2) => ({ tool: 'pen', color: '#dc2626', width: 3, points: Array.from({ length: n }, (_, i) => ({ x: i * 10, y: i * 5, p: 0.5 })) });

describe('validateInkPages', () => {
  it('accepts the overlay shape and drops empty pages', () => {
    const r = validateInkPages({ 0: { strokes: [stroke()], w: 1200, h: 1600 }, 1: { strokes: [], w: 1200, h: 1600 } });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(Object.keys(r.pages)).toEqual(['0']); expect(r.pages[0].strokes[0].points).toHaveLength(2); }
  });
  it('refuses non-objects, bad indexes, missing sizes and non-numeric points', () => {
    expect(validateInkPages(null).ok).toBe(false);
    expect(validateInkPages({ a: { strokes: [], w: 1, h: 1 } }).ok).toBe(false);
    expect(validateInkPages({ 0: { strokes: [stroke()], w: 0, h: 10 } }).ok).toBe(false);
    expect(validateInkPages({ 0: { strokes: [{ ...stroke(), points: [{ x: 'a', y: 1 }] }], w: 10, h: 10 } }).ok).toBe(false);
  });
  it('normalises tool, colour and width', () => {
    const r = validateInkPages({ 2: { strokes: [{ tool: 'crayon', color: 'red', width: 9999, points: [{ x: 1, y: 1 }] }], w: 10, h: 10 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages[2].strokes[0]).toMatchObject({ tool: 'pen', color: '#2563eb', width: 200 });
  });
  it('caps the page count', () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i <= MAX_INK_PAGES; i++) many[i] = { strokes: [stroke()], w: 10, h: 10 };
    expect(validateInkPages(many).ok).toBe(false);
  });
});

describe('inkIsEmpty / inkStrokes', () => {
  it('reads emptiness and lifts the strokes by page', () => {
    expect(inkIsEmpty(null)).toBe(true);
    expect(inkIsEmpty({ 0: { strokes: [], w: 1, h: 1 } })).toBe(true);
    const pages = { 3: { strokes: [stroke() as never], w: 1, h: 1 } };
    expect(inkIsEmpty(pages)).toBe(false);
    expect(Object.keys(inkStrokes(pages))).toEqual(['3']);
  });
});
