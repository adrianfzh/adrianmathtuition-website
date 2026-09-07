import { describe, it, expect } from 'vitest';
import { parseLayer, serializeLayer, applyText, wrapText, objectTextLines, strokesToSvg, layerDirty, layerSnapshot, layerRestore, addTextObject, markType, swapMark, recordEditsFor } from './layer';

const BODY =
  '<rect x="0" y="0" width="5" height="5"/>' +
  '<g data-obj="mark" data-id="mark-1" data-q="10" data-text="B1"><g transform="rotate(3 100 200)"><path d="M1 1"/></g><text x="120" y="190" font-size="14">B1</text></g>' +
  '<g data-obj="note" data-id="note-2" data-q="10" data-part="(b)" data-text="your curve starts at (0,0) — that is 4 sin 2x"><rect x="500" y="300" width="200" height="60"/>' +
  '<text x="504" y="320" font-size="16" fill="#1e3a8a">your curve starts at (0,0)</text><text x="504" y="341" font-size="16" fill="#1e3a8a">— that is 4 sin 2x</text><path d="M500 330 L400 330"/></g>' +
  '<line x1="0" y1="9" x2="9" y2="9"/>';

describe('parseLayer / serializeLayer', () => {
  it('finds tagged groups with their nested <g>, keeps background in order, and round-trips unchanged', () => {
    const p = parseLayer(BODY);
    expect(p.objects.map(o => [o.id, o.kind, o.q, o.part])).toEqual([['mark-1', 'mark', '10', null], ['note-2', 'note', '10', '(b)']]);
    expect(p.objects[1].text).toBe('your curve starts at (0,0) — that is 4 sin 2x');
    expect(p.items.map(i => i.type)).toEqual(['bg', 'obj', 'obj', 'bg']);
    expect(serializeLayer(p)).toBe(BODY);
    expect(layerDirty(p)).toBe(false);
  });
  it('a deleted object vanishes, a moved one is wrapped in a translate, the rest is untouched', () => {
    const p = parseLayer(BODY);
    p.objects[0].deleted = true;
    p.objects[1].dx = 12.34; p.objects[1].dy = -5;
    const out = serializeLayer(p);
    expect(out).not.toContain('data-id="mark-1"');
    expect(out).toContain('<g transform="translate(12.3 -5)"><g data-obj="note"');
    expect(out.startsWith('<rect x="0"')).toBe(true);
    expect(out.endsWith('<line x1="0" y1="9" x2="9" y2="9"/>')).toBe(true);
    expect(layerDirty(p)).toBe(true);
  });
});

describe('text editing', () => {
  it('reads the visible lines and replaces a single <text>', () => {
    const p = parseLayer(BODY);
    expect(objectTextLines(p.objects[0])).toEqual(['B1']);
    expect(applyText(p.objects[0].inner, 'M1 & A1')).toContain('<text x="120" y="190" font-size="14">M1 &amp; A1</text>');
  });
  it('re-wraps a multi-line note at the original pitch and width, keeping the panel and the leader', () => {
    const p = parseLayer(BODY);
    const out = applyText(p.objects[1].inner, 'The curve of 4 cos 2x must start at its maximum (0, 4), not at the origin.');
    const texts = [...out.matchAll(/<text[^>]*y="([^"]+)"[^>]*>([^<]*)<\/text>/g)];
    expect(texts.length).toBeGreaterThanOrEqual(3);
    expect(texts.map(t => Number(t[1]))).toEqual(texts.map((_, i) => 320 + i * 21));
    expect(texts.every(t => t[2].length <= 26)).toBe(true);
    expect(out).toContain('<rect x="500" y="300"');
    expect(out).toContain('<path d="M500 330 L400 330"/>');
    expect(wrapText('a bb ccc dddd', 6)).toEqual(['a bb', 'ccc', 'dddd']);
  });
});

describe('strokesToSvg', () => {
  it('pen is an opaque round-capped path; highlighter is translucent and multiplied', () => {
    const svg = strokesToSvg([
      { tool: 'pen', color: '#dc2626', width: 3, points: [{ x: 1, y: 2, p: 0.5 }, { x: 10.26, y: 2, p: 0.5 }] },
      { tool: 'highlighter', color: '#facc15', width: 14, points: [{ x: 0, y: 0, p: 0.5 }, { x: 5, y: 5, p: 0.5 }] },
    ]);
    expect(svg).toContain('<path d="M1 2 L10.3 2" fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
    expect(svg).toContain('stroke="#facc15" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.38" style="mix-blend-mode:multiply"/>');
  });
});

describe('§14 ④–⑤: snapshots, typed text, ✓⇄✗, record edits', () => {
  const TICK = '<g data-obj="mark" data-id="mark-1" data-q="10" data-text="B1" data-type="tick"><g transform="rotate(2.5 100 200)" stroke="#d32424" stroke-width="2" fill="none"><path d="M 92 199.5 Q 95 204.5, 97.2 206.8 L 109.5 192"/></g><text x="112" y="195" font-size="14">B1</text></g>';
  it('a snapshot restores added, deleted and moved objects alike', () => {
    const p = parseLayer(TICK);
    const snap = layerSnapshot(p);
    const t = addTextObject(p, { x: 50, y: 60, text: 'see me', fontSize: 20, color: '#dc2626', font: 'Patrick Hand' });
    p.objects[0].deleted = true; p.objects[0].dx = 5;
    expect(p.objects.length).toBe(2);
    expect(serializeLayer(p)).toContain('data-obj="adrian-text"');
    layerRestore(p, snap);
    expect(p.objects.length).toBe(1);
    expect(p.objects[0].deleted).toBe(false);
    expect(p.objects[0].dx).toBe(0);
    expect(serializeLayer(p)).toBe(TICK);
    void t;
  });
  it('a typed text object is a normal layer object with escaped text', () => {
    const p = parseLayer('');
    const o = addTextObject(p, { x: 10.26, y: 20, text: 'x < 4 & y', fontSize: 18, color: '#111', font: 'Patrick Hand,DejaVu Sans,sans-serif' });
    expect(o.kind).toBe('adrian-text');
    expect(serializeLayer(p)).toContain('<text x="10.3" y="20" font-size="18" fill="#111" font-family="Patrick Hand,DejaVu Sans,sans-serif">x &lt; 4 &amp; y</text>');
    expect(objectTextLines(o)).toEqual(['x < 4 & y']);
  });
  it('a tick becomes a cross at the same anchor and size, keeps its code, and swaps back', () => {
    const p = parseLayer(TICK);
    const o = p.objects[0];
    expect(markType(o)).toBe('tick');
    expect(swapMark(o)).toBe(true);
    expect(markType(o)).toBe('cross');
    expect((o.inner.match(/<path\b/g) || []).length).toBe(2);
    expect(o.inner).toContain('rotate(2.5 100 200)');
    expect(o.inner).toContain('>B1</text>');
    // s = (100 − 92) / 0.8 = 10 → the cross starts at x − 7
    expect(o.inner).toContain('M 93 193.5');
    expect(swapMark(o)).toBe(true);
    expect(markType(o)).toBe('tick');
    expect((o.inner.match(/<path\b/g) || []).length).toBe(1);
  });
  it('a swapped mark makes the layer dirty (Done enables); swapping it back cleans it', () => {
    const p = parseLayer(TICK);
    expect(layerDirty(p)).toBe(false);
    swapMark(p.objects[0]);
    expect(layerDirty(p)).toBe(true);
    swapMark(p.objects[0]);
    expect(layerDirty(p)).toBe(false);
  });
  it('markType falls back to the path count on a layer stored before data-type existed', () => {
    const p = parseLayer(TICK.replace(' data-type="tick"', ''));
    expect(markType(p.objects[0])).toBe('tick');
  });
  it('record edits are the retyped or deleted notes and verdicts with a question and part', () => {
    const p = parseLayer('<g data-obj="note" data-id="n1" data-q="10" data-part="(b)" data-text="old"><text x="1" y="2">old</text></g><g data-obj="score" data-id="s1" data-q="10" data-part="(b)"><text x="1" y="2">2/3</text></g><g data-obj="note" data-id="n2" data-part="Q10(c)" data-text="strip"><text x="1" y="2">strip</text></g>');
    p.objects[0].textOverride = 'new words';
    p.objects[1].textOverride = '3/3';
    p.objects[2].deleted = true;
    expect(recordEditsFor(p)).toEqual([{ q: '10', part: '(b)', kind: 'note', text: 'new words' }]);
  });
});

