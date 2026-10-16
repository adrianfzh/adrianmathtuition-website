// A twin's PART skills, copied from its seed (17 Oct 2026, Adrian: yes — SPEC-PART-SKILLS.md §Twins).
//
// A twin keeps its seed's parts, labels and marks (SPEC-TWINS.md §1), so when the seed's parts are
// already labelled in `question_part_subgroups`, the twin's parts test the same sub-skills. This copies
// those rows to the twin — but only when the leaf parts really line up: the same part paths and the
// same marks on every one. Otherwise nothing is copied and the bot filer's part re-tag labels the twin.
// Never touches `question_subgroups` (the main sub-skill — what twins are counted by).
//
// Used by every publish path: scripts/twins/twin.mjs, scripts/science-twins/sci-stwin.mjs, and the
// cloud door src/lib/twin-store.ts (maths); and by scripts/twins/part-labels-backfill.mjs for the old twins.

export const SOURCE = 'twin-from-seed';

function partsOf(q) {
  let parts = q && q.parts;
  if (typeof parts === 'string') { try { parts = JSON.parse(parts); } catch { parts = null; } }
  return Array.isArray(parts) ? parts.filter((p) => p && typeof p === 'object') : [];
}
const kids = (p) => [...(Array.isArray(p.subparts) ? p.subparts : []), ...(Array.isArray(p.parts) ? p.parts : [])].filter((c) => c && typeof c === 'object');
function partMarks(p) {
  if (p.marks != null && Number.isFinite(Number(p.marks))) return Number(p.marks);
  const below = kids(p).map(partMarks).filter((m) => m != null);
  return below.length ? below.reduce((a, b) => a + b, 0) : null;
}

/** Leaf parts as {path, marks} — the SAME paths the bot filer writes (bot lib/filing-reader.js leafParts). */
export function leafParts(q) {
  const top = partsOf(q);
  if (top.length < 2) return [];
  const out = [];
  const walk = (list, prefix) => list.forEach((p, i) => {
    const lab = String(p.label == null || String(p.label).trim() === '' ? `#${i + 1}` : p.label).replace(/^\(|\)$/g, '').trim();
    const path = prefix ? `${prefix}.${lab}` : lab;
    const k = kids(p);
    if (k.length) walk(k, path); else out.push({ path, marks: partMarks(p) });
  });
  walk(top, '');
  return out;
}

/**
 * The rows to copy, or why not. Pure.
 * twin, seed: question rows with `parts`. seedRows: the seed's question_part_subgroups rows.
 */
export function seedPartLabelRows(twin, seed, seedRows) {
  if (!seedRows || !seedRows.length) return { rows: [], why: 'seed has no part labels' };
  const t = leafParts(twin), s = leafParts(seed);
  if (!t.length) return { rows: [], why: 'twin has fewer than two parts' };
  const key = (l) => l.map((p) => `${p.path}=${p.marks ?? '?'}`).sort().join('|');
  if (t.length !== s.length || key(t) !== key(s)) return { rows: [], why: 'parts or marks differ from the seed' };
  const paths = new Set(t.map((p) => p.path));
  const marks = new Map(t.map((p) => [p.path, p.marks]));
  if (seedRows.some((r) => !paths.has(r.part_path))) return { rows: [], why: "a seed label names a part the twin does not have" };
  return {
    rows: seedRows.map((r) => ({
      question_id: twin.id, part_path: r.part_path, subgroup_id: r.subgroup_id, marks: marks.get(r.part_path) ?? r.marks ?? null,
      confidence: r.confidence ?? null, reason: `copied from seed ${seed.id}`, source: SOURCE,
    })),
    why: null,
  };
}

/**
 * Copy the seed's part labels onto a just-published twin. Best effort: never throws, so a publish
 * never fails over it. `sb` is a supabase-js client for the twin's bank. Returns {copied, why}.
 */
export async function copySeedPartLabels(sb, twinId, seedId) {
  try {
    if (!twinId || !seedId) return { copied: 0, why: 'no seed' };
    const { data: seedRows, error: e1 } = await sb.from('question_part_subgroups').select('part_path, subgroup_id, marks, confidence').eq('question_id', seedId);
    if (e1) return { copied: 0, why: e1.message };
    if (!seedRows?.length) return { copied: 0, why: 'seed has no part labels' };
    const { data: qs, error: e2 } = await sb.from('questions').select('id, parts').in('id', [twinId, seedId]);
    if (e2) return { copied: 0, why: e2.message };
    const twin = qs?.find((q) => q.id === twinId), seed = qs?.find((q) => q.id === seedId);
    if (!twin || !seed) return { copied: 0, why: 'row not found' };
    const { rows, why } = seedPartLabelRows(twin, seed, seedRows);
    if (!rows.length) return { copied: 0, why };
    const { error: e3 } = await sb.from('question_part_subgroups').upsert(rows, { onConflict: 'question_id,part_path' });
    if (e3) return { copied: 0, why: e3.message };
    return { copied: rows.length, why: null };
  } catch (e) {
    return { copied: 0, why: String(e?.message ?? e) };
  }
}
