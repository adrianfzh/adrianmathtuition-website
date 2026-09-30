// 🪜 "Stuck? Next step" — the ladder on a practice question (1 Oct 2026).
//
// Adrian, on a student weak at trig identity proofs with an exam coming: the
// Ask tab hands over the whole proof, which teaches nothing; what a stuck
// student needs is the NEXT line only. ONE button on the practice screen: the
// bank solution's own working, one line revealed per tap, no model call (the
// lines are the ones Adrian already vets). A photo-continuation ("next step
// from my line") and a worksheet-card signpost were built the same day and cut
// within the hour — Adrian: "too complicated. simplify it".
// Pure here; the route (api/portal/practice/ladder) does the I/O. Lines
// revealed before Check ride on the attempt (marking_json.ladder) so an
// assisted pass is never filed as a clean one.

import type { BankPart } from './bank-question-markdown';
import { solutionView, stripMarkNotes, displayFractions, type SolLine } from './solution-readability';

export type LadderStep =
  /** A part heading — "(b)(ii)" — revealed with the line under it, never on its own. */
  | { kind: 'label'; text: string }
  | { kind: 'step' | 'quiet'; text: string }
  | { kind: 'answer'; text: string };

export interface LadderSource {
  solution?: string | null;
  answer?: string | null;
  parts?: BankPart[] | null;
}

const NO_ANSWER = /^(?:proof|proved|proven|shown|show|qed|n\/a|none|nil|-|—)\.?$/i;

function linesOf(sol: SolLine[]): LadderStep[] {
  const out: LadderStep[] = [];
  for (const l of sol) {
    if (l.kind === 'label') out.push({ kind: 'label', text: l.text });
    else if (l.kind === 'display') out.push({ kind: 'step', text: stripMarkNotes(l.text) });
    else out.push({ kind: l.kind, text: stripMarkNotes(l.text) });
  }
  return out;
}

/**
 * The steps of a question's working in reading order: the main route only
 * (alternatives and the scheme never enter the ladder), labels folded in front
 * of the line they head, the bank's Answer last when there is one. Multi-part
 * rows use the per-part working, as solutionMarkdown does. Pure.
 */
export function ladderSteps(q: LadderSource): LadderStep[] {
  const parts = Array.isArray(q.parts) ? q.parts : [];
  const hasPartSolutions = parts.some(p => p?.solution || p?.subparts?.some(sp => sp?.solution));
  const out: LadderStep[] = [];
  if (hasPartSolutions) {
    for (const p of parts) {
      if (p?.solution) { out.push({ kind: 'label', text: `(${p.label ?? ''})` }); out.push(...linesOf(solutionView(p.solution).main)); }
      for (const sp of (Array.isArray(p?.subparts) ? p.subparts : [])) {
        if (sp?.solution) { out.push({ kind: 'label', text: `(${p.label ?? ''})(${sp.label ?? ''})` }); out.push(...linesOf(solutionView(sp.solution).main)); }
      }
    }
  } else if (q.solution && q.solution.trim()) {
    out.push(...linesOf(solutionView(q.solution).main));
  }
  // A label is never the last thing revealed: drop a trailing or doubled one.
  const cleaned: LadderStep[] = [];
  for (const s of out) {
    if (s.kind === 'label' && cleaned.length && cleaned[cleaned.length - 1].kind === 'label') cleaned.pop();
    cleaned.push(s);
  }
  while (cleaned.length && cleaned[cleaned.length - 1].kind === 'label') cleaned.pop();
  // A proof's "answer" in the bank is the word Proof / Shown — nothing to reveal.
  const ans = (q.answer || '').trim();
  if (ans && !NO_ANSWER.test(ans)) cleaned.push({ kind: 'answer', text: ans });
  return cleaned;
}

/** How many taps the ladder takes: a label counts with the line it heads. */
export function ladderLength(steps: LadderStep[]): number {
  return steps.filter(s => s.kind !== 'label').length;
}

/**
 * The first `n` revealed steps (labels ride along with the line they head).
 * `done` = nothing left to reveal.
 */
export function ladderSlice(steps: LadderStep[], n: number): { steps: LadderStep[]; revealed: number; total: number; done: boolean } {
  const total = ladderLength(steps);
  const want = Math.max(0, Math.min(Math.floor(n) || 0, total));
  const out: LadderStep[] = [];
  let count = 0;
  for (const s of steps) {
    if (count >= want) break;
    out.push(s);
    if (s.kind !== 'label') count++;
  }
  return { steps: out, revealed: count, total, done: count >= total };
}

/** Markdown for the revealed steps: labels bold, quiet lines in a grey aside, the answer bold. */
export function ladderMarkdown(steps: LadderStep[]): string {
  return steps.map(s => {
    if (s.kind === 'label') return `**${s.text}**`;
    if (s.kind === 'answer') return `**Answer:** ${s.text}`;
    if (s.kind === 'quiet') return `<span class="text-slate-400 text-xs">${displayFractions(s.text)}</span>`;
    return displayFractions(s.text);
  }).join('\n\n');
}

/** What the attempt row records when the student checked after revealing steps. */
export type LadderMeta = { revealed: number; total: number };

export function parseLadderMeta(raw: unknown): LadderMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const revealed = Number(r.revealed), total = Number(r.total);
  if (!Number.isFinite(revealed) || !Number.isFinite(total) || revealed < 0 || total < 0) return null;
  const meta: LadderMeta = { revealed: Math.floor(revealed), total: Math.floor(total) };
  if (meta.revealed === 0) return null;
  return meta;
}

/** True when the student had help before checking: the pass is not a clean one. */
export function ladderAssisted(meta: LadderMeta | null): boolean {
  return !!meta && meta.revealed > 0;
}

/** The grey line under an assisted grade. */
export function ladderAssistLine(meta: LadderMeta | null): string {
  if (!ladderAssisted(meta)) return '';
  return `You used ${meta!.revealed} step${meta!.revealed === 1 ? '' : 's'}. Try one like it without them.`;
}
