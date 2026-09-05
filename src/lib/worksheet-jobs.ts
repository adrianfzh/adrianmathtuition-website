// Telegram worksheet queue — pure logic (SPEC-WORKSHEET-MENU.md).
//
// Adrian taps /ws in Telegram; a headless Claude session on his Mac claims the
// job, runs the skill that makes that KIND of worksheet, files the DOCX into
// Dropbox and completes the row, which Telegrams him the file. Same shape as
// lib/sheet-jobs.ts (the self-study sheet queue) and the same hard-won rule:
// **a dead session must never strand a job** — a claim is a LEASE with a
// heartbeat, an expired lease is reclaimable, and cancel is terminal.
//
// Everything here is pure (no I/O) and unit-tested — the route only orchestrates.

export type WorksheetJobStatus = 'queued' | 'claimed' | 'done' | 'failed' | 'cancelled';

/** The four queued kinds. Kind 3 (questions only) never queues — it is instant. */
export type WorksheetKind = 1 | 2 | 4 | 5;
export const QUEUED_KINDS: readonly WorksheetKind[] = [1, 2, 4, 5] as const;

export const KIND_LABEL: Record<WorksheetKind, string> = {
  1: 'Revision worksheet with worked examples',
  2: 'Practice worksheet with notes at the front',
  4: 'Fresh practice on an existing sheet',
  5: 'Full prelim paper',
};

export type WorksheetJobParams = {
  count?: number;
  /** marks band: 'standard' | 'intermediate' | 'advanced' | 'mixed' | '2/2/2'-style split */
  band?: string;
  /** kind 4: the base sheet's file name (Adrian's own document) */
  sheet?: string;
  /** kind 5: blueprint paper key, e.g. 'EM-P1' */
  paper?: string;
  /** kind 5: blueprint preset name */
  preset?: string;
  /** kind 5: canonical topics to leave out */
  exclude?: string[];
  /** what Adrian typed, verbatim, for the record */
  requested_text?: string;
};

export type WorksheetJob = {
  id: string;
  kind: WorksheetKind;
  level: string;
  topic: string | null;
  params: WorksheetJobParams;
  requested_by: number | null;
  label: string;
  status: WorksheetJobStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  stage: string | null;
  attempts: number;
  result: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

/** How long a claim survives without a heartbeat before anyone may retake it. */
export const LEASE_MS = 40 * 60 * 1000;   // authoring is long: verify + render + figures
/** After this many attempts a job stops being retried and waits for Adrian. */
export const MAX_ATTEMPTS = 3;

export function isQueuedKind(v: unknown): v is WorksheetKind {
  return v === 1 || v === 2 || v === 4 || v === 5;
}

/**
 * Is this claimed job abandoned? True when the lease has expired — the session
 * died, the Mac slept, the plan capped. The claimer's name never matters:
 * whoever asks next may take it.
 */
export function claimExpired(job: Pick<WorksheetJob, 'status' | 'heartbeat_at' | 'claimed_at'>, now = Date.now()): boolean {
  if (job.status !== 'claimed') return false;
  const beat = job.heartbeat_at || job.claimed_at;
  if (!beat) return true;
  const t = Date.parse(beat);
  return !Number.isFinite(t) || now - t > LEASE_MS;
}

/** Oldest queued job first; failing that, the oldest expired lease. Cancelled never. */
export function pickNextJob(jobs: WorksheetJob[], now = Date.now()): WorksheetJob | null {
  const live = jobs.filter(j => j.attempts < MAX_ATTEMPTS);
  const byAge = (a: WorksheetJob, b: WorksheetJob) => Date.parse(a.created_at) - Date.parse(b.created_at);
  const queued = live.filter(j => j.status === 'queued').sort(byAge);
  if (queued.length) return queued[0];
  const stale = live.filter(j => claimExpired(j, now)).sort(byAge);
  return stale[0] ?? null;
}

export function cancelState(job: WorksheetJob | null): { can: boolean; running: boolean; reason?: string } {
  if (!job) return { can: false, running: false, reason: 'no such job' };
  if (job.status === 'queued') return { can: true, running: false };
  if (job.status === 'claimed') return { can: true, running: true };
  return { can: false, running: false, reason: `already ${job.status}` };
}

/** A worksheet that was actually built and filed. */
export type WorksheetResult = {
  docx_path: string;
  pdf_path: string | null;
  /** one line: what was made — e.g. "6 examples · 9 practice · 43 marks" */
  summary: string;
  verified: string;
  /** kind 5: blueprint slots whose topic pool emptied after exclusions */
  fallbacks: string[];
};

export function sanitizeResult(input: unknown): WorksheetResult | null {
  const r = (input ?? {}) as Record<string, unknown>;
  const docx = String(r.docx_path ?? '').trim();
  if (!docx) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
    .map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 30);
  return {
    docx_path: docx.slice(0, 400),
    pdf_path: r.pdf_path ? String(r.pdf_path).trim().slice(0, 400) : null,
    summary: String(r.summary ?? '').trim().slice(0, 200),
    verified: String(r.verified ?? '').trim().slice(0, 120),
    fallbacks: list(r.fallbacks),
  };
}

/** Validate a queue request. Returns the row to insert, or the reason it can't be. */
export function jobInsert(body: {
  kind?: unknown; level?: unknown; topic?: unknown; params?: unknown; requested_by?: unknown; label?: unknown;
}): { ok: true; row: Omit<WorksheetJob, 'id' | 'created_at' | 'completed_at'> } | { ok: false; error: string } {
  const kind = Number(body.kind);
  if (!isQueuedKind(kind)) return { ok: false, error: 'kind must be 1, 2, 4 or 5 (3 is instant — use /api/bot/worksheet)' };
  const level = String(body.level ?? '').trim().toUpperCase();
  if (!level) return { ok: false, error: 'level required' };
  const topic = String(body.topic ?? '').trim() || null;
  if (!topic && kind !== 5) return { ok: false, error: 'topic required for this kind' };
  const p = (body.params && typeof body.params === 'object') ? body.params as Record<string, unknown> : {};
  const params: WorksheetJobParams = {};
  if (p.count !== undefined) {
    const n = Math.floor(Number(p.count));
    if (!Number.isFinite(n) || n < 1 || n > 40) return { ok: false, error: 'count must be 1–40' };
    params.count = n;
  }
  if (p.band) params.band = String(p.band).trim().toLowerCase().slice(0, 30);
  if (p.sheet) params.sheet = String(p.sheet).trim().slice(0, 200);
  if (p.paper) params.paper = String(p.paper).trim().toUpperCase().slice(0, 12);
  if (p.preset) params.preset = String(p.preset).trim().toLowerCase().slice(0, 40);
  if (Array.isArray(p.exclude)) params.exclude = p.exclude.map(x => String(x).trim()).filter(Boolean).slice(0, 40);
  if (p.requested_text) params.requested_text = String(p.requested_text).trim().slice(0, 300);
  if (kind === 5 && !params.paper) return { ok: false, error: 'params.paper required for a prelim paper' };
  if (kind === 4 && !params.sheet) return { ok: false, error: 'params.sheet required — which sheet to extend' };
  const requested_by = Number.isFinite(Number(body.requested_by)) ? Number(body.requested_by) : null;
  const label = String(body.label ?? '').trim().slice(0, 160) || labelFor({ kind, level, topic, params });
  return {
    ok: true,
    row: {
      kind, level, topic, params, requested_by, label,
      status: 'queued', claimed_by: null, claimed_at: null, heartbeat_at: null, stage: null,
      attempts: 0, result: null, error: null,
    },
  };
}

/** The one-line name a Telegram card and the ops board show for a job. */
export function labelFor(j: Pick<WorksheetJob, 'kind' | 'level' | 'topic' | 'params'>): string {
  const p = j.params || {};
  if (j.kind === 5) {
    const ex = p.exclude?.length ? ` · minus ${p.exclude.length} topic${p.exclude.length === 1 ? '' : 's'}` : '';
    return `Prelim paper ${p.paper ?? j.level}${p.preset && p.preset !== 'standard' ? ` (${p.preset})` : ''}${ex}`;
  }
  const bits = [KIND_LABEL[j.kind], '—', j.level, '·', j.topic ?? ''];
  if (p.count) bits.push(`· ${p.count} q`);
  if (p.band && p.band !== 'mixed') bits.push(`· ${p.band}`);
  if (j.kind === 4 && p.sheet) bits.push(`· on "${p.sheet}"`);
  return bits.join(' ').replace(/\s+/g, ' ').trim();
}

/** The Dropbox folder a filed sheet sits in, as the Files app shows it. '' when unknown. */
export function sheetFolder(docxPath: string | null | undefined): string {
  const p = String(docxPath ?? '').replace(/^\/+/, '');
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i).split('/').join(' › ') : '';
}

export function completionMessage(job: Pick<WorksheetJob, 'label' | 'kind'>, result: WorksheetResult | null): string {
  const lines = [`🛠 <b>${job.label}</b> — ready`];
  if (result?.summary) lines.push(result.summary);
  if (result?.verified) lines.push(`✓ ${result.verified}`);
  if (result?.fallbacks.length) lines.push(`↪ Slots refilled after exclusions: ${result.fallbacks.join(', ')}`);
  const folder = sheetFolder(result?.docx_path);
  lines.push('', `${folder ? `📂 Dropbox › ${folder}` : 'In Dropbox'} — ${result?.pdf_path ? 'PDF and DOCX below. ' : 'DOCX below. '}Edit the DOCX${job.kind === 5 ? ', then it is a paper' : ' before it goes on the kiosk'}.`);
  return lines.join('\n');
}
