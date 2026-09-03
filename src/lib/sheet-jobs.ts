// Self-study sheet queue — pure logic (SPEC-TEACHING-CYCLE steps 3–6).
//
// Adrian taps 📘 on a marked paper; a headless Claude session on his Mac claims
// the job, runs the self-study-sheet skill, files the DOCX + PDF into Dropbox
// and completes the row. Same shape as the plan-marking worker, and the same
// hard-won rule: **a dead session must never strand a job**, so a claim is a
// LEASE with a heartbeat, and an expired lease is reclaimable.
//
// Everything here is pure (no I/O) and unit-tested — the route only orchestrates.

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
  };
}

/** The Dropbox folder a filed sheet sits in, as the Files app shows it ("Students › Tan Sijia › 2026-08-31 …"). '' when unknown. */
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
export function completionMessage(job: Pick<SheetJob, 'student_name' | 'paper_name'>, result: SheetJobResult | null): string {
  const who = job.student_name || 'A student';
  // "Nothing to teach" is a right answer, so it reads like one: calm, specific,
  // and it says what to do next. Never the ⚠️ failed wording.
  if (isNoSheet(result)) {
    return `📘 No sheet for <b>${who}</b>${job.paper_name ? ` (${job.paper_name})` : ''} — ${result.reason}. Release the paper on its own from the desk.`;
  }
  const lines = [`📘 Self-study sheet ready for <b>${who}</b>${job.paper_name ? ` — from ${job.paper_name}` : ''}`];
  if (result?.wave.length) lines.push(`Wave: ${result.wave.join(' · ')}`);
  if (result?.shelved.length) lines.push(`🧺 Shelved for later: ${result.shelved.join(' · ')}`);
  if (result?.verified) lines.push(`✓ ${result.verified}`);
  const folder = sheetFolder(result?.docx_path);
  lines.push('', `${folder ? `📂 Dropbox › ${folder}` : 'In Dropbox'} — ${result?.pdf_path ? 'PDF and DOCX below; ' : ''}edit the DOCX, export the PDF beside it, then release the paper + sheet together from triage.`);
  return lines.join('\n');
}
