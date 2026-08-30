// Self-study sheet queue — pure logic (SPEC-TEACHING-CYCLE steps 3–6).
//
// Adrian taps 📘 on a marked paper; a headless Claude session on his Mac claims
// the job, runs the self-study-sheet skill, files the DOCX + PDF into Dropbox
// and completes the row. Same shape as the plan-marking worker, and the same
// hard-won rule: **a dead session must never strand a job**, so a claim is a
// LEASE with a heartbeat, and an expired lease is reclaimable.
//
// Everything here is pure (no I/O) and unit-tested — the route only orchestrates.

export type SheetJobStatus = 'queued' | 'claimed' | 'done' | 'failed';

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

/** The next job a worker should take: queued first (oldest), then abandoned claims. */
export function pickNextJob(jobs: SheetJob[], now = Date.now()): SheetJob | null {
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

/** Validate the completion payload the worker posts back. Returns null when unusable. */
export function sanitizeResult(input: unknown): {
  docx_path: string; pdf_path: string | null; wave: string[]; shelved: string[]; verified: string;
} | null {
  const r = (input ?? {}) as Record<string, unknown>;
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

/** The Telegram Adrian gets when a sheet lands. Pure so its wording is testable. */
export function completionMessage(job: Pick<SheetJob, 'student_name' | 'paper_name'>, result: ReturnType<typeof sanitizeResult>): string {
  const who = job.student_name || 'A student';
  const lines = [`📘 Self-study sheet ready for <b>${who}</b>${job.paper_name ? ` — from ${job.paper_name}` : ''}`];
  if (result?.wave.length) lines.push(`Wave: ${result.wave.join(' · ')}`);
  if (result?.shelved.length) lines.push(`🧺 Shelved for later: ${result.shelved.join(' · ')}`);
  if (result?.verified) lines.push(`✓ ${result.verified}`);
  lines.push('', 'In Dropbox — edit it, export the PDF beside it, then release the paper + sheet together from triage.');
  return lines.join('\n');
}
