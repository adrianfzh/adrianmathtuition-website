import { describe, it, expect } from 'vitest';
import { parseLayer, serializeLayer, swapMark, addTextObject, layerDirty } from './layer';
import {
  layerEdits, applyLayerEdits, sameStoredFile, planRestore, mergeStrokes, pageFingerprint,
  isNetworkFailure, networkError, isGatewayStatus,
} from './offline-sync';
import { makeDraft, parseDraft, serializeDraft, draftHasPending, draftIsEmpty } from './draft-store';
import type { Stroke } from './types';

const BODY =
  '<rect x="0" y="0" width="5" height="5"/>' +
  '<g data-obj="mark" data-id="mark-1" data-q="10" data-text="B1"><g transform="rotate(3 100 200)" stroke="#d00"><path d="M 92 199.75 Q 95 204.5, 97.2 206.8 L 109.5 192"/></g><text x="120" y="190" font-size="14">B1</text></g>' +
  '<g data-obj="score" data-id="score-3" data-q="10" data-part="(a)" data-text="2/3"><rect x="10" y="10" width="40" height="20"/><text x="12" y="25">2/3</text></g>' +
  '<g data-obj="note" data-id="note-2" data-q="10" data-part="(b)" data-text="check the sign"><text x="504" y="320" font-size="16">check the sign</text></g>';

const pen = (x: number): Stroke => ({ tool: 'pen', color: '#dc2626', width: 3, points: [{ x, y: 10, p: 0.5 }, { x: x + 20, y: 30, p: 0.5 }] });

describe('layer edits survive a reload (27 Oct 2026 — "the changes does not appear on screen")', () => {
  it('moves, deletions, retyped chips, flips and added text come back exactly on a fresh parse of the same file', () => {
    const p = parseLayer(BODY);
    p.objects[0].dx = 12; p.objects[0].dy = -4;
    swapMark(p.objects[0]);
    p.objects[1].textOverride = '1/3';
    p.objects[2].deleted = true;
    addTextObject(p, { x: 50, y: 60, text: 'see me', fontSize: 20, color: '#2563eb', font: 'Patrick Hand' });
    const edits = layerEdits(p);
    expect(edits.map((e) => e.id)).toEqual(['mark-1', 'score-3', 'note-2', expect.stringMatching(/^adrian-text-/)]);

    // a JSON round trip, as the draft stores them
    const back = JSON.parse(JSON.stringify(edits));
    const fresh = parseLayer(BODY);
    expect(layerDirty(fresh)).toBe(false);
    const r = applyLayerEdits(fresh, back);
    expect(r).toEqual({ applied: 4, skipped: 0 });
    expect(serializeLayer(fresh)).toBe(serializeLayer(p));
    expect(layerEdits(fresh)).toEqual(edits);
  });

  it('an untouched layer has no edits', () => {
    expect(layerEdits(parseLayer(BODY))).toEqual([]);
    expect(layerEdits(null)).toEqual([]);
  });

  it('on a layer that changed elsewhere, moves are NOT applied twice, but deletions, retypes and added objects are', () => {
    const p = parseLayer(BODY);
    p.objects[0].dx = 30;
    p.objects[1].textOverride = '3/3';
    addTextObject(p, { x: 5, y: 5, text: 'well done', fontSize: 18, color: '#16a34a', font: 'Patrick Hand' });
    const edits = layerEdits(p);
    const other = parseLayer(BODY);
    applyLayerEdits(other, edits, true);
    expect(other.objects[0].dx).toBe(0);
    expect(other.objects[1].textOverride).toBe('3/3');
    expect(other.objects.some((o) => o.text === 'well done')).toBe(true);
    // the added object is not added twice when the server already has it
    const again = applyLayerEdits(other, edits, true);
    expect(other.objects.filter((o) => o.text === 'well done')).toHaveLength(1);
    expect(again.skipped).toBeGreaterThanOrEqual(1);
  });

  it('an edit to an object the layer no longer has is skipped, not invented', () => {
    const fresh = parseLayer(BODY);
    expect(applyLayerEdits(fresh, [{ id: 'gone-9', deleted: true }])).toEqual({ applied: 0, skipped: 1 });
  });
});

describe('sameStoredFile', () => {
  it('the relative /api/files path and the full URL are the same file', () => {
    expect(sameStoredFile('/api/files/runs/r1/annotated/p-layer-1.svg', 'https://www.adrianmathtuition.com/api/files/runs/r1/annotated/p-layer-1.svg')).toBe(true);
    expect(sameStoredFile('/api/files/runs/r1/annotated/p-layer-1.svg', '/api/files/runs/r1/annotated/p-edit-layer-2.svg')).toBe(false);
    expect(sameStoredFile(null, null)).toBe(true);
    expect(sameStoredFile(null, '/api/files/x')).toBe(false);
  });
});

describe('planRestore — which copy a page opens with', () => {
  const base = '/api/files/runs/r/annotated/p-layer-1.svg';
  const ours = 'https://www.adrianmathtuition.com/api/files/runs/r/annotated/p-edit-layer-2.svg';
  const theirs = '/api/files/runs/r/annotated/p-edit-layer-3.svg';

  it('everything saved → the server copy, even when the device still holds old strokes (the reload bug)', () => {
    expect(planRestore({ layered: true, serverLayer: ours, serverInk: '/i.json', draft: { pending: false, base, hasStrokes: true } }))
      .toEqual({ source: 'server', layerUrl: ours, edits: 'none', strokes: 'server' });
    expect(planRestore({ layered: true, serverLayer: base, serverInk: null }).source).toBe('server');
  });
  it('unsaved work on the file the server still holds → the device copy, on its own base', () => {
    expect(planRestore({ layered: true, serverLayer: base, serverInk: null, draft: { pending: true, base, hasEdits: true } }))
      .toEqual({ source: 'device', layerUrl: base, edits: 'all', strokes: 'device' });
  });
  it('unsaved work after one of OUR saves of that page (a Done cut short) → still the device copy on its base', () => {
    expect(planRestore({ layered: true, serverLayer: ours, serverInk: null, draft: { pending: true, base, savedAs: ours, hasEdits: true } }).source).toBe('device');
  });
  it('unsaved work, but the server changed elsewhere → both: the server page with the device work on top, never a silent overwrite', () => {
    expect(planRestore({ layered: true, serverLayer: theirs, serverInk: '/i.json', draft: { pending: true, base, savedAs: ours, hasEdits: true, hasStrokes: true } }))
      .toEqual({ source: 'both', layerUrl: theirs, edits: 'safe', strokes: 'merge' });
  });
  it('a flat page (no editable layer) always takes the device strokes', () => {
    expect(planRestore({ layered: false, serverLayer: null, serverInk: null, draft: { pending: false, hasStrokes: true } }).strokes).toBe('device');
  });
});

describe('mergeStrokes', () => {
  it('keeps the server strokes and adds only the device strokes it lacks', () => {
    const a = pen(10), b = pen(50), c = pen(90);
    const merged = mergeStrokes([a, b], [{ ...b, points: b.points.map((p) => ({ ...p, x: p.x + 0.2 })) }, c]);
    expect(merged).toHaveLength(3);
    expect(merged[2]).toBe(c);
  });
});

describe('pageFingerprint', () => {
  it('changes with any stroke or edit, and not otherwise', () => {
    const f0 = pageFingerprint([], [pen(1)]);
    expect(pageFingerprint([], [pen(1)])).toBe(f0);
    expect(pageFingerprint([], [pen(1), pen(2)])).not.toBe(f0);
    expect(pageFingerprint([{ id: 'x', deleted: true }], [pen(1)])).not.toBe(f0);
  });
});

describe('isNetworkFailure', () => {
  it('offline, a thrown fetch, or a marked error is a network failure; a server refusal is not', () => {
    expect(isNetworkFailure(new Error('anything'), false)).toBe(true);
    expect(isNetworkFailure(new TypeError('Load failed'), true)).toBe(true);
    expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true);
    expect(isNetworkFailure(networkError('gateway'), true)).toBe(true);
    expect(isNetworkFailure(new Error('page 2 could not be composed'), true)).toBe(false);
    expect(isNetworkFailure(new TypeError('x is undefined'), true)).toBe(false);
    expect(isGatewayStatus(504)).toBe(true);
    expect(isGatewayStatus(409)).toBe(false);
  });
});

describe('draft v2', () => {
  it('round-trips layer edits, bases, pending and the upload queue; typed notes keep their words', () => {
    const typed: Stroke = { ...pen(5), text: 'see me', fontSize: 24 };
    const d = makeDraft('run-1', { 0: [pen(1), typed] }, 100, null,
      { 0: { base: '/api/files/b.svg', savedAs: '/api/files/s.svg', edits: [{ id: 'mark-1', dx: 3, deleted: true }], pending: true }, 1: {} }, true);
    const back = parseDraft(serializeDraft(d))!;
    expect(back.v).toBe(2);
    expect(back.meta[0]).toEqual({ base: '/api/files/b.svg', savedAs: '/api/files/s.svg', edits: [{ id: 'mark-1', dx: 3, deleted: true }], pending: true });
    expect(back.meta[1]).toBeUndefined();
    expect(back.uploadQueued).toBe(true);
    expect(back.pages[0][1].text).toBe('see me');
    expect(back.pages[0][1].fontSize).toBe(24);
    expect(draftHasPending(back)).toBe(true);
  });
  it('a v1 draft still opens: never Done → its inked pages are unsaved work; Done → nothing pending', () => {
    const v1 = (doneAt: number | null) => JSON.stringify({ v: 1, runId: 'r', savedAt: 5, doneAt, pages: { 2: [pen(1)] } });
    expect(parseDraft(v1(null))!.meta[2]).toEqual({ pending: true });
    expect(draftHasPending(parseDraft(v1(9)))).toBe(false);
  });
  it('a draft with only layer edits, or only a queued upload, is not empty', () => {
    expect(draftIsEmpty(makeDraft('r', {}, 0, null, { 0: { edits: [{ id: 'a', deleted: true }] } }))).toBe(false);
    expect(draftIsEmpty(makeDraft('r', {}, 0, null, {}, true))).toBe(false);
    expect(draftIsEmpty(makeDraft('r', {}, 0, null, { 0: { base: '/x' } }))).toBe(true);
  });
});
