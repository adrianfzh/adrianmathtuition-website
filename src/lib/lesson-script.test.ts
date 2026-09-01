import { describe, it, expect } from 'vitest';
import {
  validateLessonScript, checkQids, sceneStepCount,
  type LessonScript, type PlayScene,
} from './lesson-script';
import {
  loadLessonScript, usableCheckAnswer, resolveCheckScene,
  type CheckQuestionRow,
} from './lesson-load';
import { LESSON_CATALOG, lessonForTopic, lessonBySlug } from './lesson-catalog';
import { checkTypedAnswer } from './notebook';

// A minimal valid script to mutate in the negative cases.
function baseScript(): Record<string, unknown> {
  return {
    slug: 'test-lesson',
    title: 'Test',
    level: 'AM',
    topic: 'Binomial Theorem',
    minutes: 3,
    scenes: [
      { type: 'title', title: 'T', promise: 'P' },
      { type: 'caption', text: 'Some $x$ text' },
    ],
  };
}

describe('validateLessonScript', () => {
  it('accepts a minimal valid script', () => {
    const r = validateLessonScript(baseScript());
    expect(r.ok).toBe(true);
  });

  it('rejects non-objects and empty scenes', () => {
    expect(validateLessonScript(null).ok).toBe(false);
    expect(validateLessonScript('x').ok).toBe(false);
    const s = baseScript();
    s.scenes = [];
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/non-empty/);
  });

  it('rejects unknown scene types', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({ type: 'hologram', text: 'nope' });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/unknown scene type "hologram"/);
  });

  it('rejects a check without qid and without why', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({ type: 'check', why: 'because' });
    (s.scenes as unknown[]).push({ type: 'check', qid: 'abc' });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/needs qid/);
      expect(r.errors.join(' ')).toMatch(/needs a one-line why/);
    }
  });

  it('rejects a graph-morph with fewer than two states or a bad window', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({
      type: 'graph-morph',
      states: [{ label: 'a', coeffs: [1] }],
      window: { xMin: 2, xMax: -2, yMin: 0, yMax: 1 },
    });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/at least two states/);
      expect(r.errors.join(' ')).toMatch(/xMin must be < xMax/);
    }
  });

  it('rejects non-finite graph coefficients', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({
      type: 'graph-morph',
      states: [{ label: 'a', coeffs: [1, 1] }, { label: 'b', coeffs: [1, Infinity] }],
      window: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/finite numbers/);
  });

  it('enforces moved-term "from" references: earlier steps only, existing ids only', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({
      type: 'equation-steps',
      steps: [
        { tokens: [{ tex: 'a', id: 'src' }, { tex: 'b', from: 'src' }] }, // same step — invalid
        { tokens: [{ tex: 'c', from: 'ghost' }] },                        // unknown id — invalid
        { tokens: [{ tex: 'd', from: 'src' }] },                          // earlier step — valid
      ],
    });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const msg = r.errors.join(' | ');
      expect(msg).toMatch(/steps\[0\].*"from" references unknown earlier token id "src"/);
      expect(msg).toMatch(/steps\[1\].*"ghost"/);
      expect(msg).not.toMatch(/steps\[2\]/);
    }
  });

  it('rejects duplicate token ids within a scene', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({
      type: 'equation-steps',
      steps: [
        { tokens: [{ tex: 'a', id: 'x' }] },
        { tokens: [{ tex: 'b', id: 'x' }] },
      ],
    });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/duplicate token id "x"/);
  });

  it('rejects annotate callouts that target a missing token id', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({
      type: 'annotate',
      tokens: [{ tex: 'a', id: 'real' }],
      callouts: [{ target: 'imaginary', label: 'nope' }],
    });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/target must name an existing token id \(got "imaginary"\)/);
  });

  it('rejects bad slugs and out-of-range minutes', () => {
    const bad = baseScript();
    bad.slug = 'Not A Slug!';
    bad.minutes = 0;
    const r = validateLessonScript(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/kebab-case/);
      expect(r.errors.join(' ')).toMatch(/minutes/);
    }
  });
});

describe('sceneStepCount', () => {
  it('counts sub-steps per scene type', () => {
    expect(sceneStepCount({ type: 'title', title: 't', promise: 'p' })).toBe(1);
    expect(sceneStepCount({ type: 'caption', text: 't' })).toBe(1);
    expect(sceneStepCount({
      type: 'equation-steps',
      steps: [{ tokens: [{ tex: 'a' }] }, { tokens: [{ tex: 'b' }] }],
    })).toBe(2);
    expect(sceneStepCount({
      type: 'graph-morph',
      states: [{ label: 'a', coeffs: [1] }, { label: 'b', coeffs: [1, 1] }, { label: 'c', coeffs: [1] }],
      window: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    })).toBe(3);
    // annotate: the expression reveal + one beat per callout
    expect(sceneStepCount({
      type: 'annotate',
      tokens: [{ tex: 'a', id: 'x' }],
      callouts: [{ target: 'x', label: 'l1' }, { target: 'x', label: 'l2' }],
    })).toBe(3);
    const skipped: PlayScene = { type: 'check-skipped' };
    expect(sceneStepCount(skipped)).toBe(1);
  });
});

// ── The committed pilot ──────────────────────────────────────────────────────

describe('pilot script: binomial-theorem-am', () => {
  const script = loadLessonScript('binomial-theorem-am') as LessonScript;

  it('loads and validates', () => {
    expect(script).not.toBeNull();
    expect(script.slug).toBe('binomial-theorem-am');
  });

  it('has the planned shape: 12–14 scenes, exactly two checks, all five taught types', () => {
    expect(script.scenes.length).toBeGreaterThanOrEqual(12);
    expect(script.scenes.length).toBeLessThanOrEqual(14);
    const types = new Set(script.scenes.map(s => s.type));
    for (const t of ['title', 'caption', 'equation-steps', 'graph-morph', 'annotate', 'check']) {
      expect(types.has(t as never), `missing scene type ${t}`).toBe(true);
    }
    expect(checkQids(script)).toEqual([
      '22303d15-cdcc-4b0c-9fea-70f382242699', // GCE 2023 P2 Q1 → k = 6
      '914fe2ab-f1a0-44f8-bb9a-0b9da05af227', // Greendale 2025 P2 Q1 → a = 4
    ]);
  });

  it('graph-morph states carry the verified (1+x)^n coefficient rows', () => {
    const graph = script.scenes.find(s => s.type === 'graph-morph');
    expect(graph).toBeDefined();
    if (graph && graph.type === 'graph-morph') {
      expect(graph.states.map(s => s.coeffs)).toEqual([
        [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1],
      ]);
    }
  });

  it('grades the two checks correctly through the shared answer checker', () => {
    // The bank answers as stored: '$k = 6$' and '$a = 4$'. The player and the
    // record route both go through checkTypedAnswer — these pin the contract.
    expect(checkTypedAnswer('6', '$k = 6$')).toBe('correct');
    expect(checkTypedAnswer('k=6', '$k = 6$')).toBe('correct');
    expect(checkTypedAnswer('5', '$k = 6$')).toBe('wrong');
    expect(checkTypedAnswer('4', '$a = 4$')).toBe('correct');
    expect(checkTypedAnswer('a = 4', '$a = 4$')).toBe('correct');
    expect(checkTypedAnswer('-4', '$a = 4$')).toBe('wrong');
  });
});

describe('lesson catalog coherence', () => {
  it('every catalog row has a loadable script that agrees with it', () => {
    for (const entry of LESSON_CATALOG) {
      const script = loadLessonScript(entry.slug);
      expect(script, `script for ${entry.slug}`).not.toBeNull();
      expect(script!.slug).toBe(entry.slug);
      expect(script!.level).toBe(entry.level);
      expect(script!.topic).toBe(entry.topic);
      expect(script!.title).toBe(entry.title);
      expect(script!.minutes).toBe(entry.minutes);
    }
  });

  it('lessonForTopic finds the pilot by exact level + canonical topic only', () => {
    expect(lessonForTopic('AM', 'Binomial Theorem')?.slug).toBe('binomial-theorem-am');
    expect(lessonForTopic('EM', 'Binomial Theorem')).toBeNull();
    expect(lessonForTopic('AM', 'Binomial theorem')).toBeNull(); // exact string, by design
    expect(lessonBySlug('binomial-theorem-am')?.topic).toBe('Binomial Theorem');
    expect(lessonBySlug('nope')).toBeNull();
  });
});

// ── Check eligibility / resolution ───────────────────────────────────────────

function goodRow(): CheckQuestionRow {
  return {
    id: 'q1',
    question_text: 'Find the value of $k$.',
    answer: ' $k = 6$ ',
    solution: 'worked',
    total_marks: 5,
    deleted_at: null,
    flagged_count: 0,
    ai_generated: false,
    verified: false,
    parts: null,
  };
}

describe('usableCheckAnswer', () => {
  it('returns the trimmed answer for an eligible row', () => {
    expect(usableCheckAnswer(goodRow())).toBe('$k = 6$');
  });
  it('refuses rows the practice eligibility gate refuses', () => {
    expect(usableCheckAnswer({ ...goodRow(), deleted_at: '2026-01-01' })).toBeNull();
    expect(usableCheckAnswer({ ...goodRow(), flagged_count: 3 })).toBeNull();
    expect(usableCheckAnswer({ ...goodRow(), ai_generated: true, verified: false })).toBeNull();
    expect(usableCheckAnswer({ ...goodRow(), question_text: '', parts: null })).toBeNull();
  });
  it('refuses eligible rows without a top-level answer (solution-only rows)', () => {
    expect(usableCheckAnswer({ ...goodRow(), answer: '' })).toBeNull();
    expect(usableCheckAnswer({ ...goodRow(), answer: '   ' })).toBeNull();
  });
  it('refuses missing rows', () => {
    expect(usableCheckAnswer(null)).toBeNull();
    expect(usableCheckAnswer(undefined)).toBeNull();
  });
});

describe('resolveCheckScene', () => {
  const scene = {
    type: 'check' as const,
    qid: 'q1',
    prompt: 'Try it.',
    placeholder: 'k = ?',
    why: 'Because $-20k + 120 = 0$.',
  };

  it('resolves an eligible question into a playable check', () => {
    const r = resolveCheckScene(scene, goodRow());
    expect(r.type).toBe('check');
    if (r.type === 'check') {
      expect(r.qid).toBe('q1');
      expect(r.answer).toBe('$k = 6$');
      expect(r.markdown).toContain('Find the value of $k$.');
      expect(r.marks).toBe(5);
      expect(r.why).toBe(scene.why);
      expect(r.prompt).toBe('Try it.');
    }
  });

  it('degrades to check-skipped instead of breaking the lesson', () => {
    expect(resolveCheckScene(scene, null).type).toBe('check-skipped');
    expect(resolveCheckScene(scene, { ...goodRow(), deleted_at: 'x' }).type).toBe('check-skipped');
    expect(resolveCheckScene(scene, { ...goodRow(), answer: null }).type).toBe('check-skipped');
  });

  it('defaults prompt/placeholder to null when the script omits them', () => {
    const r = resolveCheckScene({ type: 'check', qid: 'q1', why: 'w' }, goodRow());
    if (r.type === 'check') {
      expect(r.prompt).toBeNull();
      expect(r.placeholder).toBeNull();
    }
  });
});
