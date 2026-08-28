import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyPreset,
  bleedOverlay,
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

describe('bleedOverlay', () => {
  const blueprintTopics = [
    'Kinematics',
    'Differentiation (Maximum and Minimum)',
    'Linear Law',
    'Logarithms',
    'Binomial Theorem',
    'Circles',
    'Trigonometry (R-Formula)',
  ];

  it('matches free-text marker topics to blueprint names, crediting multi-topic rows to each', () => {
    const overlay = bleedOverlay(
      [
        { topic: 'Kinematics — distance vs displacement', marks_lost: '4', marks_total: '5' },
        { topic: 'Kinematics with trigonometric functions', marks_lost: 6, marks_total: 18 },
        { topic: 'Differentiation — stationary points and their nature (maxima/minima)', marks_lost: 6, marks_total: 6 },
        { topic: 'Linear law / logarithms and straight-line graphs', marks_lost: 5, marks_total: 11 },
        { topic: 'Binomial Theorem', marks_lost: 4, marks_total: 41 },
        { topic: 'Circle geometry — tangent–chord and similar triangles', marks_lost: 4, marks_total: 5 },
        { topic: 'Completely unrelated free text', marks_lost: 9, marks_total: 9 },
      ],
      blueprintTopics
    );
    expect(overlay['Kinematics']).toBe(1.5); // 10 lost = the max
    expect(overlay['Differentiation (Maximum and Minimum)']).toBeCloseTo(1.3);
    expect(overlay['Linear Law']).toBeCloseTo(1.25);
    expect(overlay['Logarithms']).toBeCloseTo(1.25); // multi-topic row credits both
    expect(overlay['Binomial Theorem']).toBeCloseTo(1.2);
    expect(overlay['Circles']).toBeCloseTo(1.2); // 'circle' prefix-matches 'circles'
    expect(overlay['Trigonometry (R-Formula)']).toBeUndefined();
  });

  it('returns an empty overlay when nothing matches or no marks were lost', () => {
    expect(bleedOverlay([], blueprintTopics)).toEqual({});
    expect(
      bleedOverlay([{ topic: 'Mensuration', marks_lost: 0, marks_total: 5 }], blueprintTopics)
    ).toEqual({});
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

// ── JC (H2 9758) blueprint entries — derived 2026-08-28 ──────────────────────
// JC mocks are NOT enabled anywhere yet (MOCK_LEVELS stays EM/AM; the admin
// builder's level→bank mapping is unmade). These pin the structural contract
// of the derived entries so enabling JC later is a UI decision, not a data one.
// Mirrors JC_STATS_RE in scripts/derive-paper-blueprints.mjs.
const JC_STATS_RE =
  /^(Probability|Permutations and Combinations|Hypothesis Testing|Linear Regression|Sampling Methods|Distributions \()/;

describe('JC blueprint entries', () => {
  it('exist, parse as PaperDef, and keep the TS-builder slot contract', () => {
    for (const key of ['JC-P1', 'JC-P2']) {
      const paper = blueprint.papers[key];
      expect(paper, `${key} present`).toBeDefined();
      expect(paper.total_marks).toBe(100); // H2 9758: both papers are 100 marks
      expect(paper.slots.length).toBe(paper.question_count[1]);
      for (const slot of paper.slots) {
        // one slot per numeric pos — walkTopics and the reroll endpoint cannot
        // take the derivation script's merged "a-b" pos ranges
        expect(typeof slot.pos, `${key} slot pos numeric`).toBe('number');
        expect(slot.marks[0]).toBeLessThanOrEqual(slot.marks[1]);
        expect(slot.typ).toBeGreaterThanOrEqual(slot.marks[0]);
        expect(slot.typ).toBeLessThanOrEqual(slot.marks[1]);
        const w = slot.topic_pool.reduce((a, p) => a + p.weight, 0);
        expect(Math.abs(w - 1), `${key} slot ${slot.pos} weights sum to 1`).toBeLessThan(0.005);
      }
      // slot typicals land the paper total exactly (targetMarks starts here)
      expect(paper.slots.reduce((a, s) => a + s.typ, 0)).toBe(paper.total_marks);
    }
  });

  it('JC-P2 is positionally sectioned: pure slots, then stats slots, 40/60', () => {
    const paper = blueprint.papers['JC-P2'] as PaperDef & { section_boundary: number };
    const b = paper.section_boundary;
    expect(b).toBeGreaterThan(1);
    expect(b).toBeLessThanOrEqual(paper.slots.length);
    let pure = 0;
    let stats = 0;
    for (const slot of paper.slots) {
      const isStatsSlot = slot.pos >= b;
      if (isStatsSlot) stats += slot.typ;
      else pure += slot.typ;
      for (const p of slot.topic_pool) {
        expect(
          JC_STATS_RE.test(p.topic),
          `slot ${slot.pos} pool topic "${p.topic}" must sit on its own side of the boundary`
        ).toBe(isStatsSlot);
      }
    }
    expect(pure).toBe(40); // Section A: Pure Mathematics
    expect(stats).toBe(60); // Section B: Probability and Statistics
    // and every walked topic sequence respects the boundary too
    for (let seed = 1; seed <= 25; seed++) {
      const topics = walkTopics(paper, mulberry32(seed));
      topics.forEach((t, i) => {
        expect(JC_STATS_RE.test(t), `seed ${seed} slot ${i + 1}`).toBe(i + 1 >= b);
      });
    }
  });

  it('slot mark bands can land the exact paper total via landTotal swaps', () => {
    for (const key of ['JC-P1', 'JC-P2']) {
      const paper = blueprint.papers[key];
      const lo = paper.slots.reduce((a, s) => a + s.marks[0], 0);
      const hi = paper.slots.reduce((a, s) => a + s.marks[1], 0);
      expect(lo, `${key} bands reach down to the total`).toBeLessThanOrEqual(paper.total_marks);
      expect(hi, `${key} bands reach up to the total`).toBeGreaterThanOrEqual(paper.total_marks);
      // worst case: every pick opens at the bottom of its band with alternates
      // covering the band — landTotal must climb to exactly total_marks
      const picks: SlotPick[] = paper.slots.map((s, i) => ({
        pos: s.pos,
        topic: 'T',
        target: s.typ,
        pick: cand(`p-${key}-${i}`, s.marks[0]),
        alternates: Array.from({ length: s.marks[1] - s.marks[0] }, (_, k) =>
          cand(`a-${key}-${i}-${k}`, s.marks[0] + k + 1)
        ),
      }));
      const { landed } = landTotal(picks, paper.total_marks);
      expect(landed, `${key} lands ${paper.total_marks}`).toBe(true);
      expect(picks.reduce((a, p) => a + p.pick!.total_marks, 0)).toBe(paper.total_marks);
    }
  });
});
