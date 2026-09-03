import { describe, it, expect } from 'vitest';
import katex from 'katex';
import {
  mathFragments, texUnits, evalExpr, polyAt, sampledEqual, runAssertions,
  graphIssues, craftIssues, narrationIssues, answerClass, checkIssues, beatIssues,
  estimateMinutes, summarize, narrationWordCount, MAX_TOKENS_PER_LINE, BEAT_MAX_WORDS, type CheckRow,
} from './lesson-verify';
import { validateLessonScript, checkQids, type LessonScript, type GraphMorphScene } from './lesson-script';
import { loadLessonScript } from './lesson-load';
import { checkTypedAnswer } from './notebook';

// Same options the verifier script and lib/math-markdown use, but throwing.
const KATEX = { throwOnError: true, strict: false, trust: true, macros: { '\\tfrac': '\\frac', '\\usd': '\\$' } };

function script(overrides: Partial<LessonScript> = {}): LessonScript {
  const r = validateLessonScript({
    slug: 'test-lesson',
    title: 'Test',
    level: 'AM',
    topic: 'Quadratic Functions',
    minutes: 3,
    scenes: [
      { type: 'title', title: 'T', promise: 'P' },
      { type: 'caption', text: 'Some $x$ text' },
      { type: 'equation-steps', steps: [{ tokens: [{ tex: 'a', id: 's' }] }, { tokens: [{ tex: 'b', from: 's' }] }] },
      { type: 'caption', text: 'more' },
      { type: 'check', qid: 'q1', why: 'w' },
      { type: 'caption', text: 'closer' },
    ],
    ...overrides,
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.script;
}

describe('mathFragments', () => {
  it('finds inline and display fragments in order', () => {
    const { fragments, unclosed } = mathFragments('so $a+b$ then $$\\frac12$$ and $c$.');
    expect(unclosed).toBe(false);
    expect(fragments).toEqual([
      { tex: 'a+b', display: false }, { tex: '\\frac12', display: true }, { tex: 'c', display: false },
    ]);
  });
  it('treats \\$ as a literal dollar and flags an unclosed one', () => {
    expect(mathFragments('costs \\$5 and $x$').fragments).toEqual([{ tex: 'x', display: false }]);
    expect(mathFragments('oops $x is open').unclosed).toBe(true);
  });
});

describe('texUnits', () => {
  it('collects bare tokens and prose fragments, never plain-text headings', () => {
    const s = script({
      scenes: [
        { type: 'title', title: 'no $math$ here', promise: 'promise $p$' },
        { type: 'caption', heading: '$h$', text: '$a$ and $b$' },
        { type: 'annotate', heading: 'H', intro: '$i$', tokens: [{ tex: 't1', id: 'x' }], callouts: [{ target: 'x', label: 'call $c$' }] },
      ],
    });
    const { units, issues } = texUnits(s);
    expect(issues).toEqual([]);
    expect(units.map(u => u.tex)).toEqual(['p', 'a', 'b', 'i', 't1', 'c']);
  });
  it('reports an unclosed dollar as an error', () => {
    const s = script({ scenes: [{ type: 'title', title: 'T', promise: 'open $x' }] });
    expect(texUnits(s).issues[0]).toMatchObject({ severity: 'error', where: 'scenes[0] (title).promise' });
  });
});

describe('evalExpr (safe arithmetic)', () => {
  it('follows paper precedence: -2^2 = -4, ^ is right-associative', () => {
    expect(evalExpr('-2^2 + 7')).toBe(3);
    expect(evalExpr('2^3^2')).toBe(512);
    expect(evalExpr('2**10')).toBe(1024);
  });
  it('multiplies by juxtaposition', () => {
    expect(evalExpr('2x', { x: 3 })).toBe(6);
    expect(evalExpr('-3(x-2)^2 + 8', { x: 2 })).toBe(8);
    expect(evalExpr('(x+1)(x-1)', { x: 4 })).toBe(15);
    expect(evalExpr('5/2 x', { x: 4 })).toBe(10);
  });
  it('handles fractions, functions and constants', () => {
    expect(evalExpr('C(5,3) * 2^2 * 3^3')).toBe(1080);
    expect(evalExpr('choose(6,4) * 2^4')).toBe(240);
    expect(evalExpr('sqrt(16) + abs(-2) + fact(4)')).toBe(30);
    expect(evalExpr('-17/16')).toBeCloseTo(-1.0625, 12);
    expect(evalExpr('2 pi', {})).toBeCloseTo(2 * Math.PI, 12);
    expect(evalExpr('3 × 4 − 1')).toBe(11);
  });
  it('rejects anything that is not arithmetic — no eval underneath', () => {
    expect(() => evalExpr('process.exit(1)')).toThrow();
    expect(() => evalExpr('y + 1')).toThrow(/unknown symbol "y"/);
    expect(() => evalExpr('foo(2)')).toThrow(/unknown function/);
    expect(() => evalExpr('2 +')).toThrow();
    expect(() => evalExpr('1.2.3')).toThrow(/malformed number/);
    expect(() => evalExpr('C(2, 5)')).toThrow();
  });
});

describe('sampledEqual + runAssertions', () => {
  it('accepts identities and rejects near-misses', () => {
    expect(sampledEqual(x => (x - 2) ** 2 - 4, x => x * x - 4 * x).ok).toBe(true);
    expect(sampledEqual(x => (x - 2) ** 2 - 4, x => x * x - 4 * x + 1).ok).toBe(false);
  });
  it('runs equals / equiv / state assertions from the scene', () => {
    const graph: GraphMorphScene = {
      type: 'graph-morph',
      states: [{ label: 'a', coeffs: [0, 0, 1] }, { label: 'b', coeffs: [4, -4, 1] }],
      window: { xMin: -2, xMax: 6, yMin: -6, yMax: 8 },
    };
    const s = script({
      scenes: [
        { ...graph, verify: [{ expr: '(x-2)^2', state: 1 }, { expr: 'x^2', state: 1 }] },
        { type: 'caption', text: 'c', verify: [{ expr: '-9/4 + 2', equals: '-1/4' }, { expr: '(x-3/2)^2 - 1/4', equiv: 'x^2 - 3x + 2' }, { expr: '1/0', equals: 1 }] },
        { type: 'caption', text: 'bad', verify: [{ expr: 'x' }, 'not an object'] },
      ] as unknown as LessonScript['scenes'],
    });
    const r = runAssertions(s);
    expect(r.map(a => a.ok)).toEqual([true, false, true, true, false, false, false]);
    expect(r[1].detail).toMatch(/differs at x=/);
    expect(r[5].detail).toMatch(/exactly one of/);
    expect(r[6].detail).toMatch(/must be an object/);
  });
  it('state assertions only apply to graph-morph scenes', () => {
    const s = script({ scenes: [{ type: 'caption', text: 'c', verify: [{ expr: 'x', state: 0 }] }] as unknown as LessonScript['scenes'] });
    expect(runAssertions(s)[0]).toMatchObject({ ok: false, detail: expect.stringMatching(/graph-morph/) });
  });
});

describe('graphIssues', () => {
  const base: GraphMorphScene = {
    type: 'graph-morph',
    states: [{ label: 'a', coeffs: [0, 0, 1] }, { label: 'b', coeffs: [0, -4, 1] }],
    window: { xMin: -2, xMax: 6, yMin: -6, yMax: 8 },
  };
  it('is quiet on a well-framed morph', () => {
    expect(graphIssues(base, 'g').filter(i => i.severity !== 'info')).toEqual([]);
  });
  it('errors when a curve never enters the window, warns on off-screen turning points and crowded ranges', () => {
    const issues = graphIssues({
      ...base,
      states: [{ label: 'far', coeffs: [100, 0, 1] }, { label: 'shifted', coeffs: [0, -40, 1] }],
      window: { xMin: -20, xMax: 20, yMin: -50, yMax: 50 },
    }, 'g');
    expect(issues.some(i => i.severity === 'error' && /never enters/.test(i.message))).toBe(true);
    expect(issues.some(i => i.severity === 'warn' && /turning point/.test(i.message))).toBe(true);
    expect(issues.some(i => i.severity === 'warn' && /x-range/.test(i.message))).toBe(true);
  });
  it('polyAt reads coefficients constant-first, like the player', () => {
    expect(polyAt([1, 2, 3], 2)).toBe(1 + 4 + 12);
  });
});

describe('craftIssues', () => {
  it('is clean on the well-formed base script', () => {
    expect(craftIssues(script()).filter(i => i.severity === 'error')).toEqual([]);
  });
  it('requires an exact canonical topic for the level', () => {
    expect(craftIssues(script({ topic: 'Quadratic functions' })).some(i => i.severity === 'error' && i.where === 'topic')).toBe(true);
    expect(craftIssues(script({ level: 'XX' })).some(i => i.severity === 'error' && i.where === 'level')).toBe(true);
  });
  it('flags math in plain-text fields and over-long token lines', () => {
    const s = script({
      scenes: [
        { type: 'title', title: 'T', promise: 'p' },
        { type: 'caption', heading: 'about $x$', text: 't' },
        { type: 'equation-steps', steps: [{ tokens: Array.from({ length: MAX_TOKENS_PER_LINE + 1 }, () => ({ tex: 'a' })) }] },
        { type: 'caption', text: 'end' },
      ],
    });
    const issues = craftIssues(s);
    expect(issues.some(i => i.severity === 'error' && i.where === 'scenes[1].heading')).toBe(true);
    expect(issues.some(i => i.severity === 'warn' && /tokens on one line/.test(i.message))).toBe(true);
  });
  it('wants teaching before the first check, no back-to-back checks, and a caption closer', () => {
    const s = script({
      scenes: [
        { type: 'title', title: 'T', promise: 'p' },
        { type: 'check', qid: 'a', why: 'w' },
        { type: 'check', qid: 'b', why: 'w' },
      ],
    });
    const msgs = craftIssues(s).map(i => i.message).join(' | ');
    expect(msgs).toMatch(/before scene 4/);
    expect(msgs).toMatch(/back to back/);
    expect(msgs).toMatch(/close on a caption/);
  });
});

describe('narrationIssues', () => {
  it('warns when missing, errors on TeX, and can be made mandatory', () => {
    const s = script({
      scenes: [
        { type: 'title', title: 'T', promise: 'p' },
        { type: 'caption', text: 't', narration: 'Read this aloud with enough words in it' },
        { type: 'caption', text: 't', narration: 'Too short' },
      ] as unknown as LessonScript['scenes'],
    });
    // The schema validator (lesson-script.ts) already rejects TeX in narration,
    // so the helper above cannot build that scene; plant it after validation to
    // prove the verifier's own rule fires on a raw script too.
    (s.scenes[1] as unknown as { narration: string }).narration = 'Read this $x$ aloud with enough words in it';
    const issues = narrationIssues(s);
    expect(issues.find(i => i.where === 'scenes[0].narration')?.severity).toBe('warn');
    expect(issues.find(i => i.where === 'scenes[1].narration')?.severity).toBe('error');
    expect(issues.find(i => i.where === 'scenes[2].narration')?.message).toMatch(/words/);
    expect(narrationIssues(s, { require: true }).find(i => i.where === 'scenes[0].narration')?.severity).toBe('error');
  });

  it('checks a per-step array entry by entry, naming the beat it found the problem in', () => {
    // Regression: the rule used to demand a string, so every per-step array
    // (the pilot's graph-morph / annotate / equation-steps scenes) read as
    // "must be a non-empty string" and the gate could never pass a lesson
    // whose voice is synced to the reveal.
    const s = script({
      scenes: [
        { type: 'title', title: 'T', promise: 'P' },
        {
          type: 'graph-morph',
          states: [
            { label: 'a', coeffs: [0, 0, 1] },
            { label: 'b', coeffs: [1, 0, 1] },
            { label: 'c', coeffs: [2, 0, 1] },
          ],
          window: { xMin: -2, xMax: 2, yMin: -1, yMax: 8 },
          narration: [
            'Start with the basic curve, its turning point at the origin.',
            'Lift it by one.',
            'And lift it once more, so the whole curve sits higher still.',
          ],
        },
        { type: 'caption', text: 'closer' },
      ] as unknown as LessonScript['scenes'],
    });
    // Plant TeX after validation, as above.
    (s.scenes[1] as unknown as { narration: string[] }).narration[2] = 'And lift it by $1$ once more, so it sits higher';
    const issues = narrationIssues(s, { require: true });
    expect(issues.find(i => i.where === 'scenes[1].narration')).toBeUndefined();                // never the whole array
    expect(issues.find(i => i.where === 'scenes[1].narration[0]')).toBeUndefined();
    expect(issues.find(i => i.where === 'scenes[1].narration[1]')?.severity).toBe('warn');      // 4 words — thin
    expect(issues.find(i => i.where === 'scenes[1].narration[2]')?.severity).toBe('error');     // TeX
    // Scoped to this scene: with require on, the unnarrated title and closer are errors of their own.
    expect(issues.filter(i => i.severity === 'error' && i.where.startsWith('scenes[1].narration'))).toHaveLength(1);
  });
});

describe('answerClass', () => {
  it('classifies the bank answer shapes that decide gradeability', () => {
    expect(answerClass('$k = 6$')).toBe('number');
    expect(answerClass('$(2, 8)$')).toBe('point');
    expect(answerClass('$\\left(\\frac{9}{2}, \\frac{19}{2}\\right)$')).toBe('point');
    expect(answerClass('$2(x+3)^2 - 7$')).toBe('expression');
    expect(answerClass('(a) $(2, 3)$ (b) $k = 17$')).toBe('multi');
    expect(answerClass('$x = 2$ or $x = 5$')).toBe('multi');
    expect(answerClass('$x = \\pm 3$')).toBe('pm');
    expect(answerClass('Shown')).toBe('shown');
  });
});

describe('checkIssues', () => {
  const good = (): CheckRow => ({
    id: 'q1', question_text: 'Find the turning point.', answer: '$(2, 8)$', solution: 'w',
    total_marks: 4, deleted_at: null, flagged_count: 0, ai_generated: false, verified: false,
    parts: null, level: 'AM', topics: ['Quadratic Functions'],
  });
  const s = script({ scenes: [
    { type: 'title', title: 'T', promise: 'p' }, { type: 'caption', text: 'a' }, { type: 'caption', text: 'b' },
    { type: 'caption', text: 'c' }, { type: 'check', qid: 'q1', why: 'w', placeholder: '(h, k)' }, { type: 'caption', text: 'z' },
  ] });
  it('passes a clean single-answer question', () => {
    expect(checkIssues(s, new Map([['q1', good()]])).filter(i => i.severity === 'error')).toEqual([]);
  });
  it('errors on missing, ineligible, answer-less, multi-part and off-level questions', () => {
    const errs = (row: CheckRow | null) => checkIssues(s, new Map(row ? [['q1', row]] : [])).filter(i => i.severity === 'error').map(i => i.message).join(' | ');
    expect(errs(null)).toMatch(/not found/);
    expect(errs({ ...good(), deleted_at: '2026-01-01' })).toMatch(/eligibility gate/);
    expect(errs({ ...good(), answer: '' })).toMatch(/no top-level/);
    expect(errs({ ...good(), answer: '(a) 2 (b) 3' })).toMatch(/multi-part/);
    expect(errs({ ...good(), answer: '$x = \\pm 2$' })).toMatch(/±/);
    expect(errs({ ...good(), level: 'EM' })).toMatch(/level EM/);
  });
  it('warns, not errors, on symbolic answers and off-topic rows', () => {
    const issues = checkIssues(s, new Map([['q1', { ...good(), answer: '$2(x+1)^2 - 3$', topics: ['Polynomials'] }]]));
    expect(issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(issues.map(i => i.message).join(' | ')).toMatch(/symbolic/);
    expect(issues.map(i => i.message).join(' | ')).toMatch(/do not include/);
  });
});

describe('summarize + estimateMinutes', () => {
  it('counts by severity and paces the pilot to a believable length', () => {
    expect(summarize([{ severity: 'error', where: 'a', message: 'm' }, { severity: 'warn', where: 'a', message: 'm' }])).toEqual({ errors: 1, warnings: 1, infos: 0 });
    const pilot = loadLessonScript('binomial-theorem-am') as LessonScript;
    // The pilot is narrated (~1,000 spoken words): the clips set the pace, so the
    // estimate tracks the narrated runtime and the declared minutes, not the beats.
    expect(estimateMinutes(pilot)).toBeGreaterThanOrEqual(6);
    expect(estimateMinutes(pilot)).toBeLessThanOrEqual(9);
    expect(Math.abs(estimateMinutes(pilot) - pilot.minutes)).toBeLessThanOrEqual(2);
    // Strip the narration and the silent beat estimate comes back.
    const silent = {
      ...pilot,
      scenes: pilot.scenes.map(sc => {
        const { narration: _n, audio: _a, ...rest } = sc as unknown as Record<string, unknown>;
        return rest as unknown as LessonScript['scenes'][number];
      }),
    } as LessonScript;
    expect(estimateMinutes(silent)).toBeGreaterThanOrEqual(2);
    expect(estimateMinutes(silent)).toBeLessThanOrEqual(6);
  });
});

// ── The second lesson, drafted with the phase-2 pipeline ─────────────────────

describe('beats (verifier craft rules)', () => {
  const beatScript = (scenes: unknown[]) => script({ scenes: scenes as unknown as LessonScript['scenes'] });
  const line = (tex: string, id?: string, from?: string) => ({ tex, ...(id ? { id } : {}), ...(from ? { from } : {}) });

  it('checks each beat\'s say: TeX is an error, over ~40 words a warning, too thin a warning', () => {
    const s = beatScript([
      { type: 'title', title: 'T', promise: 'P', beats: [
        { say: 'Welcome to the lesson, this is a fine opening line.', do: [] },
        { say: 'Too short', do: [] },
        { say: Array(BEAT_MAX_WORDS + 1).fill('word').join(' '), do: [] },
      ] },
      { type: 'caption', text: 'closer', beats: [{ say: 'And a closer that is long enough.', do: [] }] },
    ]);
    (s.scenes[0] as unknown as { beats: { say: string }[] }).beats[0].say = 'Welcome to $x$';
    const issues = narrationIssues(s, { require: true });
    expect(issues.find(i => i.where === 'scenes[0].beats[0].say')?.severity).toBe('error');
    expect(issues.find(i => i.where === 'scenes[0].beats[1].say')?.message).toMatch(/too thin/);
    expect(issues.find(i => i.where === 'scenes[0].beats[2].say')?.message).toMatch(/a beat is one idea/);
    expect(issues.find(i => i.where === 'scenes[0].narration')).toBeUndefined(); // never "missing" — the beats speak
    expect(narrationWordCount(s)).toBeGreaterThan(BEAT_MAX_WORDS);
  });

  it('warns about lines, callouts and states no beat ever shows, and actions cued into the tail', () => {
    const s = beatScript([
      { type: 'title', title: 'T', promise: 'P', beats: [{ say: 'Opening words that are long enough.', do: [] }] },
      { type: 'equation-steps', steps: [{ tokens: [line('a', 'a')] }, { tokens: [line('b', 'b')] }, { tokens: [line('c', 'c')] }],
        beats: [
          { say: 'Write the first line only, then.', do: [{ do: 'write', step: 0 }, { do: 'highlight', token: 'a', at: 0.95 }] },
          { say: 'Write the second by its token.', do: [{ do: 'write', token: 'b' }] },
        ] },
      { type: 'annotate', tokens: [line('x', 'x')], callouts: [{ target: 'x', label: 'one' }, { target: 'x', label: 'two' }],
        beats: [{ say: 'Name the first part only here.', do: [{ do: 'reveal', callout: 0 }] }] },
      { type: 'graph-morph', states: [{ label: 'a', coeffs: [0, 0, 1] }, { label: 'b', coeffs: [1, 0, 1] }, { label: 'c', coeffs: [2, 0, 1] }],
        window: { xMin: -2, xMax: 2, yMin: -1, yMax: 8 },
        beats: [{ say: 'Lift it once, and leave it there.', do: [{ do: 'morph', state: 1 }] }] },
      { type: 'caption', text: 'One.\n\nTwo.', beats: [{ say: 'Write only the first paragraph here.', do: [{ do: 'write', text: 'text', para: 0 }] }] },
      { type: 'caption', text: 'closer', beats: [{ say: 'A closer with no actions at all.', do: [] }] },
    ]);
    const issues = beatIssues(s);
    const w = (where: string) => issues.find(i => i.where === where);
    expect(w('scenes[1].steps[0]')).toBeUndefined();
    expect(w('scenes[1].steps[1]')).toBeUndefined();               // shown through its token
    expect(w('scenes[1].steps[2]')?.severity).toBe('warn');
    expect(w('scenes[1].beats[0].do[1]')?.message).toMatch(/last tenth/);
    expect(w('scenes[2].tokens')?.severity).toBe('warn');          // expression never written
    expect(w('scenes[2].callouts[1]')?.severity).toBe('warn');
    expect(w('scenes[3].states[2]')?.severity).toBe('warn');
    expect(w('scenes[4].text')?.message).toMatch(/some paragraphs/);
    expect(w('scenes[5]')?.message).toMatch(/no actions at all/);
    expect(w('scenes[5].beats[0]')?.severity).toBe('info');
    expect(w('beats')?.message).toMatch(/7 beats across 6 scenes/);
  });

  it('KaTeX units include a note\'s inline maths; craft ids addressed by beats are not "never flown from"', () => {
    const s = beatScript([
      { type: 'title', title: 'T', promise: 'P', beats: [{ say: 'Opening words that are long enough.', do: [] }] },
      { type: 'equation-steps', steps: [{ tokens: [line('x^2', 'sq')] }, { tokens: [line('y', 'k')] }],
        beats: [{ say: 'Write the line and note the half.', do: [{ do: 'write', step: 0 }, { do: 'note', text: 'half of $\\tfrac{3}{2}$', near: 'sq' }, { do: 'write', step: 1 }, { do: 'mark', kind: 'box', token: 'k' }] }] },
      { type: 'caption', text: 'closer', beats: [{ say: 'A closer with words enough.', do: [] }] },
    ]);
    const { units } = texUnits(s);
    expect(units.find(u => u.where === 'scenes[1] (equation-steps).beats[0].do[1].text $1')?.tex).toBe('\\tfrac{3}{2}');
    const craft = craftIssues(s);
    expect(craft.filter(i => /never flown from/.test(i.message))).toEqual([]);
  });
});

describe('quadratic-functions-am (drafted via the authoring pipeline)', () => {
  const lesson = loadLessonScript('quadratic-functions-am') as LessonScript;

  it('loads, validates and keeps the pilot shape', () => {
    expect(lesson).not.toBeNull();
    expect(lesson.level).toBe('AM');
    expect(lesson.topic).toBe('Quadratic Functions');
    const types = new Set(lesson.scenes.map(s => s.type));
    for (const t of ['title', 'caption', 'equation-steps', 'graph-morph', 'annotate', 'check']) {
      expect(types.has(t as never), `missing scene type ${t}`).toBe(true);
    }
    expect(checkQids(lesson)).toEqual([
      '296472a0-a5bc-4a34-8f07-53cdc5c8dd27', // Crescent Girls 2023 P1 Q3 → (2, 8)
      '0551c757-00c0-4030-a305-df135ff9674c', // Mayflower 2022 P2 Q1 → (2, 13)
    ]);
  });

  it('renders every TeX unit through KaTeX and trips no craft errors', () => {
    const { units, issues } = texUnits(lesson);
    expect(issues).toEqual([]);
    expect(units.length).toBeGreaterThan(100);
    for (const u of units) {
      expect(() => katex.renderToString(u.tex, { ...KATEX, displayMode: u.display }), u.where).not.toThrow();
    }
    expect(craftIssues(lesson).filter(i => i.severity === 'error')).toEqual([]);
    expect(craftIssues(lesson).filter(i => i.severity === 'warn')).toEqual([]);
  });

  it('every numeric claim in the script holds (verify lists)', () => {
    const results = runAssertions(lesson);
    expect(results.length).toBeGreaterThanOrEqual(12);
    for (const r of results) expect(r.ok, `${r.where}: ${r.detail}`).toBe(true);
  });

  it('graph-morph states are the labelled curves, inside the window', () => {
    const graph = lesson.scenes.find(s => s.type === 'graph-morph') as GraphMorphScene;
    expect(graph.states.map(s => s.coeffs)).toEqual([[0, 0, 1], [4, -4, 1], [0, -4, 1], [-1, 4, -1]]);
    expect(graphIssues(graph, 'g').filter(i => i.severity !== 'info')).toEqual([]);
  });

  it('carries spoken narration on every scene, free of TeX — as beats, with no craft warnings', () => {
    expect(narrationIssues(lesson, { require: true }).filter(i => i.severity === 'error')).toEqual([]);
    expect(narrationIssues(lesson, { require: true }).filter(i => i.severity === 'warn')).toEqual([]);
    expect(beatIssues(lesson).filter(i => i.severity !== 'info')).toEqual([]);
    expect(estimateMinutes(lesson)).toBeGreaterThanOrEqual(7);
    expect(estimateMinutes(lesson)).toBeLessThanOrEqual(10);
  });

  it('grades its two turning-point checks through the shared answer checker', () => {
    // Bank answers as stored: '$(2, 8)$' and '$(2, 13)$'.
    expect(checkTypedAnswer('(2, 8)', '$(2, 8)$')).toBe('correct');
    expect(checkTypedAnswer('2,8', '$(2, 8)$')).toBe('correct');
    expect(checkTypedAnswer('(2, -8)', '$(2, 8)$')).toBe('wrong');
    expect(checkTypedAnswer('(2, 13)', '$(2, 13)$')).toBe('correct');
    expect(checkTypedAnswer('(-2, 13)', '$(2, 13)$')).toBe('wrong');
  });
});
