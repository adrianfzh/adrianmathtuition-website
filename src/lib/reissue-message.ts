// What a student is told when their marked copy is replaced.
//
// A re-issue (mark-triage {action:'reissue'}) swaps the copy in the app for a
// new one. Until 14 Sep 2026 it said the same thing every time — "Adrian checked
// your marked X and updated it — it is now 77/90" — which is true of the case it
// was written for (an override on the desk) and false of the two that came later.
//
//  • A re-mark the student never saw the predecessor of reads as the paper's
//    FIRST copy (11 Sep 2026, Gavin Woon — lib/remark-internal.ts).
//  • A copy that was missing pages is not a re-mark at all. Alexis Wong's A Math
//    GCE 2022 Paper 1 was marked in full; four annotated pages were lost on OUR
//    upload and never reached her copy (lib/marked-pdf-gaps.ts). Adrian, 14 Sep
//    2026: "don't tell her it's redrawn — some pages wasn't uploaded properly
//    previously, here is the full copy". Saying Adrian checked it and updated it
//    would claim a re-mark that never happened; saying "it is now 77/90" would
//    imply a score that moved. Neither is true, and the second reads as though
//    the missing pages were her fault.
//
// So the line is chosen from the REASON the copy changed, and this module owns
// the choice: the self-fix (a gap repaired before or after release) and the desk
// both reach the student through it, and neither re-derives the wording.
import { escapeHtml } from '@/lib/math-inline';

/** Why the student's copy is being replaced. */
export type ReissueReason =
  /** Adrian changed something on the desk — the marking that stands has moved. */
  | 'checked'
  /** Pages that never uploaded are in the copy now; the marking did not change. */
  | 'pages-recovered';

export type ReissueLineInput = {
  reason: ReissueReason;
  /** The paper's name as the student knows it; escaped here, not by the caller. */
  paper: string;
  awarded: number;
  max: number;
  /** True when the student never received the marking this one replaces. */
  internal: boolean;
  /** Site origin for the app link. */
  site: string;
};

/**
 * The one line the student gets. Pure.
 *
 * `internal` wins over everything: a student who never saw the previous copy is
 * being told about their paper for the first time, whatever moved it.
 */
export function reissueLine(input: ReissueLineInput): string {
  const paper = `<b>${escapeHtml(input.paper)}</b>`;
  const score = input.max > 0 ? `<b>${input.awarded}/${input.max}</b>` : '';
  const link = `${input.site}/app/marking`;

  if (input.internal) {
    return `📄 Your marked ${paper} is ready${score ? ` — ${score}` : ''}.\n\n${link}`;
  }

  if (input.reason === 'pages-recovered') {
    // No "updated", no "re-marked", no new score: nothing about the marking
    // moved. What changed is that the copy is now the whole paper.
    return `📄 Some pages of your marked ${paper} didn't upload properly the first time, so they were missing from your copy. The full paper is in the app now${score ? ` — your mark is unchanged, ${score}` : ''}.\n\n${link}`;
  }

  return `✏️ Adrian checked your marked ${paper} and updated it${score ? ` — it is now ${score}` : ''}. The copy in the app is the new one.`;
}

/** The reason off a request body — anything unrecognised is the desk's. */
export function parseReissueReason(v: unknown): ReissueReason {
  return v === 'pages-recovered' ? 'pages-recovered' : 'checked';
}
