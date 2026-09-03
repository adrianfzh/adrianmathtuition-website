import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateLessonScript, checkQids, sceneStepCount,
  narrationAt, narrationLayout, nextNarrationAudio, nextNarrationCue, lessonHasAudio, isLessonAudioUrl,
  isLessonTimingUrl, classifyPlayRejection,
  NARRATION_MAX_CHARS,
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

// ── Narration (the voice track) ──────────────────────────────────────────────

describe('narration validation', () => {
  const annotate = () => ({
    type: 'annotate',
    tokens: [{ tex: 'a', id: 'x' }],
    callouts: [{ target: 'x', label: 'one' }, { target: 'x', label: 'two' }], // 3 steps
  });

  it('accepts a whole-scene string and a per-step array of exactly the step count', () => {
    const s = baseScript();
    (s.scenes as Record<string, unknown>[])[1].narration = 'Plain spoken English, no maths markup.';
    (s.scenes as unknown[]).push({ ...annotate(), narration: ['the expression', 'first callout', 'second callout'] });
    expect(validateLessonScript(s).ok).toBe(true);
  });

  it('rejects TeX in narration and over-long beats', () => {
    const s = baseScript();
    (s.scenes as Record<string, unknown>[])[1].narration = 'Say $x^2$ aloud';
    (s.scenes as Record<string, unknown>[])[0].narration = 'a'.repeat(NARRATION_MAX_CHARS + 1);
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/scenes\[1\]\.narration: .*no TeX/);
      expect(r.errors.join(' ')).toMatch(/scenes\[0\]\.narration: .*601 chars/);
    }
  });

  it('rejects a per-step array whose length is not the step count', () => {
    const s = baseScript();
    (s.scenes as unknown[]).push({ ...annotate(), narration: ['only', 'two'] });
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/exactly 3 entries \(one per sub-step\), got 2/);
  });

  it('rejects audio without narration, shape mismatches and off-site URLs', () => {
    const s = baseScript();
    const scenes = s.scenes as Record<string, unknown>[];
    scenes[0].audio = '/lessons/test-lesson/scene-01.mp3';                                  // no narration
    scenes[1].narration = 'text';
    scenes[1].audio = ['/lessons/test-lesson/scene-02.mp3'];                                // array for a string
    scenes.push({ ...annotate(), narration: ['a', 'b', 'c'], audio: '/lessons/test-lesson/scene-03.mp3' }); // string for an array
    scenes.push({ type: 'caption', text: 't', narration: 'x', audio: 'http://example.com/a.mp3' });          // not https
    scenes.push({ type: 'caption', text: 't', narration: 'x', audio: '/other/a.mp3' });                       // outside /lessons/
    scenes.push({ type: 'caption', text: 't', narration: 'x', audio: '/lessons/test-lesson/../x.mp3' });      // traversal
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const msg = r.errors.join(' | ');
      expect(msg).toMatch(/scenes\[0\]: audio needs narration text/);
      expect(msg).toMatch(/scenes\[1\]: audio must be a single URL/);
      expect(msg).toMatch(/scenes\[2\]: audio must be an array/);
      expect(msg).toMatch(/scenes\[3\]\.audio: must be a \/lessons\/<slug>\/… path or an https URL/);
      expect(msg).toMatch(/scenes\[4\]\.audio: /);
      expect(msg).toMatch(/scenes\[5\]\.audio: /);
    }
  });

  it('isLessonAudioUrl admits committed clips and https only', () => {
    expect(isLessonAudioUrl('/lessons/binomial-theorem-am/scene-07-3.mp3')).toBe(true);
    expect(isLessonAudioUrl('/lessons/x/scene-01.m4a')).toBe(true);
    expect(isLessonAudioUrl('https://cdn.example.com/voice/scene-01.mp3')).toBe(true);
    expect(isLessonAudioUrl('http://cdn.example.com/voice/scene-01.mp3')).toBe(false);
    expect(isLessonAudioUrl('/lessons/x/scene-01.mp3?v=2')).toBe(false);
    expect(isLessonAudioUrl('/lessons/x/scene-01.txt')).toBe(false);
    expect(isLessonAudioUrl('lessons/x/scene-01.mp3')).toBe(false);
    expect(isLessonAudioUrl('https://')).toBe(false);
    expect(isLessonAudioUrl(42)).toBe(false);
  });

  it('timing sidecars: same shape as audio, null allowed per step, .timing.json beside the clip', () => {
    const s = baseScript();
    const scenes = s.scenes as Record<string, unknown>[];
    scenes[1].narration = 'text';
    scenes[1].audio = '/lessons/test-lesson/scene-02.mp3';
    scenes[1].timing = '/lessons/test-lesson/scene-02.timing.json';
    scenes.push({
      ...annotate(), narration: ['a', 'b', 'c'],
      audio: ['/lessons/test-lesson/scene-03-1.mp3', '/lessons/test-lesson/scene-03-2.mp3', '/lessons/test-lesson/scene-03-3.mp3'],
      timing: ['/lessons/test-lesson/scene-03-1.timing.json', null, 'https://cdn.example.com/scene-03-3.timing.json'],
    });
    expect(validateLessonScript(s).ok).toBe(true);
  });

  it('rejects timing that does not match its audio, or names a non-sidecar', () => {
    const s = baseScript();
    const scenes = s.scenes as Record<string, unknown>[];
    scenes[1].narration = 'text';
    scenes[1].audio = '/lessons/test-lesson/scene-02.mp3';
    scenes[1].timing = ['/lessons/test-lesson/scene-02.timing.json'];                  // array for a single clip
    scenes.push({ ...annotate(), narration: ['a', 'b', 'c'],
      audio: ['/lessons/t/a.mp3', '/lessons/t/b.mp3', '/lessons/t/c.mp3'],
      timing: '/lessons/t/a.timing.json' });                                           // string for an array
    scenes.push({ ...annotate(), narration: ['a', 'b', 'c'],
      audio: ['/lessons/t/a.mp3', '/lessons/t/b.mp3', '/lessons/t/c.mp3'],
      timing: ['/lessons/t/a.timing.json', null] });                                   // wrong length
    scenes.push({ type: 'caption', text: 't', narration: 'x', audio: '/lessons/t/a.mp3', timing: '/lessons/t/a.json' });   // not .timing.json
    scenes.push({ type: 'caption', text: 't', narration: 'x', audio: '/lessons/t/a.mp3', timing: 'http://x.com/a.timing.json' }); // not https
    const r = validateLessonScript(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const msg = r.errors.join(' | ');
      expect(msg).toMatch(/scenes\[1\]: timing must be a single path/);
      expect(msg).toMatch(/scenes\[2\]: timing must be an array/);
      expect(msg).toMatch(/scenes\[3\]: timing must have one entry per audio clip \(3\), got 2/);
      expect(msg).toMatch(/scenes\[4\]\.timing: must be a \/lessons\/<slug>\/….timing.json path/);
      expect(msg).toMatch(/scenes\[5\]\.timing: /);
    }
  });

  it('isLessonTimingUrl admits committed sidecars and https only', () => {
    expect(isLessonTimingUrl('/lessons/binomial-theorem-am/scene-07-3.timing.json')).toBe(true);
    expect(isLessonTimingUrl('https://cdn.example.com/voice/scene-01.timing.json')).toBe(true);
    expect(isLessonTimingUrl('/lessons/x/scene-01.json')).toBe(false);
    expect(isLessonTimingUrl('/lessons/x/scene-01.mp3')).toBe(false);
    expect(isLessonTimingUrl('/lessons/x/../y/scene-01.timing.json')).toBe(false);
    expect(isLessonTimingUrl(null)).toBe(false);
  });
});

describe('narration helpers', () => {
  const stepsScene: PlayScene = {
    type: 'equation-steps',
    steps: [{ tokens: [{ tex: 'a' }] }, { tokens: [{ tex: 'b' }] }, { tokens: [{ tex: 'c' }] }],
    narration: ['one', 'two', 'three'],
    audio: ['/lessons/t/scene-02-1.mp3', '/lessons/t/scene-02-2.mp3', '/lessons/t/scene-02-3.mp3'],
    timing: ['/lessons/t/scene-02-1.timing.json', null, '/lessons/t/scene-02-3.timing.json'],
  };
  const sceneClip: PlayScene = {
    type: 'graph-morph',
    states: [{ label: 'a', coeffs: [1] }, { label: 'b', coeffs: [1, 1] }],
    window: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    narration: 'whole scene', audio: '/lessons/t/scene-03.mp3',
  };
  const textOnly: PlayScene = { type: 'caption', text: 't', narration: 'not synthesized yet' };
  const silent: PlayScene = { type: 'caption', text: 't' };
  const skipped: PlayScene = { type: 'check-skipped' };

  it('narrationLayout tells per-step arrays from whole-scene strings', () => {
    expect(narrationLayout(stepsScene)).toBe('steps');
    expect(narrationLayout(sceneClip)).toBe('scene');
    expect(narrationLayout(textOnly)).toBe('scene');
    expect(narrationLayout(silent)).toBe('none');
    expect(narrationLayout(skipped)).toBe('none');
  });

  it('narrationAt cues every step of an array, and only step 0 of a string', () => {
    expect(narrationAt(stepsScene, 1)).toEqual({ text: 'two', audio: '/lessons/t/scene-02-2.mp3', timing: null });
    expect(narrationAt(stepsScene, 3)).toBeNull();
    expect(narrationAt(sceneClip, 0)).toEqual({ text: 'whole scene', audio: '/lessons/t/scene-03.mp3', timing: null });
    expect(narrationAt(sceneClip, 1)).toBeNull(); // rides inside the step-0 clip
    expect(narrationAt(textOnly, 0)).toEqual({ text: 'not synthesized yet', audio: null, timing: null });
    expect(narrationAt(silent, 0)).toBeNull();
    expect(narrationAt(skipped, 0)).toBeNull();
  });

  it('narrationAt carries the declared timing sidecar (per step, or for the whole-scene clip)', () => {
    expect(narrationAt(stepsScene, 0)?.timing).toBe('/lessons/t/scene-02-1.timing.json');
    expect(narrationAt(stepsScene, 1)?.timing).toBeNull();
    expect(narrationAt(stepsScene, 2)?.timing).toBe('/lessons/t/scene-02-3.timing.json');
    const timedClip: PlayScene = { ...sceneClip, timing: '/lessons/t/scene-03.timing.json' };
    expect(narrationAt(timedClip, 0)?.timing).toBe('/lessons/t/scene-03.timing.json');
    // prefetch sees the sidecar too
    expect(nextNarrationCue([silent, stepsScene], 0, 0)).toEqual({ text: 'one', audio: '/lessons/t/scene-02-1.mp3', timing: '/lessons/t/scene-02-1.timing.json' });
  });

  it('nextNarrationAudio walks forward over silent positions to the next clip', () => {
    const scenes = [silent, stepsScene, sceneClip, textOnly, skipped];
    expect(nextNarrationAudio(scenes, 0, 0)).toBe('/lessons/t/scene-02-1.mp3');
    expect(nextNarrationAudio(scenes, 1, 0)).toBe('/lessons/t/scene-02-2.mp3');
    expect(nextNarrationAudio(scenes, 1, 2)).toBe('/lessons/t/scene-03.mp3'); // last step → next scene
    expect(nextNarrationAudio(scenes, 2, 0)).toBeNull();                    // step 1 rides the clip; nothing after
    expect(nextNarrationAudio(scenes, 4, 0)).toBeNull();
  });

  it('lessonHasAudio is false for a text-only or silent lesson', () => {
    expect(lessonHasAudio([silent, textOnly, skipped])).toBe(false);
    expect(lessonHasAudio([silent, sceneClip])).toBe(true);
    expect(lessonHasAudio([stepsScene])).toBe(true);
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

  // ── The voice track ──
  it('narrates every scene — per-step arrays wherever a scene has sub-steps', () => {
    for (const [i, scene] of script.scenes.entries()) {
      expect(scene.narration, `scene ${i} narration`).toBeDefined();
      const steps = sceneStepCount(scene as PlayScene);
      if (steps > 1) {
        expect(Array.isArray(scene.narration), `scene ${i} should narrate per step`).toBe(true);
        expect((scene.narration as string[]).length).toBe(steps);
      }
    }
  });

  it('check scenes narrate the lead-in only — never the answer', () => {
    // Bank answers: k = 6 (scene 9) and a = 4 (scene 12). Whole-word match on
    // the digit and the number word, so "2023" in "the 2023 GCE paper" is fine.
    const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const answers: Record<string, string> = {
      '22303d15-cdcc-4b0c-9fea-70f382242699': '6',
      '914fe2ab-f1a0-44f8-bb9a-0b9da05af227': '4',
    };
    for (const scene of script.scenes) {
      if (scene.type !== 'check') continue;
      const digit = answers[scene.qid];
      expect(digit, `known answer for ${scene.qid}`).toBeDefined();
      const text = Array.isArray(scene.narration) ? scene.narration.join(' ') : scene.narration ?? '';
      const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
      expect(words).not.toContain(digit);
      expect(words).not.toContain(NUMBER_WORDS[Number(digit)]);
      expect(text).toMatch(/your turn|pause here/i);
    }
  });

  it('every narrated scene has its clip committed under public/lessons/<slug>/ as a real MP3', () => {
    const publicDir = path.resolve(__dirname, '..', '..', 'public');
    let clips = 0;
    for (const [i, scene] of script.scenes.entries()) {
      if (scene.narration === undefined) continue;
      // Synthesis succeeded for the pilot: every narrated scene carries audio.
      expect(scene.audio, `scene ${i} audio`).toBeDefined();
      const urls = Array.isArray(scene.audio) ? scene.audio : [scene.audio as string];
      const texts = Array.isArray(scene.narration) ? scene.narration : [scene.narration];
      expect(urls.length).toBe(texts.length);
      for (const url of urls) {
        expect(url.startsWith(`/lessons/${script.slug}/`), `${url} lives with its lesson`).toBe(true);
        const file = path.join(publicDir, url);
        expect(fs.existsSync(file), `${url} exists in public/`).toBe(true);
        const head = Buffer.alloc(4);
        const fd = fs.openSync(file, 'r');
        fs.readSync(fd, head, 0, 4, 0);
        fs.closeSync(fd);
        // An MP3 starts with an ID3 tag or an MPEG frame sync (11 set bits).
        const isMp3 = head.toString('latin1', 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
        expect(isMp3, `${url} is an MP3`).toBe(true);
        expect(fs.statSync(file).size).toBeGreaterThan(2000);
        clips++;
      }
    }
    expect(clips).toBeGreaterThanOrEqual(script.scenes.length);
  });

  it('every declared timing sidecar is committed beside its clip and honours the contract', async () => {
    const { parseTimingSidecar } = await import('./lesson-speech');
    let declared = 0;
    for (const { slug } of LESSON_CATALOG) {
      const s = loadLessonScript(slug)!;
      for (const scene of s.scenes) {
        const t = scene.timing;
        if (t === undefined) continue;
        const paths = (Array.isArray(t) ? t : [t]).filter((u): u is string => typeof u === 'string' && u.startsWith('/'));
        for (const u of paths) {
          declared++;
          const file = path.join(process.cwd(), 'public', u);
          expect(fs.existsSync(file), `${slug}: ${u} missing`).toBe(true);
          expect(parseTimingSidecar(JSON.parse(fs.readFileSync(file, 'utf8'))), `${slug}: ${u} off-contract`).not.toBeNull();
        }
      }
    }
    expect(declared).toBeGreaterThanOrEqual(0); // none yet — the contract is defined, the provider is Adrian's call
  });

  it('keeps the whole voice track under the static-asset budget', () => {
    const publicDir = path.resolve(__dirname, '..', '..', 'public');
    let bytes = 0;
    for (const scene of script.scenes) {
      const urls = Array.isArray(scene.audio) ? scene.audio : scene.audio ? [scene.audio] : [];
      for (const url of urls) bytes += fs.statSync(path.join(publicDir, url)).size;
    }
    expect(bytes).toBeLessThan(2.2 * 1024 * 1024);
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
      expect('narration' in r).toBe(false);
      expect('audio' in r).toBe(false);
    }
  });

  it('carries the lead-in narration and its clip through to the player', () => {
    const r = resolveCheckScene(
      { ...scene, narration: 'Your turn — pause here.', audio: '/lessons/t/scene-09.mp3' }, goodRow(),
    );
    expect(r.type).toBe('check');
    if (r.type === 'check') {
      expect(r.narration).toBe('Your turn — pause here.');
      expect(r.audio).toBe('/lessons/t/scene-09.mp3');
    }
  });
});

// The narration hook's three responses to a rejected play(). Regression pin
// for the tap-to-advance unlock (2026-09-02 browser run): the 10 ms silent
// play() that unlocks the element is replaced by the next position's clip
// inside the SAME tap, so its promise rejects with AbortError ("interrupted by
// a new load request") — that is a superseded play, not a refused one. The
// hook used to treat every rejection there as "unlock failed", re-locking the
// player mid-scene (poster back, fresh clip paused) on every Continue tap.
describe('classifyPlayRejection', () => {
  it("'refused' only for the autoplay policy's NotAllowedError", () => {
    expect(classifyPlayRejection(new DOMException(
      "play() failed because the user didn't interact with the document first.", 'NotAllowedError',
    ))).toBe('refused');
  });

  it("'superseded' for AbortError — our own load or pause interrupted a pending play", () => {
    expect(classifyPlayRejection(new DOMException(
      'The play() request was interrupted by a new load request.', 'AbortError',
    ))).toBe('superseded');
    expect(classifyPlayRejection(new DOMException(
      'The play() request was interrupted by a call to pause().', 'AbortError',
    ))).toBe('superseded');
  });

  it("'failed' for anything else — the clip itself will not play", () => {
    expect(classifyPlayRejection(new DOMException('no supported source', 'NotSupportedError'))).toBe('failed');
    expect(classifyPlayRejection(new Error('boom'))).toBe('failed');
    expect(classifyPlayRejection(undefined)).toBe('failed');
    expect(classifyPlayRejection('NotAllowedError')).toBe('failed'); // a string is not an error
  });
});
