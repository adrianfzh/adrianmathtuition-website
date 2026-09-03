// The beat model — what a scene's actions MEAN on the board (pure).
//
// A beat scene (lib/lesson-script.ts `beats`) is narrated as short spoken
// ideas, each with actions cued to its own clip. This module turns "beat k,
// `fired` actions in" into a BoardState the player renders declaratively:
// which elements are shown (and whether they arrived by draw-on), which
// flights have flown, which graph state holds, and the pen layer (pulses,
// marks, notes, focus). The player never interprets an action itself — it
// diffs two BoardStates and animates what changed.
//
// Addressing. Every element the actions can touch has one canonical key:
//   line:n      an equation-steps line (annotate: line:0 is the token row)
//   tok:n:i     token i of line n (ids resolve to this, so unnamed tokens
//               written as part of a line have a key too)
//   callout:n   an annotate callout
//   text:<f>    a prose field (title / promise / heading / intro / caption / prompt)
//   para:p      one paragraph of a caption's text (text:"text" = all of them)
//   note:<b>:<j>  a handwritten aside — beat b, action j (a slot laid out from
//               mount inside its token's line, or in the margin under the working)
//
// Visibility rules (the part authors lean on):
//   · Lines, tokens and callouts are HIDDEN until an action shows them — that
//     is the point of a beat scene. Prose fields are the other way round: a
//     field NO action targets is static (shown from entry, the question stays
//     on the board); a targeted one waits for its action.
//   · A token targeted on its own (write/reveal by id, or a `move` for the id
//     it flies from) waits for that action even when its line is written.
//     Untargeted tokens follow the pen left to right: an untargeted token is
//     visible once its line is on AND every targeted token before it on the
//     line has been written — "x² − 3x + 2 =" appears, the pen pauses, the
//     square is written when the voice says so, then "+ 2" follows.
//   · A `from` token with no `move` action flies the moment its line is shown
//     (today's behaviour); with one, it waits for the move.
//   · The graph starts on state 0; `morph` moves it.
//   · The pen layer accumulates until `clear`.
//
// `at` is estimated: an action fires when the clip's elapsed fraction reaches
// it. Unspecified `at`s are spread in listed order — the first unspecified
// action of a beat fires with the clip's first frame, the rest across the
// clip's first 70 % (or between the explicit neighbours around them).
//
// Pure module (repo testing policy): no I/O, no React.

import { splitParagraphs } from './lesson-speech';
import {
  hasBeats, type Beat, type BeatAction, type BeatTarget, type ClearScope, type MarkKind,
  type PlayScene, type Scene,
} from './lesson-script';

export type ElementKey = string;

/** Where a token sits, for the tok:n:i key. */
export interface TokenRef { line: number; index: number; id?: string; from?: string }

/** Every token of a scene in writing order (equation-steps lines / annotate's one row). */
export function sceneTokens(scene: Scene | PlayScene): TokenRef[] {
  if (scene.type === 'equation-steps') {
    return scene.steps.flatMap((s, line) => s.tokens.map((t, index) => ({ line, index, id: t.id, from: t.from })));
  }
  if (scene.type === 'annotate') return scene.tokens.map((t, index) => ({ line: 0, index, id: t.id, from: t.from }));
  return [];
}

export const tokKey = (line: number, index: number): ElementKey => `tok:${line}:${index}`;
export const lineKey = (line: number): ElementKey => `line:${line}`;

/** How many paragraphs a caption's text has (its `para` targets). */
export function paragraphCount(scene: Scene | PlayScene): number {
  return scene.type === 'caption' ? splitParagraphs(scene.text).length : 0;
}

/**
 * The canonical keys a target names — one, or every paragraph for a bare
 * text:"text". Null for anything the validator would have refused.
 */
export function targetKeys(scene: Scene | PlayScene, t: BeatTarget): ElementKey[] {
  if (t.step !== undefined) return [lineKey(t.step)];
  if (t.callout !== undefined) return [`callout:${t.callout}`];
  if (t.token !== undefined) {
    const ref = sceneTokens(scene).find(r => r.id === t.token);
    return ref ? [tokKey(ref.line, ref.index)] : [];
  }
  if (t.text === 'expression') return [lineKey(0)];
  if (t.text === 'text') {
    if (t.para !== undefined) return [`para:${t.para}`];
    const n = paragraphCount(scene);
    return Array.from({ length: n }, (_, p) => `para:${p}`);
  }
  if (t.text !== undefined) return [`text:${t.text}`];
  return [];
}

// ── Timing ───────────────────────────────────────────────────────────────────

/** Unspecified actions after the last explicit `at` spread up to here. */
const DEFAULT_TAIL = 0.7;

/**
 * The firing fraction of every action in a beat, in listed order. Explicit
 * `at`s stand (clamped 0‥1); a run of unspecified actions interpolates between
 * its explicit neighbours — from 0 (the clip's first frame) when nothing
 * explicit precedes it, to 0.7 when nothing follows. Non-decreasing by
 * construction when the explicit values are (the validator insists).
 */
export function resolveActionTimes(actions: readonly BeatAction[]): number[] {
  const n = actions.length;
  const out: number[] = new Array(n).fill(0);
  const explicit = actions.map(a => (typeof a.at === 'number' && Number.isFinite(a.at) ? Math.min(1, Math.max(0, a.at)) : null));
  let i = 0;
  while (i < n) {
    if (explicit[i] !== null) { out[i] = explicit[i] as number; i++; continue; }
    let j = i;
    while (j < n && explicit[j] === null) j++;
    const len = j - i;
    const hasLeft = i > 0;
    const left = hasLeft ? out[i - 1] : 0;
    const right = j < n ? (explicit[j] as number) : DEFAULT_TAIL;
    const span = Math.max(0, right - left);
    for (let k = 0; k < len; k++) {
      // From the clip's first frame when nothing precedes; strictly between two neighbours otherwise.
      out[i + k] = hasLeft ? left + (span * (k + 1)) / (len + 1) : left + (span * k) / len;
    }
    i = j;
  }
  for (let k = 1; k < n; k++) if (out[k] < out[k - 1]) out[k] = out[k - 1];
  return out;
}

/** How many actions have fired by clip fraction `frac` (a prefix — times are non-decreasing). */
export function firedCountAt(times: readonly number[], frac: number): number {
  let n = 0;
  for (const t of times) { if (t <= frac + 1e-9) n++; else break; }
  return n;
}

/** Silent Auto beat for a beat (ms at 1×): a tutor's pace over its words, with a breath. */
export function beatAutoMs(beat: Beat): number {
  const words = beat.say.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(16000, Math.max(1600, 900 + words * 340));
}

/** How long a focus holds the view by default (s at 1×). */
export const FOCUS_HOLD_S = 2.2;

// ── Board state ──────────────────────────────────────────────────────────────

export interface BoardMark { kind: MarkKind; tokens: string[]; seq: number }
export interface BoardNote { id: ElementKey; text: string; near: string | null; seq: number }
export interface BoardPulse { tokens: string[]; seq: number }
export interface BoardFocus { key: ElementKey; hold: number; seq: number }

export interface BoardState {
  /** Elements made visible so far (lines, tokens by key, callouts, prose, notes). */
  shown: Set<ElementKey>;
  /** Subset of `shown` that arrived by `write` — they draw on; the rest fade in. */
  written: Set<ElementKey>;
  /** Elements SOME action in the scene targets — the rest of the prose is static. */
  targeted: Set<ElementKey>;
  /** `from` ids a `move` action fires — those tokens wait for it. */
  movable: Set<string>;
  /** `from` ids whose flight has fired (explicitly, or with their line's reveal). */
  moved: Set<string>;
  /** graph-morph: the state that holds. */
  state: number;
  pulses: BoardPulse[];
  marks: BoardMark[];
  notes: BoardNote[];
  focus: BoardFocus | null;
  /** Actions applied so far across the scene — the seq of the next one. */
  seq: number;
}

/** The write/reveal targets and move ids of a whole scene (what waits for an action). */
export function sceneTargets(scene: Scene | PlayScene): { targeted: Set<ElementKey>; movable: Set<string> } {
  const targeted = new Set<ElementKey>();
  const movable = new Set<string>();
  if (!hasBeats(scene)) return { targeted, movable };
  for (const b of scene.beats) {
    for (const a of b.do) {
      if (a.do === 'write' || a.do === 'reveal') for (const k of targetKeys(scene, a)) targeted.add(k);
      else if (a.do === 'move') movable.add(a.from);
    }
  }
  return { targeted, movable };
}

export function emptyBoard(scene: Scene | PlayScene): BoardState {
  const { targeted, movable } = sceneTargets(scene);
  return {
    shown: new Set(), written: new Set(), targeted, movable, moved: new Set(),
    state: 0, pulses: [], marks: [], notes: [], focus: null, seq: 0,
  };
}

const asList = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v]);

function tokenTargeted(board: BoardState, ref: TokenRef): boolean {
  return board.targeted.has(tokKey(ref.line, ref.index)) || (ref.from !== undefined && board.movable.has(ref.from));
}

/** Apply one action to a board (mutates). `slot` = "<beat>:<j>" names the note it may create. */
export function applyAction(board: BoardState, scene: Scene | PlayScene, action: BeatAction, slot = '0:0'): void {
  const seq = board.seq++;
  const tokens = sceneTokens(scene);
  const show = (key: ElementKey, write: boolean) => {
    board.shown.add(key);
    if (write) board.written.add(key);
  };
  switch (action.do) {
    case 'write':
    case 'reveal': {
      const write = action.do === 'write';
      for (const key of targetKeys(scene, action)) {
        if (key.startsWith('line:')) {
          const line = Number(key.slice(5));
          show(key, write);
          // A from-token with no move of its own flies with its line.
          for (const ref of tokens) {
            if (ref.line !== line || ref.from === undefined || board.movable.has(ref.from)) continue;
            if (!board.targeted.has(tokKey(ref.line, ref.index))) board.moved.add(ref.from);
          }
        } else if (key.startsWith('tok:')) {
          const ref = tokens.find(r => tokKey(r.line, r.index) === key);
          if (ref) {
            show(lineKey(ref.line), false);
            if (ref.from !== undefined) board.moved.add(ref.from);
          }
          show(key, write);
        } else show(key, write);
      }
      break;
    }
    case 'move': {
      board.moved.add(action.from);
      for (const ref of tokens) {
        if (ref.from !== action.from) continue;
        show(lineKey(ref.line), false);
        show(tokKey(ref.line, ref.index), false);
      }
      break;
    }
    case 'morph':
      board.state = action.state;
      break;
    case 'highlight':
      board.pulses.push({ tokens: asList(action.token), seq });
      break;
    case 'mark':
      board.marks.push({ kind: action.kind, tokens: asList(action.token), seq });
      break;
    case 'note': {
      const id = `note:${slot}`;
      board.notes.push({ id, text: action.text, near: action.near ?? null, seq });
      show(id, true);
      break;
    }
    case 'focus': {
      const [key] = targetKeys(scene, action);
      if (key) board.focus = { key, hold: action.hold ?? FOCUS_HOLD_S, seq };
      break;
    }
    case 'clear': {
      const what: ClearScope = action.what ?? 'pen';
      if (what === 'pen' || what === 'marks' || what === 'board') board.marks = [];
      if (what === 'pen' || what === 'notes' || what === 'board') board.notes = [];
      if (what === 'pen' || what === 'focus' || what === 'board') board.focus = null;
      if (what === 'board') { board.shown.clear(); board.written.clear(); board.moved.clear(); }
      break;
    }
  }
}

/**
 * The board after every action of beats < `beat` and the first `fired`
 * actions of beat `beat` (cumulative — a beat never undoes an earlier one
 * except through `clear`). A scene without beats gets an empty board.
 */
export function boardStateAt(scene: Scene | PlayScene, beat: number, fired: number): BoardState {
  const board = emptyBoard(scene);
  if (!hasBeats(scene)) return board;
  scene.beats.forEach((b, k) => {
    if (k > beat) return;
    const upTo = k < beat ? b.do.length : Math.min(fired, b.do.length);
    for (let j = 0; j < upTo; j++) applyAction(board, scene, b.do[j], `${k}:${j}`);
  });
  return board;
}

/** A note slot the views lay out from mount (hidden until its action fires). */
export interface NoteSlot {
  id: ElementKey;
  text: string;
  /** The token it sits beside, or null for the margin under the working. */
  near: string | null;
  /** The line the slot lives in (the near token's line), or null for the margin. */
  line: number | null;
}

/** Every note a scene's beats will ever write, with the line each belongs to. */
export function sceneNotes(scene: Scene | PlayScene): NoteSlot[] {
  if (!hasBeats(scene)) return [];
  const tokens = sceneTokens(scene);
  const out: NoteSlot[] = [];
  scene.beats.forEach((b, k) => b.do.forEach((a, j) => {
    if (a.do !== 'note') return;
    const near = a.near ?? null;
    const ref = near ? tokens.find(r => r.id === near) : undefined;
    out.push({ id: `note:${k}:${j}`, text: a.text, near, line: ref ? ref.line : null });
  }));
  return out;
}

// ── Reading a board ──────────────────────────────────────────────────────────

export function lineOn(board: BoardState, line: number): boolean {
  return board.shown.has(lineKey(line));
}

/**
 * Is token `index` of `line` visible? The left-to-right rule: its line is on,
 * every targeted token before it has been written, and — if it is targeted
 * itself — its own action has fired.
 */
export function tokenShown(board: BoardState, scene: Scene | PlayScene, line: number, index: number): boolean {
  if (!lineOn(board, line)) return false;
  const row = sceneTokens(scene).filter(r => r.line === line);
  for (const ref of row) {
    if (ref.index > index) break;
    const key = tokKey(ref.line, ref.index);
    const targeted = tokenTargeted(board, ref);
    const own = board.shown.has(key) || (ref.from !== undefined && board.moved.has(ref.from));
    if (ref.index === index) return targeted ? own : true;
    if (targeted && !own) return false;
  }
  return true;
}

/** Did this token arrive by draw-on (its own write, or its line's)? */
export function tokenWritten(board: BoardState, line: number, index: number): boolean {
  return board.written.has(tokKey(line, index)) || board.written.has(lineKey(line));
}

/**
 * A prose field / paragraph / callout: shown when its key is, or when no
 * action in the scene targets it at all (static). Lines and callouts are never
 * static — `callout:n` only shows on its action.
 */
export function elementShown(board: BoardState, key: ElementKey): boolean {
  if (board.shown.has(key)) return true;
  if (key.startsWith('line:') || key.startsWith('tok:') || key.startsWith('callout:') || key.startsWith('note:')) return false;
  return !board.targeted.has(key);
}

/** Is this element static in the scene (no action ever targets it)? */
export function elementStatic(board: BoardState, key: ElementKey): boolean {
  if (key.startsWith('line:') || key.startsWith('tok:') || key.startsWith('callout:') || key.startsWith('note:')) return false;
  return !board.targeted.has(key);
}

// ── Prose groups: which beat reads which words ───────────────────────────────

export interface ProseGroup {
  /** The beat whose clip the prose belongs to. */
  beat: number;
  /** Fraction into that clip at which the prose appears (its write/reveal `at`). */
  at: number;
}

/** Does this action show `key` (directly, or a line through one of its tokens / a landing)? */
function actionShows(scene: Scene | PlayScene, action: BeatAction, key: ElementKey): boolean {
  if (action.do === 'write' || action.do === 'reveal') {
    const keys = targetKeys(scene, action);
    if (keys.includes(key)) return true;
    if (key.startsWith('line:')) {
      const line = Number(key.slice(5));
      return keys.some(k => k.startsWith(`tok:${line}:`));
    }
    return false;
  }
  if (action.do === 'move' && key.startsWith('line:')) {
    const line = Number(key.slice(5));
    return sceneTokens(scene).some(r => r.line === line && r.from === action.from);
  }
  return false;
}

/**
 * The beat (and the fraction into its clip) that first shows an element —
 * the group the teacher's cursor walks its sentences in. Null when no action
 * shows it (static prose: rendered at full ink, never animated).
 */
export function proseGroup(scene: Scene | PlayScene, key: ElementKey): ProseGroup | null {
  if (!hasBeats(scene)) return null;
  // An EXPLICIT write/reveal of the element (step: n for a line's note) wins
  // over an implicit show (a token of the line written, a landing) — so a
  // line whose square flies in during one beat can still have its note read
  // by the beat that reveals the line proper.
  for (const [beat, b] of scene.beats.entries()) {
    const times = resolveActionTimes(b.do);
    for (const [j, a] of b.do.entries()) {
      if ((a.do === 'write' || a.do === 'reveal') && targetKeys(scene, a).includes(key)) return { beat, at: times[j] };
    }
  }
  for (const [beat, b] of scene.beats.entries()) {
    const times = resolveActionTimes(b.do);
    for (const [j, a] of b.do.entries()) {
      if (actionShows(scene, a, key)) return { beat, at: times[j] };
    }
  }
  return null;
}

/** A beat's own actions with their resolved times — what the director watches. */
export function beatTimeline(scene: PlayScene, beat: number): { action: BeatAction; at: number }[] {
  if (!hasBeats(scene)) return [];
  const b = scene.beats[beat];
  if (!b) return [];
  const times = resolveActionTimes(b.do);
  return b.do.map((action, j) => ({ action, at: times[j] }));
}
