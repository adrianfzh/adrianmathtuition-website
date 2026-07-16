// Deterministic daily worksheet draw (Adrian, 2026-07-16): two students printing
// the same level+topic+tier on the same SGT day get the SAME sheet — so they can
// discuss. Counts slice one shared order, so printing 8 then 15 extends (Q9–15
// are new), and a reprint is an identical copy. Seed rotates at SGT midnight.
//
// The shuffle MUST run over the FULL eligible pool, with the count slice last.
// Capping the pool before the shuffle (the old POOL_CAP=120 in the worksheet
// route) permanently starved every row past the cap in pinned id order — those
// questions could never print, on any day. The only remaining bound is the
// kiosk_pool RPC's own fetch cap (400 rows, in pinned id order).
//
// Kept out of the route file so the draw invariants are unit-testable
// (kiosk-draw.test.ts pins the exact permutation — changing the hash or PRNG
// mid-day would silently break the shared-sheet promise).

/** SGT calendar date (YYYY-MM-DD); the draw seed rotates at SGT midnight. */
export function sgtDate(now: number = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

// FNV-1a string hash → 32-bit seed.
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — tiny deterministic PRNG.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates with a seeded PRNG — same seed → same order.
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seed key for one day's draw. `tier` null = Mixed; `date` defaults to today (SGT). */
export function drawSeedKey(level: string, topic: string, tier: string | null, date: string = sgtDate()): string {
  return `${date}|${level}|${topic}|${tier ?? 'mixed'}`;
}

/** The daily draw: seeded shuffle of the WHOLE pool, then slice to count. */
export function dailyDraw<T>(pool: T[], seedKey: string, count: number): T[] {
  return seededShuffle(pool, hashSeed(seedKey)).slice(0, count);
}
