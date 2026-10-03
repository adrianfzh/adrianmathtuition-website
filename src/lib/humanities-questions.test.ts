import { describe, it, expect } from 'vitest';
import { stripEvidence } from './humanities-bench';
import { allSets, setsFor, HUMANITIES_SKILLS, SOURCE_SKILLS, questionById, questionsBySkill, levelsMax, modelAnswer, seededAnswers, schemeFor, CLAIM_TAGS, rulesFor, tagsFor, isStructured } from './humanities-questions';

describe('the humanities bank', () => {
  it('Social Studies source-based: 30 questions, five per source skill', () => {
    const sets = setsFor('social-studies', 'source');
    const all = sets.flatMap(s => s.questions);
    expect(all.length).toBe(30);
    for (const skill of SOURCE_SKILLS) expect(all.filter(q => q.skill === skill).length).toBe(5);
  });

  it('H2: five structured sets (two parts each) and five History source sets', () => {
    const sr = setsFor('social-studies', 'structured');
    expect(sr.length).toBe(5);
    for (const set of sr) {
      expect(set.questions.map(q => q.skill)).toEqual(['sr_explain', 'sr_weigh']);
      expect(set.sources.length).toBe(1);
    }
    const hist = setsFor('history');
    expect(hist.length).toBe(5);
    for (const set of hist) {
      expect(set.kind).toBe('source');
      expect(set.questions.length).toBe(3);
      for (const q of set.questions) expect(SOURCE_SKILLS).toContain(q.skill);
    }
    expect(questionsBySkill('sr_explain').length).toBe(5);
  });

  it('every question id is unique across the three files', () => {
    const all = allSets().flatMap(s => s.questions);
    expect(all.length).toBe(55);
    expect(new Set(all.map(q => q.id)).size).toBe(55);
    expect(new Set(allSets().map(s => s.id)).size).toBe(allSets().length);
  });

  it('the bench can take one subject or one kind at a time', () => {
    expect(seededAnswers({ subject: 'history' }).length).toBe(35);
    expect(seededAnswers({ kind: 'structured' }).length).toBe(21);
    expect(seededAnswers({ subject: 'social-studies', kind: 'source' }).length).toBe(46);
  });

  it('a structured question is read by its own rules and tags', () => {
    expect(isStructured('sr_weigh')).toBe(true);
    expect(isStructured('how_far')).toBe(false);
    expect(tagsFor('sr_explain').map(t => t.key)).toEqual(['point', 'example', 'link', 'not_explained', 'weighs']);
    expect(tagsFor('reliability')).toBe(CLAIM_TAGS);
    expect(rulesFor('sr_explain').join(' ')).toMatch(/own knowledge/);
    expect(rulesFor('inference').join(' ')).not.toMatch(/extract/);
  });

  it('a seeded structured answer never quotes — the truth-free strip test skips it', () => {
    for (const a of seededAnswers({ kind: 'structured' })) expect(stripEvidence(a.text), a.questionId).toBeNull();
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
    expect(seededAnswers().length).toBe(102);
  });

  it('the model answer of a seeded question is its top answer', () => {
    const ctx = questionById('s01-q1')!;
    expect(modelAnswer(ctx.question)).toBe(ctx.question.seeded!.find(s => s.level === 4)!.text);
  });

  it('inference and "explain two ways" have three levels, the others four; four source tags', () => {
    expect(levelsMax('inference')).toBe(3);
    expect(levelsMax('sr_explain')).toBe(3);
    for (const s of HUMANITIES_SKILLS.filter(k => k !== 'inference' && k !== 'sr_explain')) expect(levelsMax(s)).toBe(4);
    expect(CLAIM_TAGS.map(t => t.key)).toEqual(['from_source', 'not_supported', 'uses_context', 'evaluates']);
  });
});
