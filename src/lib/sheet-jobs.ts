// Self-study sheet queue — pure logic (SPEC-TEACHING-CYCLE steps 3–6).
//
// Adrian taps 📘 on a marked paper; a headless Claude session on his Mac claims
// the job, runs the self-study-sheet skill, files the DOCX + PDF into Dropbox
// and completes the row. Same shape as the plan-marking worker, and the same
// hard-won rule: **a dead session must never strand a job**, so a claim is a
// LEASE with a heartbeat, and an expired lease is reclaimable.
//
// Everything here is pure (no I/O) and unit-tested — the route only orchestrates.

import { escapeTelegramHtml } from './telegram-html';

export type SheetJobStatus = 'queued' | 'claimed' | 'done' | 'failed' | 'cancelled';

export type SheetJob = {
  id: string;
  run_id: string;
  airtable_student_id: string;
  student_name: string;
  paper_name: string;
  focus: string | null;
  status: SheetJobStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  /** The worker's heartbeat label (diagnosing · drafting · verifying · rendering · filing) — optional, added 31 Aug 2026. */
  stage?: string | null;
  attempts: number;
  result: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  /** Release-by-silence (6 Sep 2026): when the cron may release paper + sheet; Adrian's Hold; the cron's stamp. */
  auto_release_at?: string | null;
  held_at?: string | null;
  auto_released_at?: string | null;
  /** Who asked for the sheet (8 Sep 2026): 'student' from the app, 'adrian' from the desk; 'auto'/null = the retired auto-queue. */
  requested_by?: 'student' | 'adrian' | 'auto' | null;
  /** A batch sheet (10 Sep 2026): every run it covers; run_id is the primary/newest. */
  run_ids?: string[] | null;
};

/** How long a claim survives without a heartbeat before anyone may retake it. */
export const LEASE_MS = 40 * 60 * 1000;   // sheet authoring is long: verify + render + figures
/** After this many attempts a job stops being retried and waits for Adrian. */
export const MAX_ATTEMPTS = 3;

/**
 * Is this claimed job abandoned? True when the lease has expired — the session
 * died, the Mac slept, the plan capped. The claimer's own name never matters:
 * whoever asks next may take it.
 */
export function claimExpired(job: Pick<SheetJob, 'status' | 'heartbeat_at' | 'claimed_at'>, now = Date.now()): boolean {
  if (job.status !== 'claimed') return false;
  const beat = job.heartbeat_at || job.claimed_at;
  if (!beat) return true;
  const t = Date.parse(beat);
  return !Number.isFinite(t) || now - t > LEASE_MS;
}

/**
 * What cancelling this job would mean — or why it can't be cancelled.
 *
 * Adrian mis-tapped 📘 next to 🗑 on a phone-sized row and a duplicate sheet
 * started building for a paper that already had one (31 Aug 2026). Undoing that
 * needed a hand-written DELETE against the table, because 'failed' requeues and
 * there was no other way to say "I changed my mind".
 *
 * `running` is the honest half: a claimed job has a headless session mid-way
 * through authoring, and nothing here can reach into it. Cancelling stops it
 * being retried, refuses its completion, and tells it to stop at its next
 * heartbeat — which is within a step, not instantly.
 */
export function cancelState(
  job: Pick<SheetJob, 'status'> | null | undefined,
): { can: boolean; running: boolean; reason?: string } {
  if (!job) return { can: false, running: false, reason: 'no sheet job for this paper' };
  if (job.status === 'queued') return { can: true, running: false };
  if (job.status === 'claimed') return { can: true, running: true };
  if (job.status === 'cancelled') return { can: false, running: false, reason: 'already cancelled' };
  if (job.status === 'done') return { can: false, running: false, reason: 'that sheet is already written' };
  return { can: false, running: false, reason: 'that job already stopped' };
}

/** The next job a worker should take: queued first (oldest), then abandoned claims. */
export function pickNextJob(jobs: SheetJob[], now = Date.now()): SheetJob | null {
  // 'cancelled' is terminal: it is neither queued nor a reclaimable lease, so it
  // falls out of both branches below. Asserted in the tests so a future edit to
  // either filter can't quietly resurrect a job Adrian stopped.
  const live = jobs.filter(j => j.attempts < MAX_ATTEMPTS);
  const queued = live
    .filter(j => j.status === 'queued')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  if (queued.length) return queued[0];
  const stale = live
    .filter(j => claimExpired(j, now))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return stale[0] ?? null;
}

/** A sheet that was actually written and filed. */
export type SheetFiledResult = {
  docx_path: string; pdf_path: string | null; wave: string[]; shelved: string[]; verified: string;
  /** What came from an earlier sheet on the same paper (Adrian, 9 Sep 2026: "perhaps some examples can be reused") — [] when the sheet was written from scratch. */
  reused: string[];
  /**
   * The writer's gap report (WORKER_PROMPT.md §1e, 11 Sep 2026): every found
   * gap is a section or a shelved entry with its paper, questions and marks.
   * The student's "Ask for the next wave" card reads the marks off it — a
   * left-out gap is offered only when it cost 3 marks or more — so it MUST
   * survive this sanitiser (it did not until 11 Sep 2026 evening: the report
   * was dropped on the floor and the card fell back to the flat list).
   */
  gaps?: { found: number; covered: number; shelved: ShelvedGap[] };
  /** Skills still failing after a returned practice sheet that this sheet taught as its last section (§1f). */
  carried?: { skill: string; from: string }[];
};

/**
 * The worker's honest "there is nothing here worth practising" — a COMPLETION,
 * not a failure (Adrian, 3 Sep 2026).
 *
 * Two of Kassandra Lim's papers came back 89/90 (one misread) and 87/90 (three
 * careless slips she had already got right at a previous sitting). The worker
 * read them correctly and concluded there was nothing to teach — but the only
 * way to close a job without a sheet was `fail`, which requeues. So the same
 * correct conclusion was reached three times, three plan sessions were spent on
 * it, and Adrian was Telegrammed "⚠️ Self-study sheet failed 3×" — an alarm for
 * a right answer. `fail` is for genuine failures now; this is for this.
 */
export type SheetNoResult = { noSheet: true; reason: string };

export type ShelvedGap = { skill: string; runs: { run_id: string; questions: string[]; marks: number }[]; why: string };

export type SheetJobResult = SheetFiledResult | SheetNoResult;

/** Said when the worker gives no reason of its own. */
export const NO_SHEET_REASON = 'nothing on this paper is worth practice';

export function isNoSheet(result: SheetJobResult | null | undefined): result is SheetNoResult {
  return !!result && (result as SheetNoResult).noSheet === true;
}

/**
 * `result.noSheet` as STORED on the row (jsonb, any shape) — for the desk and
 * the release path, which read the job back rather than the posted payload.
 */
export function readNoSheet(result: unknown): { noSheet: boolean; reason: string } {
  const r = result && typeof result === 'object' ? result as Record<string, unknown> : null;
  if (!r || !r.noSheet) return { noSheet: false, reason: '' };
  return { noSheet: true, reason: String(r.reason ?? '').trim().slice(0, 300) || NO_SHEET_REASON };
}

/** Validate the completion payload the worker posts back. Returns null when unusable. */
export function sanitizeResult(input: unknown): SheetJobResult | null {
  const r = (input ?? {}) as Record<string, unknown>;
  // "Nothing to teach" needs no files — that is the whole point of it.
  if (r.noSheet) return { noSheet: true, reason: String(r.reason ?? '').trim().slice(0, 300) || NO_SHEET_REASON };
  const docx = String(r.docx_path ?? '').trim();
  if (!docx) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
    .map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 20);
  return {
    docx_path: docx.slice(0, 400),
    pdf_path: r.pdf_path ? String(r.pdf_path).trim().slice(0, 400) : null,
    wave: list(r.wave),
    shelved: list(r.shelved),
    verified: String(r.verified ?? '').trim().slice(0, 120),
    reused: list(r.reused),
    ...(gapsOf(r.gaps) ? { gaps: gapsOf(r.gaps)! } : {}),
    ...(carriedOf(r.carried).length ? { carried: carriedOf(r.carried) } : {}),
  };
}

/** The gap report, bounded: 20 shelved entries, 6 runs each, 12 questions a run; anything malformed is simply absent. */
function gapsOf(v: unknown): SheetFiledResult['gaps'] | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as Record<string, unknown>;
  const shelved: ShelvedGap[] = (Array.isArray(g.shelved) ? g.shelved : []).slice(0, 20).flatMap(x => {
    if (!x || typeof x !== 'object') return [];
    const e = x as Record<string, unknown>;
    const skill = String(e.skill ?? '').trim().slice(0, 200);
    if (!skill) return [];
    const runs = (Array.isArray(e.runs) ? e.runs : []).slice(0, 6).flatMap(r => {
      if (!r || typeof r !== 'object') return [];
      const rr = r as Record<string, unknown>;
      return [{
        run_id: String(rr.run_id ?? '').trim().slice(0, 60),
        questions: (Array.isArray(rr.questions) ? rr.questions : []).map(q => String(q ?? '').trim().slice(0, 30)).filter(Boolean).slice(0, 12),
        marks: Math.max(0, Math.min(100, Number(rr.marks) || 0)),
      }];
    });
    // A flat `marks` on the entry (no runs) is kept as one anonymous run so the card can still count it.
    if (!runs.length && Number(e.marks) > 0) runs.push({ run_id: '', questions: [], marks: Math.min(100, Number(e.marks)) });
    return [{ skill, runs, why: String(e.why ?? '').trim().slice(0, 300) }];
  });
  const found = Math.max(0, Math.min(200, Number(g.found) || 0));
  const covered = Math.max(0, Math.min(200, Number(g.covered) || 0));
  if (!shelved.length && !found && !covered) return null;
  return { found, covered, shelved };
}

function carriedOf(v: unknown): { skill: string; from: string }[] {
  return (Array.isArray(v) ? v : []).slice(0, 6).flatMap(x => {
    if (!x || typeof x !== 'object') return [];
    const e = x as Record<string, unknown>;
    const skill = String(e.skill ?? '').trim().slice(0, 200);
    return skill ? [{ skill, from: String(e.from ?? '').trim().slice(0, 120) }] : [];
  });
}

/** The Dropbox folder a filed sheet sits in, as the Files app shows it ("Students › Tan Sijia › 2026-08-31 …"). '' when unknown. */
/** Cut on a word boundary with an ellipsis, never mid-word. */
function clipText(text: string, max: number): string {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * "⚠️ 9 practice items written by the worker, 2 filed for vetting — the other 7
 * live only in the sheet" — or null when every authored item was proposed (or
 * none was authored). Pure.
 */
export function authoredItemsLine(questions: { question_id?: string | null }[] | null | undefined, proposalsFiled: number): string | null {
  const authored = (questions ?? []).filter(q => !q || !q.question_id).length;
  const bank = (questions ?? []).length - authored;
  if (authored <= 0 || proposalsFiled >= authored) return null;
  const missing = authored - proposalsFiled;
  return `⚠️ ${authored} practice item${authored === 1 ? '' : 's'} written by the worker${bank ? ` (${bank} from the bank)` : ' — none from the bank'}, ${proposalsFiled} filed for vetting: the other ${missing} live${missing === 1 ? 's' : ''} only in the sheet.`;
}

export function sheetFolder(docxPath: string | null | undefined): string {
  const parts = String(docxPath || '').split('/').filter(Boolean);
  parts.pop();                                   // the file itself
  return parts.join(' › ');
}

/**
 * The Telegram Adrian gets when a sheet lands. Pure so its wording is testable.
 * The files themselves follow as documents (route.ts sendSheetFiles) — Adrian,
 * 3 Sep 2026: "can i have the link on telegram to see the learning sheet too?"
 * The app's Dropbox token has no sharing scope, so there is no permanent link
 * to give; the message names the folder and the PDF + DOCX ride behind it.
 */
export function completionMessage(
  job: Pick<SheetJob, 'student_name' | 'paper_name'>,
  result: SheetJobResult | null,
  /** The Practice Again hand-back (SPEC-PORTAL-V2 §7): one ready-made line, e.g. "🔁 5 practice items held for release". */
  extra: { heldItemsLine?: string | null; authoredLine?: string | null } = {},
): string {
  const who = job.student_name || 'A student';
  // "Nothing to teach" is a right answer, so it reads like one: calm, specific,
  // and it says what to do next. Never the ⚠️ failed wording.
  if (isNoSheet(result)) {
    return `📘 No sheet for <b>${who}</b>${job.paper_name ? ` (${job.paper_name})` : ''} — ${result.reason}. Release the paper on its own from the desk.`;
  }
  // Readable on a phone (Adrian, 8 Sep 2026: "the messages are hard to read"):
  // a bold title, one bullet per section, the worker's text HTML-escaped and
  // clipped — the full wording is on the desk.
  const esc = (x: string) => escapeTelegramHtml(x);
  const bullet = (items: string[]) => items.map(x => `• ${esc(clipText(x, 170))}`).join('\n');
  const lines = [`📘 <b>Self-study sheet ready — ${esc(who)}</b>${job.paper_name ? `\n${esc(job.paper_name)}` : ''}`];
  if (result?.wave.length) lines.push('', `<b>What it teaches</b> (${result.wave.length} section${result.wave.length === 1 ? '' : 's'})`, bullet(result.wave));
  if (result?.shelved.length) lines.push('', '<b>Shelved for later</b>', bullet(result.shelved));
  if (result?.reused?.length) lines.push('', '<b>♻️ Reused from an earlier sheet</b>', bullet(result.reused));
  const stamp = String(result?.verified || '');
  const v = stamp.match(/^(\d+)\s*\/\s*(\d+)/);
  if (stamp) lines.push('', v ? `✓ Answers verified: ${v[1]} of ${v[2]} checked${v[1] === v[2] ? '' : ' ⚠️'}` : `⚠️ Verification stamp not in the "N/N" form — ${esc(clipText(stamp, 120))}`);
  if (extra.heldItemsLine) lines.push(esc(extra.heldItemsLine));
  // Authored practice that was never filed for vetting is invisible to the bank
  // (Adrian, 10 Sep 2026: "when the worker writes the questions themselves, do
  // they save the questions in the question bank?" — only through a proposal he
  // approves; Isabelle's seven sheets filed 11 of 62). Say it on the line.
  if (extra.authoredLine) lines.push('', esc(extra.authoredLine));
  const folder = sheetFolder(result?.docx_path);
  lines.push('', folder ? `📂 Dropbox › ${esc(folder)}` : '📂 In Dropbox', `${result?.pdf_path ? 'The sheet\u2019s PDF and DOCX follow. ' : ''}Approve &amp; release on the desk sends the marked paper, this sheet and the practice items together. To change anything first, edit the DOCX and export the PDF beside it.`);
  return lines.join('\n');
}
