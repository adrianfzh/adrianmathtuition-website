// Picking questions by skill — docs/SKILL-PICK.md is the rule, and
// src/lib/skill-pick.fixtures.json the cases this and the Python twin
// (skill_pick.py, kinds 2 and 4) must both pass. Pure: no I/O, no Date.
//
// One per skill in syllabus order (the plainest row), then second rounds that
// add the twist (most marks) to the weighted skills first; a question is used
// once; the sheet reads skill by skill, easy to hard. An unfiled pool picks
// nothing and says so — the caller falls back to its old draw.

export type SkillRef = { id: string; name: string; order: number };

export type PickRow = {
  id: string;
  marks: number | null;
  /** skill ids this question is filed under (question_subgroups), primary or not */
  skills: string[];
  /** 0 verified human · 1 human · 2 verified AI · 3 AI (default 0) */
  tier?: number | null;
  /** 0 the requested level · 1 a top-up level (default 0) */
  pref?: number | null;
  parts?: number | null;
  school?: string | null;
};

export type PickOptions = {
  /** tie-break seed — the kiosk's daily seed, or --seed */
  seed?: string;
  /** second-round priority per skill id (higher first); nothing feeds it yet */
  weights?: Record<string, number>;
};

export type Picked<T> = { row: T; skillId: string; round: number };

export type PickResult<T> = {
  /** in sheet order: skill order, then marks ascending */
  items: Picked<T>[];
  /** skill ids not visited because count < number of skills */
  skipped: string[];
  /** skill ids with no filed row in the pool */
  empty: string[];
  /** no row carried any of the skills — nothing picked, fall back */
  unfiled: boolean;
  unfiledCount: number;
  perSkill: Record<string, number>;
};

/** FNV-1a 32-bit over the UTF-8 bytes of `seed|id` — identical in skill_pick.py. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function pickBySkill<T extends PickRow>(
  pool: T[],
  skills: SkillRef[],
  count: number,
  opts: PickOptions = {},
): PickResult<T> {
  const seed = opts.seed ?? '';
  const weights = opts.weights ?? {};
  const ordered = [...skills].sort((a, b) => a.order - b.order);
  const skillIds = new Set(ordered.map((s) => s.id));
  const n = Math.max(0, Math.floor(count));

  const filed = pool.filter((r) => (r.skills ?? []).some((id) => skillIds.has(id)));
  const unfiledCount = pool.length - filed.length;
  const empty: string[] = [];
  const perSkill: Record<string, number> = {};
  for (const s of ordered) perSkill[s.id] = 0;

  if (filed.length === 0 || n === 0) {
    return { items: [], skipped: [], empty: ordered.map((s) => s.id), unfiled: filed.length === 0, unfiledCount, perSkill };
  }

  const used = new Set<string>();
  const schools = new Set<string>();
  const items: Picked<T>[] = [];
  const hash = (r: T) => fnv1a(`${seed}|${r.id}`);
  // tier 0/1 = human (verified / not), 2/3 = AI (verified / not): the human-vs-AI
  // half ranks first, the verified half only breaks ties after marks and parts
  const ai = (r: T) => ((r.tier ?? 0) >= 2 ? 1 : 0);
  const unverified = (r: T) => ((r.tier ?? 0) % 2);
  const pref = (r: T) => r.pref ?? 0;
  const marks = (r: T) => r.marks ?? 99;
  const parts = (r: T) => r.parts ?? 0;
  const schoolPenalty = (r: T) => (r.school && schools.has(r.school) ? 1 : 0);

  const candidates = (skillId: string) => filed.filter((r) => !used.has(r.id) && r.skills.includes(skillId));
  const cmp = (keys: (r: T) => number[]) => (a: T, b: T) => {
    const ka = keys(a), kb = keys(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  };
  const plainest = cmp((r) => [ai(r), pref(r), marks(r), parts(r), unverified(r), schoolPenalty(r), hash(r)]);
  const twist = cmp((r) => [ai(r), pref(r), -marks(r), -parts(r), unverified(r), schoolPenalty(r), hash(r)]);

  const take = (r: T, skillId: string, round: number) => {
    used.add(r.id);
    if (r.school) schools.add(r.school);
    perSkill[skillId] = (perSkill[skillId] ?? 0) + 1;
    items.push({ row: r, skillId, round });
  };

  // Round 1 — one per skill, in syllabus order; only the first `count` skills are visited.
  const visited = ordered.slice(0, Math.min(n, ordered.length));
  const skipped = ordered.slice(visited.length).map((s) => s.id);
  for (const s of visited) {
    if (items.length >= n) break;
    const c = candidates(s.id).sort(plainest);
    if (c.length === 0) { empty.push(s.id); continue; }
    take(c[0], s.id, 1);
  }
  // Skills never visited but also empty in the pool are reported empty too.
  for (const s of ordered.slice(visited.length)) if (candidates(s.id).length === 0) empty.push(s.id);

  // Round 2 and on — the twist, weighted skills first, until the count is met.
  const order2 = [...visited].sort((a, b) => (weights[b.id] ?? 0) - (weights[a.id] ?? 0) || a.order - b.order);
  let round = 2;
  while (items.length < n) {
    let progressed = false;
    for (const s of order2) {
      if (items.length >= n) break;
      const c = candidates(s.id).sort(twist);
      if (c.length === 0) continue;
      take(c[0], s.id, round);
      progressed = true;
    }
    if (!progressed) break;
    round += 1;
  }

  const orderOf = new Map(ordered.map((s) => [s.id, s.order]));
  items.sort((a, b) =>
    (orderOf.get(a.skillId) ?? 99) - (orderOf.get(b.skillId) ?? 99)
    || marks(a.row) - marks(b.row)
    || hash(a.row) - hash(b.row));

  return { items, skipped, empty, unfiled: false, unfiledCount, perSkill };
}
