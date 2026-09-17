// The one line a Practice Again sheet gets inside its paper's card on
// /app/marking (Adrian, 17 Sep 2026: "put done or not done — colour code them
// in a way that may prompt students to do them"; the "compulsory" chip went).
//
// Pure: the page decides WHERE the line sits (under a paper, once at the foot
// of a bundle), this decides WHAT it says and which colour it wears. The
// tones are the same three the score chip uses — green is finished, amber is
// waiting on Adrian, rose is the student's move.

export type SheetLineTone = 'done' | 'waiting' | 'todo' | 'quiet';

export interface SheetLineInput {
  /** portal_assignments.status — 'assigned' | 'submitted' | 'marked' (held/revoked never reach the student). */
  status: string;
  score?: number | null;
  out_of?: number | null;
}

export interface SheetLine {
  tone: SheetLineTone;
  text: string;
  /** Show the Open sheet + Hand in buttons — only while it is the student's move. */
  actions: boolean;
}

/** The line for a sheet the student HAS (released to them). */
export function sheetLine(sheet: SheetLineInput): SheetLine {
  if (sheet.status === 'marked') {
    const score = sheet.score != null && sheet.out_of ? ` · ${sheet.score}/${sheet.out_of}` : '';
    return { tone: 'done', text: `Practice Again done${score}`, actions: false };
  }
  if (sheet.status === 'submitted') return { tone: 'waiting', text: 'Practice Again handed in · being marked', actions: false };
  return { tone: 'todo', text: 'Practice Again · not done yet', actions: true };
}

/** The line for a paper with NO sheet yet, from its latest sheet job — null when there is nothing to say. */
export function sheetJobLine(job: { status: string; noSheet: boolean } | null | undefined): SheetLine | null {
  if (!job) return null;
  if (job.status === 'queued' || job.status === 'claimed') return { tone: 'quiet', text: 'Practice Again is being written', actions: false };
  if (job.status === 'done' && !job.noSheet) return { tone: 'quiet', text: 'Practice Again written · Adrian is checking it', actions: false };
  return null;
}

/** The caption on a frame of papers that share one sheet. */
export function bundleCaption(n: number): { title: string; sub: string } {
  return {
    title: `One Practice Again sheet · made from these ${n} papers`,
    sub: n === 2
      ? 'It teaches what you lost marks on in both papers, so you do it once.'
      : `It teaches what you lost marks on across all ${n} papers, so you do it once.`,
  };
}
