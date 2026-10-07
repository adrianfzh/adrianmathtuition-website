import { describe, it, expect } from 'vitest';
import { stripEvidence } from './humanities-bench';
import { caseStudyProblems, quotedPieces } from './humanities-case-study';
import { geographyProblems } from './humanities-geography';
import { caseStudies, isCaseStudy, SS_THEMES, maxOf, isPointsQuestion, tableText, allSets, setsFor, HUMANITIES_SKILLS, SOURCE_SKILLS, questionById, questionsBySkill, levelsMax, modelAnswer, seededAnswers, schemeFor, CLAIM_TAGS, rulesFor, tagsFor, isStructured } from './humanities-questions';

describe('the humanities bank', () => {
  it('Social Studies single questions: 30, five per source skill', () => {
    const sets = setsFor('social-studies', 'source').filter(s => !isCaseStudy(s));
    const all = sets.flatMap(s => s.questions);
    expect(all.length).toBe(30);
    // 'surprise' lives in the case studies only.
    for (const skill of SOURCE_SKILLS.filter(k => k !== 'surprise')) expect(all.filter(q => q.skill === skill).length).toBe(5);
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
    expect(all.length).toBe(55 + caseStudies().length * 5 + setsFor('geography').flatMap(s => s.questions).length);
    expect(new Set(all.map(q => q.id)).size).toBe(all.length);
    expect(new Set(allSets().map(s => s.id)).size).toBe(allSets().length);
  });

  it('the bench can take one subject or one kind at a time', () => {
    expect(seededAnswers({ subject: 'history' }).length).toBe(35);
    expect(seededAnswers({ kind: 'structured' }).length).toBe(21);
    const inCaseStudies = caseStudies().flatMap(s => s.questions).flatMap(q => q.seeded ?? []).length;
    expect(seededAnswers({ subject: 'social-studies', kind: 'source' }).length).toBe(46 + inCaseStudies);
    expect(seededAnswers({ sets: ['s01'] }).length).toBe(12);
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
      if (!isPointsQuestion(q)) expect(schemeFor(q.skill), q.id).not.toBeNull();
    }
  });

  it('every question has a model answer to fold under the report', () => {
    for (const set of allSets()) for (const q of set.questions) {
      expect((modelAnswer(q) ?? '').length, q.id).toBeGreaterThan(40);
    }
  });

  it('a seeded question has one answer at every level of its scheme', () => {
    for (const set of allSets()) for (const q of set.questions) {
      if (!q.seeded || isPointsQuestion(q)) continue;
      const max = levelsMax(q.skill);
      expect(q.seeded.map(s => s.level).sort(), q.id).toEqual(Array.from({ length: max }, (_, i) => i + 1));
    }
    expect(seededAnswers().filter(a => a.subject !== 'geography' && !questionById(a.questionId)!.set.background).length).toBe(102);
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

describe('the Social Studies case studies (A1)', () => {
  it('every case study is fit to list', () => {
    expect(caseStudies().length).toBeGreaterThan(0);
    expect(caseStudies().flatMap(caseStudyProblems)).toEqual([]);
  });

  it('a case study is 35 marks, read with every source in view', () => {
    for (const set of caseStudies()) {
      expect(set.questions.reduce((n, q) => n + (q.marks ?? 0), 0), set.id).toBe(35);
      const ctx = questionById(set.questions[0].id)!;
      expect(ctx.inView.length, set.id).toBe(set.sources.length);
      expect(ctx.sources.length, set.id).toBe(set.questions[0].sources.length);
    }
    // A single question keeps only its named sources in view.
    const single = questionById('s01-q1')!;
    expect(single.inView).toEqual(single.sources);
  });

  it('the three issues stay within two sets of each other', () => {
    const n = SS_THEMES.map(t => caseStudies().filter(s => s.theme === t).length);
    if (caseStudies().length >= 6) expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(2);
  });

  it('the checker catches a quotation that is not in the sources, and a wrong shape', () => {
    const set = structuredClone(caseStudies()[0]);
    set.questions[1].seeded![1].text += " B also says 'the council never listens to us'.";
    set.questions[4].marks = 8;
    const problems = caseStudyProblems(set).join(' | ');
    expect(problems).toMatch(/quotes 'the council never listens to us'/);
    expect(problems).toMatch(/question 5 is not the 10-mark/);
  });

  it('an apostrophe inside a word is not a quotation mark', () => {
    expect(quotedPieces("The resident's bill changed: 'Only my bill has changed'. It doesn't help.")).toEqual(['Only my bill has changed']);
  });
});

describe('Geography, point-marked (B)', () => {
  it('every Geography set is fit to list', () => {
    expect(setsFor('geography').length).toBeGreaterThan(0);
    expect(setsFor('geography').flatMap(geographyProblems)).toEqual([]);
  });

  it('a point-marked question tops out at its marks, and its seeded answers run from 0', () => {
    const ctx = questionById('g01-q1')!;
    expect(ctx.set.kind).toBe('points');
    expect(maxOf(ctx.question)).toBe(4);
    expect(ctx.scheme.levels).toEqual([]);
    expect(ctx.question.seeded!.map(s => s.level)).toEqual([0, 1, 2, 3, 4]);
    expect(maxOf(questionById('s01-q1')!.question)).toBe(4);
    expect(maxOf(questionById('s11-q1')!.question)).toBe(3);
    expect(seededAnswers({ subject: 'geography' }).length).toBeGreaterThan(30);
  });

  it('a data table reaches the reader as plain lines', () => {
    const t = questionById('g01-q2')!.question.table!;
    expect(tableText(t).split('\n')[0]).toBe('Year | Arrivals (millions)');
    expect(tableText(t)).toMatch(/2019 \| 8\.1/);
  });

  it('the checker catches points that cannot reach full marks', () => {
    const set = structuredClone(setsFor('geography')[0]);
    set.questions[0].marks = 6; set.questions[0].points = set.questions[0].points!.slice(0, 2);
    expect(geographyProblems(set).join(' | ')).toMatch(/reach only 4 of 6 marks/);
  });
});
