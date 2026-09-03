// Spoken-text timing for the lesson player (/app/lesson/[slug]) — pure.
//
// The player animates the prose on a scene card ("the teacher's cursor") and a
// spoken-line ribbon under the card as the narration clip plays. Narration
// text ≠ caption text (the narration is a spoken paraphrase; the captions carry
// TeX), so this module answers three questions with no DOM and no audio:
//
//   1. Where do the sentences of a piece of prose start and end?
//      `splitSentences` — TeX- and markdown-aware, so a `$…$` span, a
//      `**bold**` run or an abbreviation never splits a sentence in half.
//   2. When is each spoken sentence / word said?
//      `buildSpeechTrack` — from a timing sidecar when the clip has one
//      (see `parseTimingSidecar` for the contract), else proportionally by
//      character weight over the clip's duration (punctuation carries a small
//      pause weight, so a comma-heavy sentence gets its breath).
//   3. Which on-screen sentence is being spoken right now?
//      `alignShownToSpoken` maps the on-screen sentences onto the spoken
//      timeline — one-to-one when the counts match, else proportionally by
//      character weight — and `speechStatesAt` turns a clip time into
//      waiting / speaking / spoken states plus the sweep progress.
//
// Playback rate lives here too (`PLAYBACK_RATES`, `scaleBeat`): every silent
// beat the player waits on is divided by the same rate the <audio> plays at,
// so Auto and Voice pacing speed up together.
//
// Pure module (repo testing policy): no I/O, no React.

// ── Playback rate ────────────────────────────────────────────────────────────

/** The speeds the ⚡ menu offers, in order. 1× is the default. */
export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 2.5, 3] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];
export const DEFAULT_RATE: PlaybackRate = 1;

/** Coerce a stored / typed value to a rate the menu offers (1× when it is not one). */
export function normalizeRate(v: unknown): PlaybackRate {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_RATE;
  return (PLAYBACK_RATES as readonly number[]).includes(n) ? (n as PlaybackRate) : DEFAULT_RATE;
}

/** A pill label for a rate: 1×, 1.25×, 2× — no trailing zeros. */
export function rateLabel(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

/**
 * A silent beat (ms) at a playback rate: the same division the clip plays at,
 * so a 2× lesson's gaps are half as long as its 1× gaps. Guards the degenerate
 * inputs (a non-finite or non-positive rate plays at 1×; never below 0 ms).
 */
export function scaleBeat(ms: number, rate: number): number {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return Math.max(0, Math.round(ms / r));
}

// ── Sentences ────────────────────────────────────────────────────────────────

/** Abbreviations whose trailing full stop never ends a sentence. */
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'approx', 'eq', 'eqn', 'fig', 'no', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'q', 'qn', 'p', 'pp', 'cf', 'ex']);

/** Paragraphs of a markdown field — blank-line separated, blank ones dropped. */
export function splitParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(p => p.trim()).filter(Boolean);
}

/**
 * Does a paragraph carry block markdown the sentence renderer must not cut
 * through (lists, headings, display math, tables, fenced code, raw HTML)? Such
 * a paragraph is one unit — rendered whole, animated as one sentence.
 */
export function isBlockMarkdown(paragraph: string): boolean {
  const p = paragraph.trim();
  if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\||```|<)/.test(p)) return true;
  if (/\n\s*([-*+]\s|\d+[.)]\s|\|)/.test(p)) return true;
  return p.includes('$$');
}

/**
 * Split ONE paragraph of prose into sentences. Never splits inside `$…$`,
 * `**…**`, `` `…` `` or a bracket pair; keeps closing quotes/brackets with the
 * sentence they close; leaves decimals ("3.5"), abbreviations ("e.g.", "vs."),
 * single-letter initials ("A.") and a lowercase continuation ("etc. and") alone.
 * The pieces re-join with single spaces to the original text (modulo the
 * whitespace that separated them). A block-markdown paragraph is one sentence.
 */
export function splitSentences(paragraph: string): string[] {
  const text = paragraph.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  if (isBlockMarkdown(text)) return [text];

  const out: string[] = [];
  let start = 0;
  let inMath = false;
  let inCode = false;
  let inBold = false;
  let depth = 0; // ( [ { nesting outside math
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inCode) { if (ch === '`') inCode = false; continue; }
    if (ch === '`') { inCode = true; continue; }
    if (ch === '$') { inMath = !inMath; continue; }
    if (inMath) { if (ch === '\\') i++; continue; }
    if (ch === '*' && text[i + 1] === '*') { inBold = !inBold; i++; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth = Math.max(0, depth - 1); continue; }
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    if (inBold || depth > 0) continue;

    // Swallow a run of terminal marks ("?!", "...") and any closing quote/bracket.
    let j = i + 1;
    while (j < n && /[.!?…]/.test(text[j])) j++;
    while (j < n && /["'”’)\]]/.test(text[j])) j++;
    const atEnd = j >= n;
    if (!atEnd && !/\s/.test(text[j])) continue;          // "3.5", "x.y" — no boundary

    if (ch === '.' && j - i === 1) {
      // The word this full stop ends: an abbreviation or an initial keeps going.
      let w = i - 1;
      while (w >= start && !/\s/.test(text[w])) w--;
      const word = text.slice(w + 1, i).replace(/^[("'“‘]+/, '');
      const bare = word.replace(/\.$/, '').toLowerCase();
      if (!word.includes('$')) {                             // a TeX word ("$3.5$") never abbreviates
        if (/^[A-Za-z]$/.test(word)) continue;             // "A." / the "e" of "e.g."
        if (bare.includes('.') || ABBREVIATIONS.has(bare)) continue;
      }
    }
    if (!atEnd) {
      // A lowercase continuation is almost always an abbreviation we missed.
      let k = j;
      while (k < n && /\s/.test(text[k])) k++;
      if (k < n && /[a-z]/.test(text[k])) continue;
    }
    const piece = text.slice(start, j).trim();
    if (piece) out.push(piece);
    start = j;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** A whole field (may hold several paragraphs) as paragraphs of sentences. */
export function splitProse(text: string): string[][] {
  return splitParagraphs(text).map(splitSentences).filter(p => p.length > 0);
}

// ── Character weight (how long a piece of text takes to say) ─────────────────

const CLAUSE_PAUSE = 3;   // , ; : — –   in character-equivalents
const SENTENCE_PAUSE = 6; // . ! ? …

/**
 * Strip TeX down to what is actually READ: commands, braces and operators go,
 * letters and digits stay (`$\tfrac{9}{4}$` → "94", `$(x-2)^2$` → "x22").
 * Crude on purpose: it only has to rank on-screen sentences against each
 * other, and a formula is never read symbol by symbol anyway.
 */
function spokenChars(text: string): string {
  return text
    .replace(/\$\$?([^$]*)\$\$?/g, (_, m: string) => ` ${m.replace(/\\[a-zA-Z]+/g, ' ').replace(/[^A-Za-z0-9]/g, '')} `)
    .replace(/\*\*|__|`/g, '');
}

/** Estimated speaking weight of one word or sentence, in character-equivalents (≥ 1). */
export function speechWeight(text: string): number {
  const s = spokenChars(text);
  let w = 0;
  for (const ch of s) {
    if (/[A-Za-z0-9]/.test(ch)) w += 1;
    else if (/[,;:—–]/.test(ch)) w += CLAUSE_PAUSE;
    else if (/[.!?…]/.test(ch)) w += SENTENCE_PAUSE;
  }
  const words = s.trim().split(/\s+/).filter(Boolean).length;
  w += Math.max(0, words - 1); // one beat per word gap
  return Math.max(1, w);
}

// ── Timing sidecar contract ──────────────────────────────────────────────────
//
// `public/lessons/<slug>/scene-NN[-K].timing.json`, beside the clip it times,
// named in the scene's `timing` field (same shape as `audio`). Seconds,
// clip-relative, at 1× — the player divides nothing here; it reads the clip's
// own currentTime, which already runs at the playback rate.
//
//   {
//     "words":     [["Welcome.", 0.00, 0.52], ["In", 0.61, 0.70], …],
//     "sentences": [[0.00, 0.52], [0.61, 4.80], …]
//   }
//
// `words` are the narration's whitespace-separated tokens in order (the
// player pairs them positionally; punctuation attached as written). Either
// key may be omitted: sentences without words → words spread proportionally
// inside each sentence; words without sentences → sentences derived from the
// narration's own sentence split. Anything malformed → null → the proportional
// fallback, never a broken lesson.

export interface TimedSpan { text: string; start: number; end: number }
export interface SpeechTiming { words: TimedSpan[] | null; sentences: { start: number; end: number }[] | null }

function isSpan(v: unknown, withText: boolean): boolean {
  if (!Array.isArray(v)) return false;
  const [a, b, c] = withText ? v : [null, v[0], v[1]];
  if (withText && typeof a !== 'string') return false;
  if (v.length !== (withText ? 3 : 2)) return false;
  return typeof b === 'number' && typeof c === 'number' && Number.isFinite(b) && Number.isFinite(c) && b >= 0 && c >= b;
}

/** Parse a sidecar body; null for anything that does not honour the contract. */
export function parseTimingSidecar(raw: unknown): SpeechTiming | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  let words: TimedSpan[] | null = null;
  let sentences: { start: number; end: number }[] | null = null;
  if (r.words !== undefined) {
    if (!Array.isArray(r.words) || r.words.length === 0 || !r.words.every(w => isSpan(w, true))) return null;
    words = (r.words as [string, number, number][]).map(([text, start, end]) => ({ text, start, end }));
    for (let i = 1; i < words.length; i++) if (words[i].start < words[i - 1].start) return null;
  }
  if (r.sentences !== undefined) {
    if (!Array.isArray(r.sentences) || r.sentences.length === 0 || !r.sentences.every(s => isSpan(s, false))) return null;
    sentences = (r.sentences as [number, number][]).map(([start, end]) => ({ start, end }));
    for (let i = 1; i < sentences.length; i++) if (sentences[i].start < sentences[i - 1].start) return null;
  }
  if (!words && !sentences) return null;
  return { words, sentences };
}

// ── The speech track: when each spoken sentence and word is said ─────────────

export interface SpokenSentence extends TimedSpan { words: TimedSpan[] }
export interface SpeechTrack {
  /** Clip length in seconds (the sidecar's last end, or the audio's duration). */
  duration: number;
  sentences: SpokenSentence[];
}

/** Spread items across [start, end] by weight. Every item gets a positive span. */
function spread(weights: number[], start: number, end: number): { start: number; end: number }[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0, end - start);
  const out: { start: number; end: number }[] = [];
  let acc = 0;
  for (const w of weights) {
    const s = start + (acc / total) * span;
    acc += w;
    const e = start + (acc / total) * span;
    out.push({ start: s, end: e });
  }
  return out;
}

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * The spoken timeline for one narration entry. `duration` is the clip's
 * length in seconds (0 / non-finite → a 1-second placeholder so callers can
 * still lay text out before metadata arrives).
 */
export function buildSpeechTrack(
  narration: string,
  duration: number,
  sidecar: SpeechTiming | null = null,
): SpeechTrack {
  const D = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const sentenceTexts = splitProse(narration).flat();
  if (sentenceTexts.length === 0) return { duration: D, sentences: [] };
  const sentenceWordTexts = sentenceTexts.map(tokens);
  const allWords = sentenceWordTexts.flat();

  // Sentence windows: sidecar sentences (when they count the same) → sidecar
  // words grouped by the narration's own split → proportional.
  let windows: { start: number; end: number }[] | null = null;
  let wordSpans: TimedSpan[] | null = null;
  if (sidecar?.words && sidecar.words.length === allWords.length) wordSpans = sidecar.words;
  if (sidecar?.sentences && sidecar.sentences.length === sentenceTexts.length) {
    windows = sidecar.sentences;
  } else if (wordSpans) {
    windows = [];
    let k = 0;
    for (const ws of sentenceWordTexts) {
      const first = wordSpans[k];
      const last = wordSpans[k + ws.length - 1];
      windows.push({ start: first.start, end: last.end });
      k += ws.length;
    }
  }
  const last = windows ? windows[windows.length - 1].end : 0;
  const total = Math.max(D, last);
  if (!windows) windows = spread(sentenceTexts.map(speechWeight), 0, total);

  const sentences: SpokenSentence[] = [];
  let k = 0;
  sentenceTexts.forEach((text, i) => {
    const w = windows![i];
    const ws = sentenceWordTexts[i];
    let words: TimedSpan[];
    if (wordSpans) {
      words = wordSpans.slice(k, k + ws.length);
    } else {
      words = spread(ws.map(speechWeight), w.start, w.end).map((s, j) => ({ text: ws[j], ...s }));
    }
    k += ws.length;
    sentences.push({ text, start: w.start, end: w.end, words });
  });
  return { duration: total, sentences };
}

// ── Aligning what is SHOWN to what is SPOKEN ─────────────────────────────────

export interface Window { start: number; end: number }

/**
 * Time windows for the on-screen sentences. Counts match → the spoken windows
 * verbatim (sentence i is read as sentence i). Otherwise the shown sentences
 * take proportional shares of the spoken timeline by character weight — a
 * share is walked through the spoken sentences' own weights, so a sidecar's
 * real pacing still stretches the map. No spoken track (silent beat) → the
 * shares spread over [0, duration] directly.
 */
export function alignShownToSpoken(
  shownWeights: number[],
  spoken: SpokenSentence[] | null,
  duration: number,
): Window[] {
  if (shownWeights.length === 0) return [];
  if (spoken && spoken.length === shownWeights.length) {
    return spoken.map(s => ({ start: s.start, end: s.end }));
  }
  if (!spoken || spoken.length === 0) return spread(shownWeights, 0, duration);

  // Piecewise map: cumulative spoken weight fraction → time along the spoken sentences.
  const sw = spoken.map(s => speechWeight(s.text));
  const swTotal = sw.reduce((a, b) => a + b, 0) || 1;
  const knots: { f: number; t: number }[] = [];
  let acc = 0;
  spoken.forEach((s, i) => {
    knots.push({ f: acc / swTotal, t: s.start });
    acc += sw[i];
    knots.push({ f: acc / swTotal, t: s.end });
  });
  const timeAt = (f: number): number => {
    if (f <= 0) return knots[0].t;
    for (let i = 1; i < knots.length; i++) {
      if (f <= knots[i].f) {
        const a = knots[i - 1], b = knots[i];
        const span = b.f - a.f;
        return span <= 0 ? b.t : a.t + ((f - a.f) / span) * (b.t - a.t);
      }
    }
    return knots[knots.length - 1].t;
  };
  const total = shownWeights.reduce((a, b) => a + b, 0) || 1;
  const out: Window[] = [];
  acc = 0;
  for (const w of shownWeights) {
    const s = timeAt(acc / total);
    acc += w;
    out.push({ start: s, end: timeAt(acc / total) });
  }
  return out;
}

// ── The cursor: which sentence is live at time t ─────────────────────────────

export type SpeechState = 'waiting' | 'speaking' | 'spoken';
export interface SpeechCursor {
  states: SpeechState[];
  /** Index of the sentence being spoken (or the last spoken one in a gap), −1 before the first. */
  current: number;
  /** 0‥1 sweep progress along the current sentence (1 once it is done). */
  progress: number;
}

/**
 * States of a list of windows at clip time `t` (seconds). `lead` moves every
 * boundary a touch earlier so the eye arrives before the voice does. The
 * windows are assumed in order; a gap between two of them keeps the earlier
 * one 'spoken' and the later 'waiting'.
 */
export function speechStatesAt(windows: Window[], t: number, lead = 0): SpeechCursor {
  const states: SpeechState[] = [];
  let current = -1;
  let progress = 0;
  windows.forEach((w, i) => {
    const start = w.start - lead;
    const end = w.end - lead;
    if (t >= end) { states.push('spoken'); current = i; progress = 1; }
    else if (t >= start) {
      states.push('speaking');
      current = i;
      const span = end - start;
      progress = span > 0 ? Math.min(1, Math.max(0, (t - start) / span)) : 1;
    } else states.push('waiting');
  });
  return { states, current, progress };
}

/** How many of a sentence's words have been reached at time t (0‥words.length). */
export function wordsLitAt(words: TimedSpan[], t: number, lead = 0): number {
  let n = 0;
  for (const w of words) { if (t >= w.start - lead) n++; else break; }
  return n;
}
