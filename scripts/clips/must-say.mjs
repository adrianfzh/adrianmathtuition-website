// Clip pipeline — the "must say" list (Adrian, 4 Nov 2026: yes to the clip version of a short-drama
// pipeline's "must keep" list). A question clip's plan names the 1–3 things its narration MUST say
// for THIS question (the trap, why the first move is the move, a property that must be named):
//
//   "mustSay": [ { "say": "<one plain sentence>", "keys": ["<spoken words>", …] } ]   (or a bare string)
//
// The stand-in reviewer (review.mjs) is the judge: it says, item by item, whether the narration says
// it, and a missing item is a "must". `keys` are an optional cheap pre-check — short runs of SPOKEN
// words ("negative one", "never touches") that a narration saying the item will almost always
// contain; a missing key is a hint handed to the reviewer, never a verdict on its own.
// A plan with no mustSay (every clip made before 4 Nov 2026) skips all of this.

/** The plan's list, normalised to [{ say, keys }]; [] when the plan has none. */
export function mustSayItems(plan) {
  const raw = Array.isArray(plan?.mustSay) ? plan.mustSay : [];
  return raw
    .map((it) => (typeof it === 'string' ? { say: it, keys: [] } : { say: String(it?.say ?? ''), keys: Array.isArray(it?.keys) ? it.keys.map(String) : [] }))
    .filter((it) => it.say.trim());
}

const norm = (s) => ` ${String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Everything the clip says or writes in words: each beat's voice and its margin notes. */
export function spokenText(lesson) {
  return (lesson?.scenes ?? []).flatMap((sc) => (sc.beats ?? []).flatMap((b) => [b.say ?? '', ...(b.do ?? []).filter((a) => a.do === 'note').map((a) => a.text ?? '')])).join(' \n ');
}

/** The no-model pre-check: for each item, the keys the narration does not contain. */
export function precheck(items, lesson) {
  const text = norm(spokenText(lesson));
  return items.map((it, i) => ({ item: i + 1, say: it.say, keys: it.keys, missing: it.keys.filter((k) => !text.includes(norm(k))) }));
}

/** Turn the reviewer's item-by-item judgement into findings: an item not said, or not judged, is a must. */
export function mustSayFindings(items, judged) {
  const byItem = new Map((Array.isArray(judged) ? judged : []).map((j) => [Number(j.item), j]));
  return items.flatMap((it, i) => {
    const j = byItem.get(i + 1);
    if (j && j.said === true) return [];
    return [{
      beat: Number(j?.beat) || 0,
      rule: 'must say',
      severity: 'must',
      problem: j ? `The clip never says must-say item ${i + 1}: "${it.say}"${j.why ? ` (${j.why})` : ''}` : `The reviewer did not judge must-say item ${i + 1}: "${it.say}"`,
      fix: `Say it in one plain sentence at the step where it belongs${j?.beat ? ` (around beat ${j.beat})` : ''}: "${it.say}"`,
    }];
  });
}
