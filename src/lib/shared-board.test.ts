import { describe, expect, it } from 'vitest';
import { strokeCount, versionReason, versionWhen, VERSION_EVERY_MS, applyPatch, boardTitle, changedPages, displayPageCount, lastInkedPage, pollMayReplace, shareText, withPhotoAppended, MAX_BOARD_PAGES } from './shared-board';
import type { InkPages } from './student-ink';

const stroke = { tool: 'pen' as const, color: '#000', width: 3, points: [{ x: 1, y: 1, p: 0.5 }, { x: 5, y: 5, p: 0.5 }] };
const page = (n = 1) => ({ w: 1000, h: 1414, strokes: Array.from({ length: n }, () => stroke) });

describe('shared board pages', () => {
  it('always shows one empty page after the last stored or written page', () => {
    expect(displayPageCount(0)).toBe(1);
    expect(displayPageCount(3)).toBe(4);
    expect(displayPageCount(1, { 4: page() })).toBe(6);
    expect(displayPageCount(1, {}, { 2: page() })).toBe(4);
  });
  it('ignores pages whose strokes were all erased', () => {
    expect(lastInkedPage({ 5: { w: 1, h: 1, strokes: [] } }, { 1: page() })).toBe(1);
  });
  it('never shows more than the cap', () => {
    expect(displayPageCount(MAX_BOARD_PAGES + 5)).toBe(MAX_BOARD_PAGES);
  });
  it('puts a photo after everything written, keeping every index where it was', () => {
    const out = withPhotoAppended([{ url: 'a' }], 'p', { 2: page() });
    expect(out).toEqual([{ url: 'a' }, { url: null }, { url: null }, { url: 'p' }]);
    expect(withPhotoAppended([], 'p')).toEqual([{ url: 'p' }]);
  });
  it('refuses a photo past the cap', () => {
    expect(withPhotoAppended(Array.from({ length: MAX_BOARD_PAGES - 1 }, () => ({ url: null })), 'p')).toBeNull();
  });
});

describe('live patches', () => {
  it('sends only the pages that changed, and an erased page as empty', () => {
    const p0 = page(), p1 = page();
    const prev: InkPages = { 0: p0, 1: p1 };
    const next: InkPages = { 0: p0, 2: page(2) };
    const d = changedPages(prev, next);
    expect(Object.keys(d).sort()).toEqual(['1', '2']);
    expect(d[1].strokes).toEqual([]);
  });
  it('applies a patch, dropping emptied pages and junk indices', () => {
    const out = applyPatch({ 0: page(), 1: page() }, { 1: { w: 1, h: 1, strokes: [] }, 3: page(2), [-1]: page(), 999: page() } as InkPages);
    expect(Object.keys(out).sort()).toEqual(['0', '3']);
  });
  it('lets the poll replace only when the live channel is quiet', () => {
    expect(pollMayReplace(1000, 5000)).toBe(false);
    expect(pollMayReplace(0, 20_000)).toBe(true);
  });
});

describe('words', () => {
  it('names a board', () => {
    expect(boardTitle('  Vectors  recap ', null)).toBe('Vectors recap');
    expect(boardTitle('', 'RI Prelim 2024 P1')).toBe('RI Prelim 2024 P1');
    expect(boardTitle(null, null, new Date('2026-11-05T04:00:00Z'))).toBe('Board · 5 Nov');
  });
  it('writes the WhatsApp line with the first name', () => {
    expect(shareText('Tan Wei Ming', 'https://x/b/k')).toBe('Hi Tan, here is our board. Open it on your phone or iPad and write with me: https://x/b/k');
  });
});

describe('earlier versions', () => {
  const now = Date.parse('2026-11-05T08:00:00Z');
  it('keeps one before a big rub-out, whatever the time', () => {
    expect(versionReason({ before: { 0: page(10) }, after: { 0: page(2) }, lastVersionAt: now - 1000, now })).toBe('big-erase');
    expect(versionReason({ before: { 0: page(10) }, after: {}, lastVersionAt: now, now })).toBe('big-erase');
  });
  it('does not count rubbing out one or two lines as big', () => {
    expect(versionReason({ before: { 0: page(4) }, after: { 0: page(2) }, lastVersionAt: now - 1000, now })).toBeNull();
  });
  it('keeps one every 10 minutes of writing, and none of an empty board', () => {
    expect(versionReason({ before: { 0: page(1) }, after: { 0: page(2) }, lastVersionAt: null, now })).toBe('every-10-min');
    expect(versionReason({ before: { 0: page(1) }, after: { 0: page(2) }, lastVersionAt: now - VERSION_EVERY_MS + 1, now })).toBeNull();
    expect(versionReason({ before: {}, after: { 0: page(1) }, lastVersionAt: null, now })).toBeNull();
  });
  it('counts strokes across pages', () => {
    expect(strokeCount({ 0: page(2), 3: page(3) })).toBe(5);
    expect(strokeCount(null)).toBe(0);
  });
  it('says when, in Singapore time', () => {
    expect(versionWhen('2026-11-05T07:42:00Z', new Date('2026-11-05T09:00:00Z'))).toBe('Today 3:42 pm');
    expect(versionWhen('2026-11-04T07:42:00Z', new Date('2026-11-05T09:00:00Z'))).toBe('Yesterday 3:42 pm');
    expect(versionWhen('2026-11-01T07:42:00Z', new Date('2026-11-05T09:00:00Z'))).toBe('1 Nov 3:42 pm');
  });
});

import { applyStickerOp, clampBox, isPaperUrl, paperUrl, parseStickerOp, placeSticker, resizeKeepShape, BOARD_PAPERS, type Sticker } from './shared-board';

describe('page templates', () => {
  it('knows its own template pages and nothing else', () => {
    expect(BOARD_PAPERS.every(p => isPaperUrl(paperUrl(p.key)))).toBe(true);
    expect(isPaperUrl('/board/secret.png')).toBe(false);
    expect(isPaperUrl('https://evil.example/board/axes.png')).toBe(false);
  });
});

describe('photo stickers', () => {
  const s: Sticker = { id: 'abc123', page: 0, url: 'u', x: 10, y: 10, w: 100, h: 50 };
  it('places a new sticker centred, 60% wide, keeping its shape', () => {
    expect(placeSticker({ w: 1000, h: 1414 }, { w: 400, h: 200 })).toEqual({ x: 200, y: 371, w: 600, h: 300 });
    const tall = placeSticker({ w: 1000, h: 1414 }, { w: 100, h: 1000 });
    expect(tall.h).toBeLessThanOrEqual(849);
  });
  it('keeps a dragged sticker on the page', () => {
    expect(clampBox({ x: -5000, y: 9000, w: 100, h: 100 }, { w: 1000, h: 1414 })).toEqual({ x: -60, y: 1374, w: 100, h: 100 });
    expect(clampBox({ x: 0, y: 0, w: 5, h: 5 }, { w: 1000, h: 1414 }).w).toBe(40);
  });
  it('resizes from the corner keeping the photo\'s shape', () => {
    expect(resizeKeepShape(s, 100)).toMatchObject({ w: 200, h: 100 });
  });
  it('adds, moves and removes; refuses an unknown id', () => {
    const added = applyStickerOp([], { op: 'add', sticker: s })!;
    expect(added).toHaveLength(1);
    expect(applyStickerOp(added, { op: 'update', id: 'abc123', x: 1, y: 2, w: 3, h: 4 })![0]).toMatchObject({ x: 1, y: 2, w: 3, h: 4 });
    expect(applyStickerOp(added, { op: 'delete', id: 'abc123' })).toEqual([]);
    expect(applyStickerOp(added, { op: 'delete', id: 'nope000' })).toBeNull();
  });
  it('reads only well-formed changes', () => {
    expect(parseStickerOp({ op: 'add', sticker: { ...s } })).not.toBeNull();
    expect(parseStickerOp({ op: 'add', sticker: { ...s, page: 999 } })).toBeNull();
    expect(parseStickerOp({ op: 'update', id: 'abc123', x: 'a', y: 1, w: 1, h: 1 })).toBeNull();
    expect(parseStickerOp({ op: 'delete', id: '../x' })).toBeNull();
  });
});
