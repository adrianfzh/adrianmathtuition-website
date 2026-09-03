import { describe, it, expect } from 'vitest';
import {
  PLAYBACK_RATES, DEFAULT_RATE, normalizeRate, rateLabel, scaleBeat,
  splitParagraphs, splitSentences, splitProse, isBlockMarkdown,
  speechWeight, parseTimingSidecar, buildSpeechTrack,
  alignShownToSpoken, speechStatesAt, wordsLitAt,
} from './lesson-speech';
import { loadLessonScript } from './lesson-load';
import { LESSON_CATALOG } from './lesson-catalog';

// ── Playback rate ────────────────────────────────────────────────────────────

describe('playback rate', () => {
  it('offers 1× … 3× in six steps, default 1×', () => {
    expect([...PLAYBACK_RATES]).toEqual([1, 1.25, 1.5, 2, 2.5, 3]);
    expect(DEFAULT_RATE).toBe(1);
  });

  it('normalizeRate admits only the menu rates (strings from localStorage too)', () => {
    expect(normalizeRate(2)).toBe(2);
    expect(normalizeRate('1.5')).toBe(1.5);
    expect(normalizeRate('3')).toBe(3);
    expect(normalizeRate(1.75)).toBe(1);
    expect(normalizeRate(0)).toBe(1);
    expect(normalizeRate(-2)).toBe(1);
    expect(normalizeRate(NaN)).toBe(1);
    expect(normalizeRate('fast')).toBe(1);
    expect(normalizeRate(null)).toBe(1);
    expect(normalizeRate(undefined)).toBe(1);
  });

  it('labels rates without trailing zeros', () => {
    expect(PLAYBACK_RATES.map(rateLabel)).toEqual(['1×', '1.25×', '1.5×', '2×', '2.5×', '3×']);
  });

  it('scaleBeat divides every beat by the rate — Auto timers, the tutor breath, the check beat', () => {
    expect(scaleBeat(3200, 1)).toBe(3200);
    expect(scaleBeat(3200, 2)).toBe(1600);
    expect(scaleBeat(650, 1.25)).toBe(520);
    expect(scaleBeat(3600, 3)).toBe(1200);
    expect(scaleBeat(2600, 1.5)).toBe(1733);
    // degenerate rates play at 1×; never negative
    expect(scaleBeat(1000, 0)).toBe(1000);
    expect(scaleBeat(1000, NaN)).toBe(1000);
    expect(scaleBeat(1000, -1)).toBe(1000);
    expect(scaleBeat(-5, 2)).toBe(0);
  });
});

// ── Sentences ────────────────────────────────────────────────────────────────

describe('splitSentences', () => {
  it('splits plain prose on . ! ? … and keeps the punctuation', () => {
    expect(splitSentences('One idea. Then another! Really? Yes… Done'))
      .toEqual(['One idea.', 'Then another!', 'Really?', 'Yes…', 'Done']);
  });

  it('never cuts inside $…$ — decimals, dots and question marks in TeX are not boundaries', () => {
    expect(splitSentences('Square it: $\\tfrac{9}{4}$. The value is $3.5$. Done.'))
      .toEqual(['Square it: $\\tfrac{9}{4}$.', 'The value is $3.5$.', 'Done.']);
    expect(splitSentences('$y = x^2 - 4x$ looks simple, but at a glance it tells you almost nothing: where is its lowest point? What is its smallest value?'))
      .toEqual([
        '$y = x^2 - 4x$ looks simple, but at a glance it tells you almost nothing: where is its lowest point?',
        'What is its smallest value?',
      ]);
    // a full stop inside math (e.g. \\ldots or a decimal) is invisible to the splitter
    expect(splitSentences('Exams love $(k+2x)(\\ldots)^6$. Don\'t expand everything.'))
      .toEqual(['Exams love $(k+2x)(\\ldots)^6$.', 'Don\'t expand everything.']);
  });

  it('leaves decimals, abbreviations, initials and lowercase continuations alone', () => {
    expect(splitSentences('It is 3.5 wide. Next.')).toEqual(['It is 3.5 wide.', 'Next.']);
    expect(splitSentences('Use a table, e.g. the one above. Next.')).toEqual(['Use a table, e.g. the one above.', 'Next.']);
    expect(splitSentences('Compare A. Smith with B. Jones. Next.')).toEqual(['Compare A. Smith with B. Jones.', 'Next.']);
    expect(splitSentences('vs. the other one. Next.')).toEqual(['vs. the other one.', 'Next.']);
    expect(splitSentences('It ends etc. and carries on. Next.')).toEqual(['It ends etc. and carries on.', 'Next.']);
    // a digit before the full stop IS a boundary ("…at least 3. That one line…")
    expect(splitSentences('so the whole thing is at least 3. That one line is the proof.'))
      .toEqual(['so the whole thing is at least 3.', 'That one line is the proof.']);
  });

  it('keeps closing quotes and brackets with their sentence, and never splits inside brackets or **bold**', () => {
    expect(splitSentences('"Independent of $x$" means the power is ZERO. Find it.'))
      .toEqual(['"Independent of $x$" means the power is ZERO.', 'Find it.']);
    expect(splitSentences('He said "stop." Then left.')).toEqual(['He said "stop."', 'Then left.']);
    expect(splitSentences('Do this (carefully. Always). Then that.')).toEqual(['Do this (carefully. Always).', 'Then that.']);
    expect(splitSentences('The **binomial coefficients. Written** once. Twice.'))
      .toEqual(['The **binomial coefficients. Written** once.', 'Twice.']);
    expect(splitSentences('Press `x.y` now. Go.')).toEqual(['Press `x.y` now.', 'Go.']);
  });

  it('treats a colon, a dash and an arrow chain as continuations (one teacher thought)', () => {
    expect(splitSentences('Half the coefficient of $x$: $-3 \\to -\\tfrac{3}{2}$. Square it: $\\tfrac{9}{4}$. ADD it and SUBTRACT it at once — the value hasn\'t changed.'))
      .toEqual([
        'Half the coefficient of $x$: $-3 \\to -\\tfrac{3}{2}$.',
        'Square it: $\\tfrac{9}{4}$.',
        'ADD it and SUBTRACT it at once — the value hasn\'t changed.',
      ]);
    expect(splitSentences('General term → one power of $x$ → set the power → solve for $r$.'))
      .toEqual(['General term → one power of $x$ → set the power → solve for $r$.']);
  });

  it('a block-markdown paragraph is one unit', () => {
    expect(isBlockMarkdown('- one. two.')).toBe(true);
    expect(isBlockMarkdown('1. first. second.')).toBe(true);
    expect(isBlockMarkdown('$$\nx = 1.\n$$')).toBe(true);
    expect(isBlockMarkdown('## Heading. Two.')).toBe(true);
    expect(isBlockMarkdown('Plain. Prose.')).toBe(false);
    expect(splitSentences('- one. two.\n- three.')).toEqual(['- one. two.\n- three.']);
  });

  it('splitParagraphs / splitProse honour blank lines and drop empties', () => {
    expect(splitParagraphs('A one.\n\nB one. B two.\n\n\n')).toEqual(['A one.', 'B one. B two.']);
    expect(splitProse('A one.\n\nB one. B two.')).toEqual([['A one.'], ['B one.', 'B two.']]);
    expect(splitProse('')).toEqual([]);
    expect(splitProse('   ')).toEqual([]);
  });

  it('re-joins to the original text (whitespace-normalised) on every prose field of every registered lesson', () => {
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    let fields = 0;
    for (const { slug } of LESSON_CATALOG) {
      const script = loadLessonScript(slug)!;
      for (const scene of script.scenes) {
        const texts: string[] = [];
        if (scene.type === 'title') texts.push(scene.promise);
        if (scene.type === 'caption') texts.push(scene.text);
        if (scene.type === 'check' && scene.prompt) texts.push(scene.prompt);
        if ((scene.type === 'equation-steps' || scene.type === 'annotate') && scene.intro) texts.push(scene.intro);
        if (scene.type === 'equation-steps') for (const st of scene.steps) if (st.note) texts.push(st.note);
        if (scene.type === 'annotate') for (const c of scene.callouts) texts.push(c.label);
        const narr = Array.isArray(scene.narration) ? scene.narration : scene.narration ? [scene.narration] : [];
        texts.push(...narr);
        if (scene.beats) for (const b of scene.beats) { texts.push(b.say); for (const a of b.do) if (a.do === 'note') texts.push(a.text); }
        for (const t of texts) {
          fields++;
          const back = splitProse(t).map(p => p.join(' ')).join(' ');
          expect(norm(back)).toBe(norm(t));
          // every sentence is non-empty and balanced in $
          for (const sent of splitProse(t).flat()) {
            expect(sent.trim().length).toBeGreaterThan(0);
            expect((sent.match(/\$/g) || []).length % 2).toBe(0);
          }
        }
      }
    }
    expect(fields).toBeGreaterThan(60);
  });
});

// ── Weight + proportional timing ─────────────────────────────────────────────

describe('speechWeight', () => {
  it('counts letters and digits, gives punctuation a pause, and reads TeX by its letters only', () => {
    expect(speechWeight('abc')).toBe(3);
    expect(speechWeight('ab cd')).toBe(5);          // 4 letters + 1 gap
    expect(speechWeight('ab, cd')).toBe(8);         // + clause pause 3
    expect(speechWeight('ab. cd')).toBe(11);        // + sentence pause 6
    expect(speechWeight('$\\tfrac{9}{4}$')).toBe(2); // "94"
    expect(speechWeight('**bold**')).toBe(4);
    expect(speechWeight('')).toBe(1);                 // never zero
  });
});

describe('buildSpeechTrack (proportional fallback)', () => {
  const text = 'Welcome. In the next few minutes you will learn one rewrite, completing the square. It hands you the turning point.';

  it('tiles the clip with one window per sentence, in order, summing to the duration', () => {
    const track = buildSpeechTrack(text, 10);
    expect(track.duration).toBe(10);
    expect(track.sentences.map(s => s.text)).toEqual([
      'Welcome.',
      'In the next few minutes you will learn one rewrite, completing the square.',
      'It hands you the turning point.',
    ]);
    expect(track.sentences[0].start).toBe(0);
    expect(track.sentences[2].end).toBeCloseTo(10, 6);
    for (let i = 1; i < track.sentences.length; i++) {
      expect(track.sentences[i].start).toBeCloseTo(track.sentences[i - 1].end, 6);
      expect(track.sentences[i].end).toBeGreaterThan(track.sentences[i].start);
    }
    // the long middle sentence takes most of the time
    const mid = track.sentences[1];
    expect(mid.end - mid.start).toBeGreaterThan(5);
    expect(track.sentences[0].end - track.sentences[0].start).toBeLessThan(2);
  });

  it('spreads words inside each sentence window, contiguous, in order', () => {
    const track = buildSpeechTrack(text, 10);
    const s = track.sentences[1];
    expect(s.words.map(w => w.text)).toEqual(['In', 'the', 'next', 'few', 'minutes', 'you', 'will', 'learn', 'one', 'rewrite,', 'completing', 'the', 'square.']);
    expect(s.words[0].start).toBeCloseTo(s.start, 6);
    expect(s.words[s.words.length - 1].end).toBeCloseTo(s.end, 6);
    for (let i = 1; i < s.words.length; i++) expect(s.words[i].start).toBeCloseTo(s.words[i - 1].end, 6);
    // "rewrite," (comma) outlasts "the"
    const rewrite = s.words[9], the = s.words[1];
    expect(rewrite.end - rewrite.start).toBeGreaterThan(the.end - the.start);
  });

  it('tolerates unknown / zero duration with a 1 s placeholder and empty narration', () => {
    expect(buildSpeechTrack(text, NaN).duration).toBe(1);
    expect(buildSpeechTrack(text, 0).duration).toBe(1);
    expect(buildSpeechTrack('', 5)).toEqual({ duration: 5, sentences: [] });
  });
});

// ── Sidecar ──────────────────────────────────────────────────────────────────

describe('parseTimingSidecar', () => {
  it('accepts the contract — words [[text, start, end]] and sentences [[start, end]] — either key alone too', () => {
    const both = parseTimingSidecar({ words: [['Hi.', 0, 0.4], ['There', 0.5, 0.9]], sentences: [[0, 0.4], [0.5, 0.9]] });
    expect(both).toEqual({
      words: [{ text: 'Hi.', start: 0, end: 0.4 }, { text: 'There', start: 0.5, end: 0.9 }],
      sentences: [{ start: 0, end: 0.4 }, { start: 0.5, end: 0.9 }],
    });
    expect(parseTimingSidecar({ words: [['a', 0, 1]] })).toEqual({ words: [{ text: 'a', start: 0, end: 1 }], sentences: null });
    expect(parseTimingSidecar({ sentences: [[0, 1]] })).toEqual({ words: null, sentences: [{ start: 0, end: 1 }] });
  });

  it('rejects anything off-contract → null (the proportional fallback takes over)', () => {
    expect(parseTimingSidecar(null)).toBeNull();
    expect(parseTimingSidecar([])).toBeNull();
    expect(parseTimingSidecar({})).toBeNull();
    expect(parseTimingSidecar({ words: [] })).toBeNull();
    expect(parseTimingSidecar({ words: [['a', 1, 0.5]] })).toBeNull();          // end < start
    expect(parseTimingSidecar({ words: [['a', -1, 0.5]] })).toBeNull();         // negative
    expect(parseTimingSidecar({ words: [['a', 0, 1], ['b', 0.5, 2]] })).not.toBeNull(); // overlap allowed
    expect(parseTimingSidecar({ words: [['a', 1, 2], ['b', 0.5, 2]] })).toBeNull();     // out of order
    expect(parseTimingSidecar({ words: [[1, 0, 1]] })).toBeNull();               // text not a string
    expect(parseTimingSidecar({ words: [['a', 0]] })).toBeNull();                // wrong arity
    expect(parseTimingSidecar({ sentences: [[0, 'x']] })).toBeNull();
    expect(parseTimingSidecar({ sentences: [[0, Infinity]] })).toBeNull();
  });
});

describe('buildSpeechTrack (with a sidecar)', () => {
  const text = 'Welcome. Now the recipe.';

  it('uses sidecar sentences when they count the same as the narration split', () => {
    const track = buildSpeechTrack(text, 5, { words: null, sentences: [{ start: 0.1, end: 0.6 }, { start: 1.2, end: 2.9 }] });
    expect(track.sentences.map(s => [s.start, s.end])).toEqual([[0.1, 0.6], [1.2, 2.9]]);
    expect(track.duration).toBe(5);
    // words spread inside the real sentence windows
    expect(track.sentences[1].words[0].start).toBeCloseTo(1.2, 6);
    expect(track.sentences[1].words[2].end).toBeCloseTo(2.9, 6);
  });

  it('derives sentence windows from sidecar words when only words are given', () => {
    const words = [
      { text: 'Welcome.', start: 0.1, end: 0.6 },
      { text: 'Now', start: 1.2, end: 1.4 }, { text: 'the', start: 1.4, end: 1.5 }, { text: 'recipe.', start: 1.5, end: 2.9 },
    ];
    const track = buildSpeechTrack(text, 3, { words, sentences: null });
    expect(track.sentences.map(s => [s.start, s.end])).toEqual([[0.1, 0.6], [1.2, 2.9]]);
    expect(track.sentences[1].words).toEqual(words.slice(1));
  });

  it('ignores a sidecar whose word count disagrees with the narration (falls back proportionally)', () => {
    const track = buildSpeechTrack(text, 4, { words: [{ text: 'x', start: 0, end: 1 }], sentences: null });
    expect(track.sentences[0].start).toBe(0);
    expect(track.sentences[1].end).toBeCloseTo(4, 6);
  });

  it('extends the duration when the sidecar runs past the audio metadata', () => {
    const track = buildSpeechTrack(text, 2, { words: null, sentences: [{ start: 0, end: 1 }, { start: 1, end: 6 }] });
    expect(track.duration).toBe(6);
  });
});

// ── Alignment + cursor ───────────────────────────────────────────────────────

describe('alignShownToSpoken', () => {
  const spoken = buildSpeechTrack('First spoken. Second spoken sentence here.', 10).sentences;

  it('is one-to-one when the counts match', () => {
    const w = alignShownToSpoken([5, 40], spoken, 10);
    expect(w).toEqual(spoken.map(s => ({ start: s.start, end: s.end })));
  });

  it('shares the spoken timeline by character weight when the counts differ, contiguous and ordered', () => {
    const w = alignShownToSpoken([10, 10, 10], spoken, 10);
    expect(w.length).toBe(3);
    expect(w[0].start).toBe(0);
    expect(w[2].end).toBeCloseTo(10, 6);
    for (let i = 1; i < 3; i++) expect(w[i].start).toBeCloseTo(w[i - 1].end, 6);
    // equal weights → roughly thirds of the clip
    expect(w[0].end).toBeGreaterThan(2.5); expect(w[0].end).toBeLessThan(4.5);
  });

  it('walks a sidecar gap: a shown sentence mapped into the second spoken sentence starts after the pause', () => {
    const gapped = buildSpeechTrack('Short one. A much longer second sentence follows here.', 10,
      { words: null, sentences: [{ start: 0, end: 1 }, { start: 3, end: 10 }] }).sentences;
    const w = alignShownToSpoken([1, 1, 1, 1, 1, 1, 1, 1], gapped, 10);
    // the first spoken sentence carries ~15% of the weight → the first shown
    // sentence (12.5%) lands inside it; the second crosses into the gap
    expect(w[0].end).toBeLessThanOrEqual(1);
    expect(w[2].start).toBeGreaterThanOrEqual(3);
  });

  it('spreads over [0, duration] for a silent beat, and returns [] for no sentences', () => {
    expect(alignShownToSpoken([1, 3], null, 4)).toEqual([{ start: 0, end: 1 }, { start: 1, end: 4 }]);
    expect(alignShownToSpoken([], spoken, 10)).toEqual([]);
    expect(alignShownToSpoken([2, 2], [], 4)).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  });
});

describe('speechStatesAt / wordsLitAt', () => {
  const windows = [{ start: 0, end: 2 }, { start: 2, end: 5 }, { start: 6, end: 8 }];

  it('marks waiting / speaking / spoken and the sweep progress', () => {
    expect(speechStatesAt(windows, -1)).toEqual({ states: ['waiting', 'waiting', 'waiting'], current: -1, progress: 0 });
    expect(speechStatesAt(windows, 1)).toEqual({ states: ['speaking', 'waiting', 'waiting'], current: 0, progress: 0.5 });
    expect(speechStatesAt(windows, 3.5)).toEqual({ states: ['spoken', 'speaking', 'waiting'], current: 1, progress: 0.5 });
    // in the gap the earlier sentence stays spoken, the later waits
    expect(speechStatesAt(windows, 5.5)).toEqual({ states: ['spoken', 'spoken', 'waiting'], current: 1, progress: 1 });
    expect(speechStatesAt(windows, 9)).toEqual({ states: ['spoken', 'spoken', 'spoken'], current: 2, progress: 1 });
  });

  it('a lead shifts every boundary earlier so the eye arrives before the voice', () => {
    expect(speechStatesAt(windows, 1.9, 0.2).states).toEqual(['spoken', 'speaking', 'waiting']);
    expect(speechStatesAt(windows, 5.85, 0.2).states[2]).toBe('speaking');
  });

  it('wordsLitAt counts the words reached so far', () => {
    const words = [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 }, { text: 'c', start: 2, end: 3 }];
    expect(wordsLitAt(words, -0.5)).toBe(0);
    expect(wordsLitAt(words, 0)).toBe(1);
    expect(wordsLitAt(words, 1.5)).toBe(2);
    expect(wordsLitAt(words, 99)).toBe(3);
    expect(wordsLitAt(words, 0.9, 0.15)).toBe(2);
  });
});
