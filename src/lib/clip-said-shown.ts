/**
 * "Said but not shown" — every number and named letter the voice says is on the board by the end
 * of that beat (Adrian, 18 Oct 2026: "build #1 > A 'said but shown' check", after many watches of
 * the form "when t = 7.5, P = 2 x 100 < write that on screen when narrating", "should write on
 * screen let intensity of the pump be I_p", "should show on screen … = ?"). Pure and model-free:
 * spoken numbers become digits ("sixty-two" → 62, "zero point six nine three" → 0.693), letter
 * pairs become subscripts ("I P" → I_p, "P zero" → P_0), and each must appear in what the board
 * shows at that moment — the lines and tokens written so far, the notes, the pinned steps, the
 * side sketch's labels. The question card does not count: the board must carry it.
 */
import { boardStateAt } from './lesson-beats';
import type { Beat, PlayScene, Scene } from './lesson-script';

const UNITS: Record<string, number> = {
  zero: 0, nought: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const DIGIT: Record<string, string> = { zero: '0', nought: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

/** A number counted, not computed: "four steps", "the two logs", "step one", "base ten". */
const COUNT_AFTER = /^(steps?|shapes?|logs?|equations?|answers?|terms?|sides?|brackets?|lines?|ways?|things?|parts?|roots?|basic|numbers?|axes|minuses|readings?|cases?|powers?|laws?|letters?|curves?|intercepts?|points?\b(?!\s))$/i;
const COUNT_BEFORE = /^(step|base|part|line|stage|beat|law|minute|minutes|chapter)$/i;
/** "one" as a word, not a number ("into one", "one log", "one at a time"). */
const ONE_WORD_AFTER = /^(log|of|another|more|at|by|go|side|thing|way|line|step|piece|number|power|term|fraction)$/i;

export interface SaidItem { said: string; want: string }

function isNumWord(w: string) { return w in UNITS || w in TENS || w === 'hundred' || w === 'thousand'; }

/** The numbers and subscript names a sentence says, each with the TeX-ish form it must show as. */
export function saidItems(say: string): SaidItem[] {
  const out: SaidItem[] = [];
  const words = say.replace(/[“”"]/g, ' ').split(/\s+/).filter(Boolean);
  const bare = (w: string) => w.toLowerCase().replace(/[^a-z-]/g, '');
  for (let i = 0; i < words.length; i++) {
    const w0 = bare(words[i]);
    // Letter pairs: "I P" → I_p, "P zero" → P_0 (never "L N", which is ln).
    const cap = /^[A-Z]$/.test(words[i].replace(/[^A-Za-z]/g, '')) ? words[i].replace(/[^A-Za-z]/g, '') : null;
    if (cap && i + 1 < words.length) {
      const nextRaw = words[i + 1].replace(/[^A-Za-z]/g, '');
      if (/^[A-Z]$/.test(nextRaw) && !(cap === 'L' && nextRaw === 'N') && !/[.,:;]$/.test(words[i])) {
        out.push({ said: `${cap} ${nextRaw}`, want: `${cap}_${nextRaw.toLowerCase()}` }); i++; continue;
      }
      if ((bare(words[i + 1]) === 'zero' || bare(words[i + 1]) === 'nought') && !/[.,:;]$/.test(words[i])) {
        out.push({ said: `${cap} ${bare(words[i + 1])}`, want: `${cap}_0` }); i++; continue;
      }
    }
    // Numbers: "sixty-two", "one hundred", "seven point five", "zero point six nine three".
    const parts = w0.split('-');
    if (!parts.every(isNumWord)) continue;
    const start = i;
    let val = 0, cur = 0;
    const take = (p: string) => {
      if (p in UNITS) cur += UNITS[p];
      else if (p in TENS) cur += TENS[p];
      else if (p === 'hundred') cur = (cur || 1) * 100;
      else if (p === 'thousand') { val += (cur || 1) * 1000; cur = 0; }
    };
    for (const p of parts) take(p);
    let j = i + 1;
    while (j < words.length && !/[.,:;]$/.test(words[j - 1]) && ((bare(words[j]).split('-').every(isNumWord) && bare(words[j]) !== '') || (bare(words[j]) === 'and' && /^(hundred|thousand)$/.test(bare(words[j - 1]))))) {
      // "two hundred" / "one thousand" join; "two two" does not.
      let nb = bare(words[j]);
      // "four hundred AND forty-eight", "two thousand AND eighteen".
      if (nb === 'and' && /^(hundred|thousand)$/.test(bare(words[j - 1])) && j + 1 < words.length && bare(words[j + 1]).split('-').every(isNumWord)) { j++; nb = bare(words[j]); }
      const afterBig = /^(hundred|thousand|and)$/.test(bare(words[j - 1]));
      if (nb !== 'hundred' && nb !== 'thousand' && !afterBig && !(nb in TENS || nb in UNITS && cur % 10 === 0 && cur >= 20 && UNITS[nb] < 10)) break;
      for (const p of nb.split('-')) take(p);
      j++;
    }
    let num = String(val + cur);
    // Decimals: "point six nine three".
    if (j < words.length && bare(words[j]) === 'point' && !/[.,:;]$/.test(words[j - 1])) {
      let dec = '', k = j + 1;
      while (k < words.length && bare(words[k]) in DIGIT) { dec += DIGIT[bare(words[k])]; if (/[.,:;]$/.test(words[k])) { k++; break; } k++; }
      if (dec) { num += '.' + dec; j = k; }
    }
    const before = start > 0 ? bare(words[start - 1]) : '';
    const after = j < words.length ? bare(words[j]) : '';
    i = j - 1;
    if (!num.includes('.')) {
      if (COUNT_BEFORE.test(before) || COUNT_AFTER.test(after)) continue;
      // A count of things ("four products", "two equations"): a plural noun after it, not "times".
      if (/^[a-z]{3,}s$/.test(after) && !/^(times|is|was|equals|minus|plus|thirds?|halves|tens|hundreds|thousands|decibels|hours|minutes|seconds|days|weeks|months|years|metres|meters|centimetres|kilometres|grams|kilograms|litres|degrees|dollars|cents|percent|units|radians|bacteria|people)$/.test(after)) continue;
      // A list label ("One: A times A …", "Four: B times …").
      if (/:$/.test(words[j - 1])) continue;
      if (num === '1' && (ONE_WORD_AFTER.test(after) || before === 'into' || before === 'in' || before === 'no' || /\bthe other\b/i.test(words.slice(j, j + 4).join(' ')))) continue;
      if (/^(both|each|every|first|second)$/.test(before)) continue;
    }
    out.push({ said: words.slice(start, j).join(' ').replace(/[.,:;]$/, ''), want: num });
  }
  return out;
}

/** Everything the board shows once beat `k` has played (lines, notes, pinned steps, sketch labels). */
export function boardTextAfter(scene: Scene | PlayScene, k: number): string {
  const b = boardStateAt(scene, k, 9999);
  const bits: string[] = [];
  if (scene.type === 'equation-steps') {
    scene.steps.forEach((st, n) => {
      const lineOn = b.shown.has(`line:${n}`);
      st.tokens.forEach((t, i) => {
        const key = `tok:${n}:${i}`;
        // A piece still waiting to move in (the 2 going up into the power) is not on the board yet.
        if (t.from && b.movable.has(t.from) && !b.moved.has(t.from)) return;
        if (b.shown.has(key) || (lineOn && !b.targeted.has(key))) bits.push(t.tex);
      });
      if (lineOn) {
        if (st.heading) bits.push(st.heading);
        if (st.graph) bits.push(...(st.graph.points ?? []).map(p => p.label), st.graph.asymptote?.label ?? '', st.graph.label ?? '', ...(st.graph.curves ?? []).map(c => c.label ?? ''));
      }
    });
    if (scene.pinned) bits.push(...scene.pinned.slice(0, b.pinShown));
    const sk = scene.sketch;
    if (sk) {
      if (b.sketch.includes('inset') && sk.inset) bits.push(sk.inset.label ?? '', ...(sk.inset.curves ?? []).map(c => c.label ?? ''));
      if (sk.edge && b.sketch.includes('edge')) bits.push(sk.edge.label);
      const ls = b.sketch.find(s => /^l\d+$/.test(s));
      if (sk.hline && ls) bits.push(sk.hline.labels?.[Number(ls.slice(1))] ?? sk.hline.label);
      if (b.sketch.includes('asymptote')) bits.push(b.sketch.includes('shift') && sk.asymptote?.labelAfter ? sk.asymptote.labelAfter : sk.asymptote?.label ?? '');
      (sk.points ?? []).forEach((p, i) => { if (b.sketch.includes(`p${i}`)) bits.push(p.label); });
    }
  }
  bits.push(...b.notes.map(n => n.text));
  return bits.join(' ');
}

/** TeX / labels flattened so "I_{p}", "I_p", "10\\lg", "2 \\times 100" can be searched. */
export function flatten(tex: string): string {
  return tex
    .replace(/\\(?:,|;|:|!|quad|qquad)/g, ' ')
    .replace(/\\(?:text|mathrm|textbf|operatorname)\{([^}]*)\}/g, ' $1 ')
    .replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/\^\{([^}]*)\}/g, '^$1')
    .replace(/[{}]/g, ' ')
    .replace(/−/g, '-');
}

function shows(text: string, want: string): boolean {
  if (want.includes('/')) {
    const [a, b] = want.split('/');
    return new RegExp(`frac\\s*${a}\\s*${b}|${a}\\s*/\\s*${b}`, 'i').test(text);
  }
  if (/_/.test(want)) {
    const [a, s] = want.split('_');
    return new RegExp(`${a}_${s}`, "i").test(text);
  }
  const esc = want.replace('.', '\\.');
  // As a number on its own: 10 inside 100 or 1.2 inside 10^{1.2}x is fine, 2 inside 12 is not.
  if (new RegExp(`(?<![\\d.])${esc}(?![\\d])`).test(text)) return true;
  // A decimal may show rounded or longer ("0.693" for "zero point six nine three").
  return false;
}

export interface SaidShownIssue { beat: number; said: string; want: string }

/** The things a scene's voice says that its board does not show by the end of that beat. */
/** "I D over I P" → the fraction I_d/I_p must show (Adrian, 18 Oct 2026: "show on screen … I_d / I_p = ?"). */
function overItems(say: string, names: Set<string>): SaidItem[] {
  const out: SaidItem[] = [];
  const re = /\b([A-Z]) ([A-Z]) over ([A-Z]) ([A-Z])\b/g;
  for (const m of say.matchAll(re)) {
    const a = `${m[1]}_${m[2].toLowerCase()}`, b = `${m[3]}_${m[4].toLowerCase()}`;
    if (names.has(a) && names.has(b)) out.push({ said: m[0], want: `${a}/${b}` });
  }
  return out;
}

export function saidNotShown(scene: Scene | PlayScene, opts: { firstBeatReadsQuestion?: boolean } = {}): SaidShownIssue[] {
  const beats: Beat[] = 'beats' in scene && Array.isArray(scene.beats) ? scene.beats : [];
  // A letter pair is a NAME only when the clip writes it as one (I_p, P_0): "N X" in "minus N X" is a product.
  const all = scene.type === 'equation-steps' ? flatten(scene.steps.flatMap(st => st.tokens.map(t => t.tex)).join(' ')) : '';
  const names = new Set(Array.from(all.matchAll(/([A-Za-z])_([A-Za-z0-9])/g), m => `${m[1]}_${m[2].toLowerCase()}`));
  const out: SaidShownIssue[] = [];
  beats.forEach((beat, k) => {
    // The first beat of a skill clip reads the question (it is on the card above the board).
    if (k === 0 && opts.firstBeatReadsQuestion !== false) return;
    const text = flatten(boardTextAfter(scene, k));
    for (const it of [...saidItems(beat.say), ...overItems(beat.say, names)]) {
      if (it.want.includes('_') && !it.want.includes('/') && !names.has(it.want.replace(/_(.)$/, (_, c: string) => `_${c.toLowerCase()}`))) continue;
      if (!shows(text, it.want)) out.push({ beat: k, said: it.said, want: it.want });
    }
  });
  return out;
}
