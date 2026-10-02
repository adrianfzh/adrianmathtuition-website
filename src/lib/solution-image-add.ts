// A NEW solution diagram (30 Sep 2026). Adrian approved the pilot: for a
// question whose answer needs a drawing and has none, a session finds the
// school's own drawing in the paper's spare images, or draws one, and leaves it
// as a card on the Check page. Nothing is live until he taps ✓. This is where
// Approve puts it: on the part it answers when that part has no drawing yet,
// otherwise at the end of the question's solution_images. Pure — the route
// does the upload and the write.

type Rec = Record<string, unknown>;

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** "(b)(ii)", "b ii", "b.ii" → ["b", "ii"]; a bare "b" → ["b"]. */
export function splitPartLabel(label: string | null | undefined): string[] {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return [];
  const bits = s.match(/[a-z]+|\d+/g) ?? [];
  // "bii" written without a break: a single letter part then a roman sub-part.
  if (bits.length === 1 && /^[a-h](?:i{1,3}|iv|v|vi{0,3}|ix|x)$/.test(bits[0])) return [bits[0][0], bits[0].slice(1)];
  return bits;
}

export type AddResult = {
  /** Only the column that changed — the PATCH body. */
  patch: Rec;
  /** Where it went, e.g. `parts[1].solution_image` or `solution_images[2]`. */
  field: string;
};

/** Put `ref` on the question: the part named by `partLabel` when that slot is
 *  empty, else the end of solution_images. Never overwrites a drawing. */
export function addSolutionImageRef(row: Rec, ref: string, partLabel: string | null | undefined): AddResult {
  const want = splitPartLabel(partLabel);
  const parts = Array.isArray(row.parts) ? (JSON.parse(JSON.stringify(row.parts)) as Rec[]) : null;
  if (parts && want.length) {
    const i = parts.findIndex((p) => p && typeof p === 'object' && norm(p.label) === want[0]);
    if (i >= 0) {
      const p = parts[i];
      if (want.length === 1 && !p.solution_image) {
        p.solution_image = ref;
        return { patch: { parts }, field: `parts[${i}].solution_image` };
      }
      const subs = Array.isArray(p.subparts) ? (p.subparts as Rec[]) : [];
      const j = want.length > 1 ? subs.findIndex((s) => s && typeof s === 'object' && norm(s.label) === want[1]) : -1;
      if (j >= 0 && !subs[j].solution_image) {
        subs[j].solution_image = ref;
        return { patch: { parts }, field: `parts[${i}].subparts[${j}].solution_image` };
      }
    }
  }
  let list: unknown[] = [];
  const si = row.solution_images;
  if (Array.isArray(si)) list = [...si];
  else if (typeof si === 'string' && si.trim()) {
    try { const v = JSON.parse(si); if (Array.isArray(v)) list = v; } catch { list = [si]; }
  }
  list.push(ref);
  return { patch: { solution_images: list }, field: `solution_images[${list.length - 1}]` };
}
