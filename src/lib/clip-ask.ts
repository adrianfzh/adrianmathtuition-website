// 💬 "Ask about this step" under a one-minute clip (SPEC-CLIP-PIPELINE.md §2b, 15 Oct 2026).
// Pure helpers: what is on the board at a beat, the beat's ready questions, the message the
// Ask chat sends, and the hand-over between the clip and /app/ask (sessionStorage, one read).
// The switch is CLIP_ASK_OPEN_TO_STUDENTS in lib/portal-beta.

import { boardStateAt, sceneTokens, tokenShown } from './lesson-beats';
import { hasBeats, type PlayScene, type Scene } from './lesson-script';

/** Used when a beat has no `asks` of its own. */
export const FALLBACK_ASKS = ['Why this step?', 'Explain this step another way'] as const;

/** The beat's ready questions (≤ 3), or the two plain ones. */
export function readyAsks(scene: Scene | PlayScene, beat: number): string[] {
  const own = hasBeats(scene) ? scene.beats[beat]?.asks : undefined;
  const clean = (own ?? []).map(a => a.trim()).filter(Boolean).slice(0, 3);
  return clean.length ? clean : [...FALLBACK_ASKS];
}

/**
 * The working on the board once beat `beat` has finished — one TeX line per equation line, only
 * the tokens already written (a line half-way through shows only its written half).
 */
export function boardTexAt(scene: Scene | PlayScene, beat: number): string[] {
  if (scene.type !== 'equation-steps' || !hasBeats(scene)) return [];
  const board = boardStateAt(scene, beat, Number.MAX_SAFE_INTEGER);
  const refs = sceneTokens(scene);
  const out: string[] = [];
  scene.steps.forEach((s, line) => {
    const shown = s.tokens.filter((_, i) => tokenShown(board, scene, line, i)).map(t => t.tex.trim());
    if (shown.length && refs.some(r => r.line === line)) out.push(shown.join(' '));
  });
  return out;
}

/** The voice script spells ln as "L N" so the voice says it; the chat reads "ln". */
export function spokenToText(say: string): string {
  return say.replace(/\bL N\b/g, 'ln').replace(/\s+/g, ' ').trim();
}

/** The context the chat gets in front of the student's question. */
export function clipContext(o: { title: string; topic: string; intro?: string | null; lines: string[]; say: string }): string {
  const parts = [`I'm watching a short clip: "${o.title}" (${o.topic}).`];
  if (o.intro?.trim()) parts.push(`The question: ${o.intro.trim()}`);
  if (o.lines.length) parts.push(['On the board so far:', ...o.lines.map(l => `$${l}$`)].join('\n'));
  if (o.say.trim()) parts.push(`The step being explained: "${spokenToText(o.say)}"`);
  return parts.join('\n\n');
}

/** The message the chat sends: the context, then the student's question. */
export function clipQuestion(context: string, question: string): string {
  return `${context}\n\nMy question: ${question.trim()}`;
}

// ── The hand-over: clip → /app/ask → back ───────────────────────────────────

export const CLIP_ASK_KEY = 'am_ask_from_clip';

export interface ClipAskHandoff {
  /** clipContext(...) — sent in front of the first question, never shown in the bubble. */
  context: string;
  /** Short label for the chip above the chat ("Growth and decay · step 6 of 8"). */
  label: string;
  /** A ready question the student tapped (sent at once), or null (they type their own). */
  question: string | null;
  /** Back to the clip at the same step. */
  backHref: string;
  /** When it was written — a hand-over older than 10 minutes is ignored. */
  at: number;
}

export function writeClipAsk(h: Omit<ClipAskHandoff, 'at'>): void {
  try { sessionStorage.setItem(CLIP_ASK_KEY, JSON.stringify({ ...h, at: Date.now() })); } catch { /* the chat opens empty */ }
}

/** Read the hand-over once (it is removed), or null. */
export function takeClipAsk(now = Date.now()): ClipAskHandoff | null {
  try {
    const raw = sessionStorage.getItem(CLIP_ASK_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(CLIP_ASK_KEY);
    return parseClipAsk(raw, now);
  } catch { return null; }
}

/** Pure: a stored hand-over, checked. */
export function parseClipAsk(raw: string, now = Date.now()): ClipAskHandoff | null {
  try {
    const h = JSON.parse(raw) as Partial<ClipAskHandoff>;
    if (typeof h.context !== 'string' || !h.context || typeof h.backHref !== 'string') return null;
    if (!h.backHref.startsWith('/app/lesson/')) return null;
    if (typeof h.at !== 'number' || now - h.at > 10 * 60_000) return null;
    return {
      context: h.context,
      label: typeof h.label === 'string' ? h.label : '',
      question: typeof h.question === 'string' && h.question.trim() ? h.question.trim() : null,
      backHref: h.backHref,
      at: h.at,
    };
  } catch { return null; }
}

/** The ?at= stop a clip resumes from: a whole number, else 0. */
export function parseResumeStop(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
