import { describe, it, expect } from 'vitest';
import { allSets, HUMANITIES_SKILLS, questionById, questionsBySkill, levelsMax, modelAnswer, seededAnswers, schemeFor, CLAIM_TAGS } from './humanities-questions';

describe('the humanities bank', () => {
  it('holds 30 questions, five per skill', () => {
    const all = allSets().flatMap(s => s.questions);
    expect(all.length).toBe(30);
    for (const skill of HUMANITIES_SKILLS) expect(questionsBySkill(skill).length).toBe(5);
    expect(new Set(all.map(q => q.id)).size).toBe(30);
  });

  it('every question names sources its set has, and a skill with a scheme', () => {
    for (const set of allSets()) for (const q of set.questions) {
      const ctx = questionById(q.id);
      expect(ctx, q.id).not.toBeNull();
      expect(ctx!.sources.length, q.id).toBe(q.sources.length);
      expect(schemeFor(q.skill), q.id).not.toBeNull();
    }
  });

  it('every question has a model answer to fold under the report', () => {
    for (const set of allSets()) for (const q of set.questions) {
      expect((modelAnswer(q) ?? '').length, q.id).toBeGreaterThan(40);
    }
  });

  it('a seeded question has one answer at every level of its scheme', () => {
    for (const set of allSets()) for (const q of set.questions) {
      if (!q.seeded) continue;
      const max = levelsMax(q.skill);
      expect(q.seeded.map(s => s.level).sort(), q.id).toEqual(Array.from({ length: max }, (_, i) => i + 1));
    }
    expect(seededAnswers().length).toBe(46);
  });

  it('the model answer of a seeded question is its top answer', () => {
    const ctx = questionById('s01-q1')!;
    expect(modelAnswer(ctx.question)).toBe(ctx.question.seeded!.find(s => s.level === 4)!.text);
  });

  it('inference has three levels, the others four; four claim tags', () => {
    expect(levelsMax('inference')).toBe(3);
    for (const s of HUMANITIES_SKILLS.filter(k => k !== 'inference')) expect(levelsMax(s)).toBe(4);
    expect(CLAIM_TAGS.map(t => t.key)).toEqual(['from_source', 'not_supported', 'uses_context', 'evaluates']);
  });
});
