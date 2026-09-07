// The marker's editable layer (SPEC-ANNOTATE §14) — pure helpers, no DOM.
//
// The bot stores each annotated page's ink as an SVG body whose logical elements
// are `<g data-obj="kind" data-id data-q data-part data-text>…</g>` groups, with
// untagged fragments (static background) between them, all in the ≤1600px
// normalised page space. This module turns that body into objects the overlay can
// select / move / delete / retype, and back into a body the bot composes onto the
// hi-res original. Draw order is preserved: items keep their position in the body.
import type { Stroke } from './types';

export type LayerMeta = {
  width: number; height: number; canvasW: number; totalH: number;
  panelH: number; stripW: number; font?: string; style?: string;
};

export type LayerObj = {
  id: string;
  kind: string;
  q: string | null;
  part: string | null;
  /** The element's printed text as the marker wrote it (data-text). */
  text: string;
  /** The opening <g …> tag exactly as stored. */
  open: string;
  /** Everything between the opening tag and its matching </g>. */
  inner: string;
  dx: number;
  dy: number;
  deleted: boolean;
  /** Adrian's replacement text, applied at serialise time; null = untouched. */
  textOverride: string | null;
  /** A ✓/✗ Adrian flipped (swapMark); flipping it back clears this. */
  swapped: boolean;
};

export type LayerItem = { type: 'bg'; svg: string } | { type: 'obj'; obj: LayerObj };

export type ParsedLayer = { items: LayerItem[]; objects: LayerObj[] };

const attr = (open: string, name: string): string | null => {
  const m = open.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : null;
};

export function decodeEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Split the body into background fragments and tagged objects, in order. A tagged
 * group's end is found by depth-counting `<g` / `</g>`, because a mark's own
 * markup nests groups (rotated <g> around the glyph, a diagram's <g translate>).
 */
export function parseLayer(body: string): ParsedLayer {
  const items: LayerItem[] = [];
  const objects: LayerObj[] = [];
  let cursor = 0;
  const openRe = /<g\b[^>]*\sdata-obj="[^"]*"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(body))) {
    const start = m.index;
    const open = m[0];
    const innerStart = start + open.length;
    // find the matching </g>
    let depth = 1;
    let i = innerStart;
    const tok = /<g\b|<\/g>/g;
    tok.lastIndex = innerStart;
    let end = -1;
    let t: RegExpExecArray | null;
    while ((t = tok.exec(body))) {
      if (t[0] === '</g>') { depth -= 1; if (depth === 0) { end = t.index; break; } }
      else depth += 1;
      i = tok.lastIndex;
    }
    if (end < 0) break; // malformed — leave the rest as background
    if (start > cursor) items.push({ type: 'bg', svg: body.slice(cursor, start) });
    const obj: LayerObj = {
      id: attr(open, 'data-id') || `obj-${objects.length + 1}`,
      kind: attr(open, 'data-obj') || 'obj',
      q: attr(open, 'data-q'),
      part: attr(open, 'data-part'),
      text: attr(open, 'data-text') || '',
      open,
      inner: body.slice(innerStart, end),
      dx: 0, dy: 0, deleted: false, textOverride: null, swapped: false,
    };
    objects.push(obj);
    items.push({ type: 'obj', obj });
    cursor = end + '</g>'.length;
    openRe.lastIndex = cursor;
    void i;
  }
  if (cursor < body.length) items.push({ type: 'bg', svg: body.slice(cursor) });
  return { items, objects };
}

const TEXT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;

/** The object's visible text lines, in draw order. */
export function objectTextLines(obj: LayerObj): string[] {
  const out: string[] = [];
  for (const m of obj.inner.matchAll(TEXT_RE)) out.push(decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim());
  return out.filter(Boolean);
}
export const objectHasText = (obj: LayerObj): boolean => TEXT_RE.test(obj.inner) && (TEXT_RE.lastIndex = 0, true);

/** Wrap words to lines of at most `chars` characters (a long word stands alone). */
export function wrapText(text: string, chars: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= chars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Apply a replacement text to the object's markup. One <text> → its content is
 * replaced. Several (a wrapped note) → the first <text>'s attributes become the
 * template, lines are re-wrapped to the original longest line and laid at the
 * original line pitch; every other markup (panel rect, leader path) is kept.
 */
export function applyText(inner: string, newText: string): string {
  const texts = [...inner.matchAll(TEXT_RE)];
  if (!texts.length) return inner;
  if (texts.length === 1) {
    const [full, attrs] = texts[0];
    return inner.replace(full, `<text${attrs}>${escapeXml(newText)}</text>`);
  }
  const first = texts[0];
  const attrs = first[1];
  const ys = texts.map(t => Number((t[1].match(/\sy="([^"]+)"/) || [])[1])).filter(n => Number.isFinite(n));
  const fs = Number((attrs.match(/font-size="([^"]+)"/) || [])[1]) || 16;
  const pitch = ys.length >= 2 ? Math.abs(ys[1] - ys[0]) || fs * 1.3 : fs * 1.3;
  const longest = Math.max(12, ...texts.map(t => decodeEntities(t[2].replace(/<[^>]+>/g, '')).length));
  const lines = wrapText(newText, longest);
  const y0 = ys[0] ?? 0;
  const rebuilt = lines.map((ln, i) => `<text${attrs.replace(/\sy="[^"]+"/, ` y="${(y0 + i * pitch).toFixed(1)}"`)}>${escapeXml(ln)}</text>`).join('');
  // Drop every original <text>, put the rebuilt block where the first one was.
  let out = inner;
  for (let i = texts.length - 1; i >= 1; i--) out = out.replace(texts[i][0], '');
  return out.replace(first[0], rebuilt);
}

/** Back to an SVG body the bot can composite: deletions dropped, moves as a
 *  translate wrapper, retypes applied, background fragments untouched, order kept. */
export function serializeLayer(parsed: ParsedLayer): string {
  let out = '';
  for (const it of parsed.items) {
    if (it.type === 'bg') { out += it.svg; continue; }
    const o = it.obj;
    if (o.deleted) continue;
    const inner = o.textOverride != null ? applyText(o.inner, o.textOverride) : o.inner;
    const g = `${o.open}${inner}</g>`;
    out += o.dx || o.dy ? `<g transform="translate(${round(o.dx)} ${round(o.dy)})">${g}</g>` : g;
  }
  return out;
}
const round = (n: number) => Math.round(n * 10) / 10;

/** Has anything changed against the stored layer? */
export function layerDirty(parsed: ParsedLayer): boolean {
  return parsed.objects.some(o => o.deleted || o.dx || o.dy || o.textOverride != null || o.swapped);
}

/** Adrian's ink as SVG in the same coordinate space as the layer. */
export function strokesToSvg(strokes: Stroke[]): string {
  let out = '';
  for (const s of strokes) {
    if (!s.points.length) continue;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`).join(' ');
    const hl = s.tool === 'highlighter';
    out += `<path d="${d}" fill="none" stroke="${escapeXml(s.color)}" stroke-width="${round(s.width)}" stroke-linecap="round" stroke-linejoin="round"${hl ? ' stroke-opacity="0.38" style="mix-blend-mode:multiply"' : ''}/>`;
  }
  return out;
}

/** The standalone document the overlay renders (and the hidden measurer mounts). */
export function layerDocument(body: string, meta: LayerMeta, fontFaceCss = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.canvasW}" height="${meta.totalH}" viewBox="0 0 ${meta.canvasW} ${meta.totalH}">${fontFaceCss ? `<style>${fontFaceCss}</style>` : ''}${body}</svg>`;
}

// ── §14 step ④–⑤ helpers ─────────────────────────────────────────────────────

/** A whole-page snapshot of the layer for undo: items and objects, cloned. */
export type LayerSnapshot = { items: LayerItem[] };
export function layerSnapshot(parsed: ParsedLayer): LayerSnapshot {
  return { items: parsed.items.map(it => (it.type === 'bg' ? { type: 'bg', svg: it.svg } : { type: 'obj', obj: { ...it.obj } })) };
}
/** Put a snapshot back in place (mutates `parsed` so refs stay valid). */
export function layerRestore(parsed: ParsedLayer, snap: LayerSnapshot): void {
  parsed.items = snap.items.map(it => (it.type === 'bg' ? { type: 'bg', svg: it.svg } : { type: 'obj', obj: { ...it.obj } }));
  parsed.objects = parsed.items.flatMap(it => (it.type === 'obj' ? [it.obj] : []));
}

export const ADRIAN_TEXT_KIND = 'adrian-text';
let textSeq = 0;
/** Adrian's typed text, as a layer object like the marker's — selectable, movable,
 *  retypeable, composed by the bot and reloaded next visit. */
export function addTextObject(parsed: ParsedLayer, o: { x: number; y: number; text: string; fontSize: number; color: string; font: string }): LayerObj {
  const id = `${ADRIAN_TEXT_KIND}-${Date.now().toString(36)}-${++textSeq}`;
  const open = `<g data-obj="${ADRIAN_TEXT_KIND}" data-id="${id}" data-text="${escapeXml(o.text.slice(0, 400))}">`;
  const inner = `<text x="${round(o.x)}" y="${round(o.y)}" font-size="${round(o.fontSize)}" fill="${escapeXml(o.color)}" font-family="${escapeXml(o.font)}">${escapeXml(o.text)}</text>`;
  const obj: LayerObj = { id, kind: ADRIAN_TEXT_KIND, q: null, part: null, text: o.text, open, inner, dx: 0, dy: 0, deleted: false, textOverride: null, swapped: false };
  parsed.items.push({ type: 'obj', obj });
  parsed.objects.push(obj);
  return obj;
}

/** 'tick' | 'cross' for a mark object, from data-type or the glyph's path count. */
export function markType(obj: LayerObj): 'tick' | 'cross' | null {
  if (obj.kind !== 'mark') return null;
  const t = attr(obj.open, 'data-type');
  if (t === 'tick' || t === 'cross') return t;
  const g = obj.inner.match(/<g transform="rotate\([^"]*\)"[^>]*>([\s\S]*?)<\/g>/);
  if (!g) return null;
  const n = (g[1].match(/<path\b/g) || []).length;
  return n === 1 ? 'tick' : n === 2 ? 'cross' : null;
}

/**
 * ✓⇄✗: regenerate the other glyph at the same anchor and size. The marker draws
 * both as paths inside a rotated <g> whose transform names the anchor (x, y); the
 * radius s comes from the first path's start point (tick starts at x − 0.8s,
 * cross at x − 0.7s). The code text beside the mark is kept. Returns false when
 * the object is not a mark it can read.
 */
export function swapMark(obj: LayerObj): boolean {
  const type = markType(obj);
  if (!type) return false;
  const gm = obj.inner.match(/<g transform="rotate\([^ ]+ ([\d.-]+) ([\d.-]+)\)"([^>]*)>([\s\S]*?)<\/g>/);
  if (!gm) return false;
  const x = Number(gm[1]), y = Number(gm[2]);
  const paths = gm[4].match(/<path\b[^>]*\/>/g) || [];
  const first = paths[0] && paths[0].match(/\bd="M ([\d.-]+) /);
  if (!first) return false;
  const startX = Number(first[1]);
  const s = Math.abs(x - startX) / (type === 'tick' ? 0.8 : 0.7) || 10;
  const r = (v: number) => Math.round(v * 100) / 100;
  const glyph = type === 'tick'
    ? `<path d="M ${r(x - s * 0.7)} ${r(y - s * 0.65)} Q ${r(x + s * 0.02)} ${r(y + s * 0.02)}, ${r(x + s * 0.75)} ${r(y + s * 0.7)}"/><path d="M ${r(x + s * 0.7)} ${r(y - s * 0.7)} Q ${r(x - s * 0.02)} ${r(y + s * 0.02)}, ${r(x - s * 0.72)} ${r(y + s * 0.68)}"/>`
    : `<path d="M ${r(x - s * 0.8)} ${r(y - s * 0.05)} Q ${r(x - s * 0.5)} ${r(y + s * 0.45)}, ${r(x - s * 0.28)} ${r(y + s * 0.68)} L ${r(x + s * 0.95)} ${r(y - s * 0.8)}"/>`;
  const rest = gm[4].replace(/<path\b[^>]*\/>/g, '');
  obj.inner = obj.inner.replace(gm[0], `<g transform="rotate(${gm[0].match(/rotate\(([^ ]+) /)![1]} ${gm[1]} ${gm[2]})"${gm[3]}>${glyph}${rest}</g>`);
  const next = type === 'tick' ? 'cross' : 'tick';
  obj.open = /\sdata-type="/.test(obj.open) ? obj.open.replace(/\sdata-type="[^"]*"/, ` data-type="${next}"`) : obj.open.replace(/>$/, ` data-type="${next}">`);
  // A swap-only edit must count as an edit — Done stayed disabled on the desk
  // (8 Sep 2026) because the dirty check only knew moves, deletions and retypes.
  obj.swapped = !obj.swapped;
  return true;
}

export type RecordEdit = { q: string; part: string; kind: 'note' | 'verdict'; text: string | null };
/** The edits that must write back to the marking record (§14 ⑤): notes and
 *  verdicts the marker tied to a (question, part) that Adrian retyped or deleted. */
export function recordEditsFor(parsed: ParsedLayer): RecordEdit[] {
  const out: RecordEdit[] = [];
  for (const o of parsed.objects) {
    if ((o.kind !== 'note' && o.kind !== 'verdict') || !o.q || !o.part) continue;
    if (o.deleted) out.push({ q: o.q, part: o.part, kind: o.kind, text: null });
    else if (o.textOverride != null) out.push({ q: o.q, part: o.part, kind: o.kind, text: o.textOverride });
  }
  return out;
}

