// The GCE-shaped blueprint entries (data/paper-blueprints.json).
//
// Six entries — GCE-AM-P1/P2, GCE-EM-P1/P2, GCE-JC-P1/P2 — carry the NATIONAL
// paper's shape alongside the school-prelim ones the builder has always used
// (SEAB 4049 / 4052 / H2 9758). They ride the same schema, so the same pure
// builder walks them; these pins are the contract the builder relies on, so a
// blueprint regeneration that breaks one fails here rather than at assembly.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mulberry32, targetMarks, walkTopics, type PaperDef } from './prelim-builder';

const blueprint: { papers: Record<string, PaperDef> } = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data', 'paper-blueprints.json'), 'utf8')
);

// key → the total the real national paper is marked out of.
const GCE_TOTALS: Record<string, number> = {
  'GCE-AM-P1': 90,
  'GCE-AM-P2': 90,
  'GCE-EM-P1': 90,
  'GCE-EM-P2': 90,
  'GCE-JC-P1': 100,
  'GCE-JC-P2': 100,
};

describe('GCE paper blueprints', () => {
  for (const [key, total] of Object.entries(GCE_TOTALS)) {
    describe(key, () => {
      const paper = blueprint.papers[key];

      it('exists and is marked out of the national total', () => {
        expect(paper, `${key} missing from paper-blueprints.json`).toBeTruthy();
        expect(paper.total_marks).toBe(total);
      });

      it('has one slot per typical question', () => {
        // The builder walks slots, so the typical question count IS the slot
        // count — a mismatch silently shortens or pads the paper.
        expect(paper.slots.length).toBe(paper.question_count[1]);
        expect(paper.question_count[0]).toBeLessThanOrEqual(paper.question_count[1]);
        expect(paper.question_count[2]).toBeGreaterThanOrEqual(paper.question_count[1]);
      });

      it('can place every must_appear topic — each is in some slot pool', () => {
        const pooled = new Set(paper.slots.flatMap((s) => s.topic_pool.map((p) => p.topic)));
        for (const topic of paper.must_appear ?? []) {
          expect(pooled.has(topic), `${key}: must_appear "${topic}" is in no slot pool`).toBe(true);
        }
      });

      it('normalises every slot pool to weight 1', () => {
        for (const slot of paper.slots) {
          const sum = slot.topic_pool.reduce((a, p) => a + p.weight, 0);
          expect(sum, `${key} slot ${slot.pos}`).toBeCloseTo(1, 2);
          expect(Math.abs(sum - 1), `${key} slot ${slot.pos}`).toBeLessThan(0.005);
        }
      });

      it('walks a full topic list on any seed', () => {
        for (let seed = 1; seed <= 5; seed++) {
          const topics = walkTopics(paper, mulberry32(seed));
          expect(topics, `${key} seed ${seed}`).toHaveLength(paper.slots.length);
          expect(topics.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
        }
      });

      it('lands the paper total from the slot targets', () => {
        const targets = targetMarks(paper, { difficulty: 'standard' });
        expect(targets).toHaveLength(paper.slots.length);
        expect(targets.reduce((a, b) => a + b, 0)).toBe(paper.total_marks);
      });
    });
  }
});
