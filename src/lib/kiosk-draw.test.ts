import { describe, it, expect } from 'vitest';
import { dailyDraw, drawSeedKey, hashSeed, seededShuffle, sgtDate } from './kiosk-draw';

// Pool items carry their input position (= pinned id order from the RPC).
const pool = (n: number) => Array.from({ length: n }, (_, i) => i);

const KEY = drawSeedKey('AM', 'Trigonometry (Graphs)', null, '2026-07-16');

describe('sgtDate', () => {
  it('is the SGT calendar date, rolling at SGT midnight (16:00 UTC)', () => {
    expect(sgtDate(Date.UTC(2026, 6, 15, 15, 59))).toBe('2026-07-15');
    expect(sgtDate(Date.UTC(2026, 6, 15, 16, 0))).toBe('2026-07-16');
  });
});

describe('drawSeedKey', () => {
  it('null tier keys as mixed', () => {
    expect(KEY).toBe('2026-07-16|AM|Trigonometry (Graphs)|mixed');
    expect(drawSeedKey('EM', 'Vectors', 'advanced', '2026-07-16')).toBe('2026-07-16|EM|Vectors|advanced');
  });
});

describe('seededShuffle', () => {
  it('permutes without loss or duplication', () => {
    const out = seededShuffle(pool(189), hashSeed(KEY));
    expect(new Set(out).size).toBe(189);
    expect(out.length).toBe(189);
  });
  it('does not mutate its input', () => {
    const p = pool(20);
    seededShuffle(p, hashSeed(KEY));
    expect(p).toEqual(pool(20));
  });
  it('is pinned to the published algorithm (FNV-1a + mulberry32 Fisher–Yates)', () => {
    // Changing the hash or PRNG mid-day breaks the shared-sheet promise: students
    // printing before and after a deploy would get different "same-day" sheets.
    // If this fails, you changed the draw algorithm — make sure that's intended.
    expect(hashSeed(KEY)).toBe(1462421887);
    expect(seededShuffle(pool(10), hashSeed(KEY))).toEqual([9, 6, 1, 7, 2, 5, 4, 8, 0, 3]);
  });
});

describe('dailyDraw', () => {
  it('is deterministic — same seed key + input order → identical sheet (reprint)', () => {
    expect(dailyDraw(pool(189), KEY, 15)).toEqual(dailyDraw(pool(189), KEY, 15));
  });

  it('counts slice ONE shared order: draw(8) is a prefix of draw(15)', () => {
    const eight = dailyDraw(pool(189), KEY, 8);
    const fifteen = dailyDraw(pool(189), KEY, 15);
    expect(fifteen.slice(0, 8)).toEqual(eight);
  });

  it('rotates across days — different dates give different sheets', () => {
    const a = dailyDraw(pool(189), drawSeedKey('AM', 'Circles', null, '2026-07-16'), 10);
    const b = dailyDraw(pool(189), drawSeedKey('AM', 'Circles', null, '2026-07-17'), 10);
    expect(a).not.toEqual(b);
  });

  it('REGRESSION: draws from the FULL pool — rows past position 120 are reachable', () => {
    // The old route capped the pool at 120 rows in pinned id order BEFORE the
    // shuffle, so for AM 'Trigonometry (Graphs)' (189 eligible rows) positions
    // 120..188 — including the restore-verified Mayflower 2024 AM Q10 (pos 178)
    // and SCGS 2024 AM Q11 (pos 157) — could never print, on any day.
    const p = pool(189);
    const tailDrawn = new Set<number>();
    for (let day = 1; day <= 31; day++) {
      const key = drawSeedKey('AM', 'Trigonometry (Graphs)', null, `2026-08-${String(day).padStart(2, '0')}`);
      for (const q of dailyDraw(p, key, 20)) if (q >= 120) tailDrawn.add(q);
    }
    // Structurally 0 under the old pre-shuffle cap; well over half the tail
    // should surface within a month of 20-question draws.
    expect(tailDrawn.size).toBeGreaterThan(35);
    // The two starved figure questions' positions specifically:
    const augustDraws = Array.from({ length: 31 }, (_, i) =>
      dailyDraw(p, drawSeedKey('AM', 'Trigonometry (Graphs)', null, `2026-08-${String(i + 1).padStart(2, '0')}`), 20)
    ).flat();
    expect(augustDraws).toContain(157);
    expect(augustDraws).toContain(178);
  });
});
