// What the website's compose-page proxy forwards to the bot's /api/compose-page.
//
// Kept as a pure function so a test can pin that every field the overlay sends
// survives the hop: on 8 Sep 2026 the proxy forwarded the layer, ink, strokes
// and record edits but dropped markSwaps, so the desk's "your ink says
// otherwise" hint (SPEC-ANNOTATE §14 ⑥) never fired — the bot's hint rule was
// only ever handed an empty list.

export type MarkSwap = { q: string; x: number; y: number; to: 'tick' | 'cross' };

export type ComposeForwardBody = {
  runId: string;
  photoIndex: number;
  layerSvg: string;
  inkSvg: string;
  strokes?: unknown[];
  recordEdits?: unknown[];
  markSwaps?: MarkSwap[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Swaps as the overlay sends them, with anything malformed dropped rather than
 *  passed on: a swap needs a question, a finite centre and a ✓/✗ direction. */
export function sanitiseMarkSwaps(raw: unknown): MarkSwap[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: MarkSwap[] = [];
  for (const s of raw) {
    if (!isRecord(s)) continue;
    const q = s.q == null ? '' : String(s.q);
    const x = Number(s.x), y = Number(s.y);
    const to = s.to;
    if (!q || !Number.isFinite(x) || !Number.isFinite(y) || (to !== 'tick' && to !== 'cross')) continue;
    out.push({ q, x, y, to });
  }
  return out;
}

export function composeForwardBody(input: {
  runId: string; photoIndex: number; layerSvg: string; inkSvg: string;
  strokes?: unknown; recordEdits?: unknown; markSwaps?: unknown;
}): ComposeForwardBody {
  return {
    runId: input.runId,
    photoIndex: input.photoIndex,
    layerSvg: input.layerSvg,
    inkSvg: input.inkSvg,
    strokes: Array.isArray(input.strokes) ? input.strokes : undefined,
    recordEdits: Array.isArray(input.recordEdits) ? input.recordEdits : undefined,
    markSwaps: sanitiseMarkSwaps(input.markSwaps),
  };
}
