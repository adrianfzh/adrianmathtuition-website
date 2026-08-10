import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyPreset,
  countParts,
  landTotal,
  mulberry32,
  pickForSlot,
  targetMarks,
  walkTopics,
  type Candidate,
  type PaperDef,
  type SlotPick,
} from './prelim-builder';

type BlueprintFile = {
  papers: Record<string, PaperDef>;
  presets: Record<string, { overlay: Record<string, unknown> }>;
};

const blueprint: BlueprintFile = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data', 'paper-blueprints.json'), 'utf8')
);

describe('walkTopics', () => {
  it('honours must_appear and min_distinct_topics on every paper over many seeds', () => {
    for (const [key, paper] of Object.entries(blueprint.papers)) {
      for (let seed = 1; seed <= 50; seed++) {
        const topics = walkTopics(paper, mulberry32(seed));
        expect(topics).toHaveLength(paper.slots.length);
        for (const m of paper.must_appear) {
          expect(topics, `${key} seed ${seed} must include ${m}`).toContain(m);
        }
        // min_distinct is mined over question topic ARRAYS, so it can exceed
        // the slot count (EM-P2: 10 over 9 slots) — the walk enforces the cap.
        expect(new Set(topics).size).toBeGreaterThanOrEqual(
          Math.min(paper.rules.min_distinct_topics, paper.slots.length)
        );
        // every choice must come from its own slot's pool
        topics.forEach((t, i) => {
          expect(
            paper.slots[i].topic_pool.some((p) => p.topic === t),
            `${key} seed ${seed} slot ${i + 1} chose off-pool topic ${t}`
          ).toBe(true);
        });
      }
    }
  });
});

describe('targetMarks', () => {
  it('sums to the paper total in every mode', () => {
    for (const paper of Object.values(blueprint.papers)) {
      for (const difficulty of ['standard', 'hard'] as const) {
        const t = targetMarks(paper, { difficulty });
        expect(t.reduce((a, b) => a + b, 0)).toBe(paper.total_marks);
        t.forEach((m, i) => {
          expect(m).toBeGreaterThanOrEqual(paper.slots[i].marks[0]);
          expect(m).toBeLessThanOrEqual(paper.slots[i].marks[1]);
        });
      }
    }
  });

  it('hard mode shifts weight upward relative to standard on heavy slots', () => {
    const paper = blueprint.papers['AM-P2'];
    const std = targetMarks(paper, { difficulty: 'standard' });
    const hard = targetMarks(paper, { difficulty: 'hard' });
    const heaviest = paper.slots.reduce((mi, s, i) => (s.typ > paper.slots[mi].typ ? i : mi), 0);
    expect(hard[heaviest]).toBeGreaterThanOrEqual(std[heaviest]);
    expect(hard.reduce((a, b) => a + b, 0)).toBe(std.reduce((a, b) => a + b, 0));
  });
});

describe('applyPreset', () => {
  it('multiplies matching topic weights and leaves others alone', () => {
    const paper = blueprint.papers['AM-P2'];
    const boosted = applyPreset(paper, {
      topic_weight_multipliers: { Logarithms: 2 },
    });
    const before = paper.slots[0].topic_pool.find((p) => p.topic === 'Logarithms')!.weight;
    const after = boosted.slots[0].topic_pool.find((p) => p.topic === 'Logarithms')!.weight;
    expect(after).toBeCloseTo(before * 2);
    const otherBefore = paper.slots[0].topic_pool.find((p) => p.topic === 'Polynomials')!.weight;
    const otherAfter = boosted.slots[0].topic_pool.find((p) => p.topic === 'Polynomials')!.weight;
    expect(otherAfter).toBeCloseTo(otherBefore);
  });
});

describe('countParts', () => {
  it('counts leaves with subparts replacing their parent', () => {
    expect(countParts(null)).toBe(1);
    expect(countParts([])).toBe(1);
    expect(countParts([{ text: 'a' }, { text: 'b' }])).toBe(2);
    expect(
      countParts([{ text: 'a', subparts: [{ text: 'i' }, { text: 'ii' }] }, { text: 'b' }])
    ).toBe(3);
  });
});

function cand(id: string, marks: number, extra: Partial<Candidate> = {}): Candidate {
  return {
    id,
    total_marks: marks,
    school: extra.school ?? `School ${id}`,
    year: extra.year ?? 2025,
    difficulty: extra.difficulty ?? 'Standard',
    has_image: extra.has_image ?? false,
    image_url: extra.image_url ?? null,
    answer: extra.answer ?? 'ans',
    has_solution: extra.has_solution ?? true,
    parts_count: extra.parts_count ?? 3,
  };
}

describe('pickForSlot', () => {
  it('never picks an already-used question and punishes missing diagrams', () => {
    const rng = mulberry32(7);
    const cands = [
      cand('a', 9),
      cand('b', 9, { has_image: true, image_url: null }), // unusable
      cand('c', 9),
    ];
    const { pick } = pickForSlot(
      cands,
      { target: 9, difficulty: 'standard', usedSchools: new Set(), usedIds: new Set(['a']), schoolStyle: undefined },
      rng
    );
    expect(pick?.id).toBe('c');
  });
});

describe('landTotal', () => {
  it('swaps alternates within bands to hit the exact total', () => {
    const picks: SlotPick[] = [
      { pos: 1, topic: 'T1', target: 6, pick: cand('p1', 5), alternates: [cand('a1', 6)] },
      { pos: 2, topic: 'T2', target: 9, pick: cand('p2', 9), alternates: [cand('a2', 8)] },
    ];
    const { landed } = landTotal(picks, 15);
    expect(landed).toBe(true);
    expect(picks.reduce((a, p) => a + p.pick!.total_marks, 0)).toBe(15);
  });

  it('reports landed=false when no swap can close the gap', () => {
    const picks: SlotPick[] = [
      { pos: 1, topic: 'T1', target: 6, pick: cand('p1', 5), alternates: [] },
    ];
    const { landed } = landTotal(picks, 9);
    expect(landed).toBe(false);
  });
});
