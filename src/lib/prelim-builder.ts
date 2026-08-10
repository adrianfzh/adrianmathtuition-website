// Deterministic prelim-paper assembly — the TS port of the /prelim-paper skill's
// slot walk (blueprint in data/paper-blueprints.json, mined from 474 real papers).
// Pure logic only: no I/O here. The API route fetches QB candidates and calls these.

export interface PoolEntry {
  topic: string;
  weight: number;
}

export interface BlueprintSlot {
  pos: number;
  marks: [number, number];
  typ: number;
  topic_pool: PoolEntry[];
  parts?: [number, number];
  diagram_rate?: number;
}

export interface PaperDef {
  total_marks: number;
  question_count: number[];
  must_appear: string[];
  rules: { never_together: string[][]; min_distinct_topics: number };
  slots: BlueprintSlot[];
}

export interface PresetOverlay {
  mark_band?: 'upper' | 'lower';
  school_style?: string[];
  topic_weight_multipliers?: Record<string, number>;
}

export interface Preset {
  description?: string;
  applies_to?: string[];
  overlay: PresetOverlay;
}

export type Difficulty = 'standard' | 'hard';

// The candidate fields the scorer needs (subset of the QB row).
export interface Candidate {
  id: string;
  total_marks: number;
  school: string | null;
  year: number | null;
  difficulty: string | null;
  has_image: boolean | null;
  image_url: string | null;
  answer: string | null;
  has_solution: boolean;
  parts_count: number; // leaf parts incl. subparts; 1 for single-part questions
}

export interface SlotPick {
  pos: number;
  topic: string;
  target: number;
  pick: Candidate | null;
  alternates: Candidate[];
}

// Deterministic RNG so the walk is reproducible/testable from a seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Count answerable leaf parts of a QB `parts` jsonb (subparts replace their parent).
export function countParts(parts: unknown): number {
  if (!Array.isArray(parts) || parts.length === 0) return 1;
  let n = 0;
  for (const p of parts) {
    const sub = (p as { subparts?: unknown[] })?.subparts;
    n += Array.isArray(sub) && sub.length > 0 ? sub.length : 1;
  }
  return Math.max(1, n);
}

// Preset overlay: multiply matching topics' weights in every slot pool.
// Weighted sampling doesn't need normalized weights, so no renormalize step.
export function applyPreset(paper: PaperDef, overlay: PresetOverlay | undefined): PaperDef {
  const mult = overlay?.topic_weight_multipliers;
  if (!mult) return paper;
  return {
    ...paper,
    slots: paper.slots.map((s) => ({
      ...s,
      topic_pool: s.topic_pool.map((p) => ({
        topic: p.topic,
        weight: p.weight * (mult[p.topic] ?? 1),
      })),
    })),
  };
}

function weightedSample(pool: PoolEntry[], rng: () => number): string {
  const total = pool.reduce((a, p) => a + p.weight, 0);
  let r = rng() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.topic;
  }
  return pool[pool.length - 1].topic;
}

// Slot walk: sample one topic per slot from its (overlaid) pool, subject to
// distinctness, must_appear placement, and never_together pairs. Musts are
// RESERVED slots up front (scarcest-eligibility first, slot weighted by the
// must's own pool weight there) and excluded from natural sampling, so each
// must appears exactly once by construction. Retries on dead-ends.
export function walkTopics(paper: PaperDef, rng: () => number, maxTries = 80): string[] {
  const banned = new Map<string, string[]>();
  for (const pair of paper.rules.never_together) {
    for (const t of pair) banned.set(t, pair.filter((x) => x !== t));
  }
  const mustSet = new Set(paper.must_appear);

  for (let attempt = 0; attempt < maxTries; attempt++) {
    // 1) Reserve a slot for each must topic, scarcest eligibility first.
    const eligible = new Map<string, number[]>();
    for (const m of paper.must_appear) {
      eligible.set(
        m,
        paper.slots
          .map((s, i) => (s.topic_pool.some((p) => p.topic === m) ? i : -1))
          .filter((i) => i >= 0)
      );
    }
    const musts = [...paper.must_appear].sort(
      (a, b) => eligible.get(a)!.length - eligible.get(b)!.length
    );
    const reserved = new Map<number, string>();
    let ok = true;
    for (const m of musts) {
      const free = eligible.get(m)!.filter((i) => !reserved.has(i));
      if (free.length === 0) {
        ok = false;
        break;
      }
      const weights = free.map(
        (i) => paper.slots[i].topic_pool.find((p) => p.topic === m)!.weight
      );
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      let sel = free[free.length - 1];
      for (let k = 0; k < free.length; k++) {
        r -= weights[k];
        if (r <= 0) {
          sel = free[k];
          break;
        }
      }
      reserved.set(sel, m);
    }
    if (!ok) continue;

    // 2) Walk the slots; reserved slots take their must, others sample freely.
    const used = new Set<string>();
    const excluded = new Set<string>();
    const chosen: string[] = [];
    for (let i = 0; i < paper.slots.length; i++) {
      const slot = paper.slots[i];
      let topic: string;
      if (reserved.has(i)) {
        topic = reserved.get(i)!;
        if (excluded.has(topic)) {
          ok = false; // a never_together partner landed earlier
          break;
        }
      } else {
        let pool = slot.topic_pool.filter(
          (p) => !used.has(p.topic) && !excluded.has(p.topic) && !mustSet.has(p.topic)
        );
        // EM pools legitimately repeat topics; fall back to reuse only when the
        // unused pool is exhausted (musts stay single-appearance either way).
        if (pool.length === 0) {
          pool = slot.topic_pool.filter(
            (p) => !excluded.has(p.topic) && !mustSet.has(p.topic)
          );
        }
        if (pool.length === 0) {
          ok = false;
          break;
        }
        topic = weightedSample(pool, rng);
      }
      used.add(topic);
      chosen.push(topic);
      for (const b of banned.get(topic) ?? []) excluded.add(b);
    }

    if (!ok) continue;
    // min_distinct_topics was mined over the QUESTIONS' topic arrays (a QB
    // question carries several topics), so it can exceed the slot count
    // (EM-P2: 10 distinct over 9 slots). At walk level, enforce the cap.
    if (used.size < Math.min(paper.rules.min_distinct_topics, paper.slots.length)) continue;
    return chosen;
  }
  throw new Error('walkTopics: could not satisfy blueprint constraints');
}

// Per-slot mark targets. Standard = the blueprint's typicals (they sum to the
// paper total for every mined paper). Hard/upper shifts weight into the heavy
// slots and out of the light ones, net zero, always inside each slot's band.
export function targetMarks(
  paper: PaperDef,
  opts: { difficulty: Difficulty; markBand?: 'upper' | 'lower' }
): number[] {
  const targets = paper.slots.map((s) => s.typ);
  const sum = targets.reduce((a, b) => a + b, 0);
  // Safety: if typicals drift from the total (future blueprint regen), nudge greedily.
  let drift = paper.total_marks - sum;
  while (drift !== 0) {
    const dir = Math.sign(drift);
    const idx = paper.slots.findIndex((s, i) =>
      dir > 0 ? targets[i] < s.marks[1] : targets[i] > s.marks[0]
    );
    if (idx === -1) break;
    targets[idx] += dir;
    drift -= dir;
  }

  const wantUpper = opts.difficulty === 'hard' || opts.markBand === 'upper';
  const wantLower = opts.markBand === 'lower';
  if (!wantUpper && !wantLower) return targets;

  // Net-zero transfer: raise the highest-headroom slots, lower the lightest ones.
  const shifts = Math.floor(paper.slots.length / 3);
  for (let k = 0; k < shifts; k++) {
    const order = paper.slots.map((s, i) => i);
    const upIdx = order
      .filter((i) => targets[i] < paper.slots[i].marks[1])
      .sort((a, b) => paper.slots[b].typ - paper.slots[a].typ)[0];
    const downIdx = order
      .filter((i) => targets[i] > paper.slots[i].marks[0] && i !== upIdx)
      .sort((a, b) => paper.slots[a].typ - paper.slots[b].typ)[0];
    if (upIdx === undefined || downIdx === undefined) break;
    if (wantUpper) {
      targets[upIdx] += 1;
      targets[downIdx] -= 1;
    } else {
      targets[upIdx] -= 1;
      targets[downIdx] += 1;
    }
  }
  return targets;
}

// Candidate scoring. Mark closeness dominates; recency, key-completeness and
// school spread matter; in hard mode, fewer parts per mark (less scaffolding)
// and the (weak) QB difficulty label add on top.
export function scoreCandidate(
  q: Candidate,
  ctx: {
    target: number;
    difficulty: Difficulty;
    usedSchools: Set<string>;
    schoolStyle?: string[];
  }
): number {
  let s = 0;
  s -= Math.abs(q.total_marks - ctx.target) * 3;
  if (q.year) s += Math.max(0, q.year - 2015) * 0.3;
  if (q.answer) s += 1.5;
  if (q.has_solution) s += 1.5;
  if (q.school && ctx.usedSchools.has(q.school)) s -= 5;
  if (q.has_image && !q.image_url) s -= 100; // needs a diagram it doesn't have
  if (ctx.schoolStyle && q.school && ctx.schoolStyle.includes(q.school)) s += 1.5;
  if (ctx.difficulty === 'hard') {
    s += (q.total_marks / q.parts_count) * 0.8; // structure bias: chunkier parts
    if (q.difficulty === 'Challenging') s += 2;
    if (q.difficulty === 'Advanced') s += 1;
  }
  return s;
}

export function pickForSlot(
  candidates: Candidate[],
  ctx: {
    target: number;
    difficulty: Difficulty;
    usedSchools: Set<string>;
    usedIds: Set<string>;
    schoolStyle?: string[];
  },
  rng: () => number
): { pick: Candidate | null; alternates: Candidate[] } {
  const scored = candidates
    .filter((c) => !ctx.usedIds.has(c.id))
    .map((c) => ({ c, s: scoreCandidate(c, ctx) }))
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) return { pick: null, alternates: [] };
  // Small top-k randomness so a reroll actually varies.
  const k = Math.min(3, scored.length);
  const pick = scored[Math.floor(rng() * k)].c;
  const alternates = scored
    .map((x) => x.c)
    .filter((c) => c.id !== pick.id)
    .slice(0, 6);
  return { pick, alternates };
}

// Land the exact paper total by swapping picks for alternates inside slot bands.
export function landTotal(picks: SlotPick[], totalTarget: number): { landed: boolean } {
  const sum = () =>
    picks.reduce((a, p) => a + (p.pick ? p.pick.total_marks : 0), 0);
  for (let iter = 0; iter < 40 && sum() !== totalTarget; iter++) {
    const diff = totalTarget - sum(); // >0: need more marks
    let best: { slot: SlotPick; alt: Candidate; gain: number } | null = null;
    for (const slot of picks) {
      if (!slot.pick) continue;
      for (const alt of slot.alternates) {
        const delta = alt.total_marks - slot.pick.total_marks;
        if (delta === 0 || Math.sign(delta) !== Math.sign(diff)) continue;
        if (Math.abs(delta) > Math.abs(diff)) continue; // never overshoot
        if (!best || Math.abs(delta) > Math.abs(best.gain)) best = { slot, alt, gain: delta };
      }
    }
    if (!best) break;
    const old = best.slot.pick!;
    best.slot.alternates = [old, ...best.slot.alternates.filter((a) => a.id !== best!.alt.id)];
    best.slot.pick = best.alt;
  }
  return { landed: sum() === totalTarget };
}
