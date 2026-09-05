// notebook_mistakes — the reads and writes behind the Notebook's fading
// mistakes list (SPEC-PORTAL-V2 §6). Every judgement call lives in
// lib/notebook-mistakes.ts (pure, tested); this file only moves rows.
//
// Access class (lib/supabase-server.ts header): the table has RLS enabled with
// NO policies. Students never read it directly. Every query here goes through
// a service client and carries `airtable_student_id = <identity>` IN THE
// QUERY — the identity is the SESSION's portal identity (lib/portal-auth
// portalIdentity: 'rec…' / 'acct:<uuid>'), never client input.
//
// Callers:
//   applyRunRelease      — mark-triage's release action (manual, auto, and the
//                          release-with-sheet button, which releases through it)
//   applyGradedAttempt   — /api/portal/practice/grade after the attempt row lands
//   loadMistakes         — the Notebook page + GET /api/portal/notebook/mistakes
//                          (applies the 14-day student_fixed → fixed sweep on read)
//   markMistakeCorrected — POST … {action:'corrected'}
//   addPracticeLinks     — the §7 Practice-Again hand-back, to say which
//                          portal_assignments fix a skill
// All of them are fail-soft at the call site: a notebook hiccup never blocks a
// release or a grade. No Next imports here on purpose — the backfill script
// (scripts/notebook-mistakes-backfill.ts) runs this under plain tsx.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { paperSubjectFromName } from './portal-subjects';
import {
  MISTAKE_STATES,
  entriesFromRun,
  foldObservations,
  markCorrected,
  observationsFromAttempt,
  sweepStudentFixed,
  type AttemptInput,
  type MistakeEntry,
  type MistakeEvidence,
  type MistakeState,
  type Observation,
} from './notebook-mistakes';

export const MISTAKES_TABLE = 'notebook_mistakes';
const COLUMNS =
  'id, airtable_student_id, subject, title, error_kind, topic, state, seen_count, clean_count, came_back, evidence, practice_ids, last_seen_at, last_clean_at, student_fixed_at, created_at, updated_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A notebook_mistakes row as selected with COLUMNS. */
export interface MistakeRow extends MistakeEntry {
  id: string;
  created_at: string;
  updated_at: string;
}

/** The run fields the release hook hands over. */
export interface ReleasedRunInput {
  id: string;
  paper_name: string | null;
  /** paper_marking_runs.paper_subject ('A Math' | 'E Math' | 'H2 Math' | 'Other'); derived from the name when absent. */
  paper_subject?: string | null;
  result_json: unknown;
}

// ── row hygiene ─────────────────────────────────────────────────────────────

function evidenceList(v: unknown): MistakeEvidence[] {
  if (!Array.isArray(v)) return [];
  const out: MistakeEvidence[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if ((e.kind !== 'paper' && e.kind !== 'attempt') || typeof e.ref !== 'string' || !e.ref) continue;
    out.push({
      kind: e.kind,
      ref: e.ref,
      label: typeof e.label === 'string' ? e.label : null,
      paper: typeof e.paper === 'string' ? e.paper : null,
      date: typeof e.date === 'string' ? e.date : '',
      clean: e.clean === true,
    });
  }
  return out;
}

function rowFrom(raw: unknown): MistakeRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.airtable_student_id !== 'string') return null;
  const state = (MISTAKE_STATES as readonly string[]).includes(String(r.state)) ? (r.state as MistakeState) : 'dark';
  return {
    id: r.id,
    airtable_student_id: r.airtable_student_id,
    subject: typeof r.subject === 'string' ? r.subject : null,
    title: r.title,
    error_kind: typeof r.error_kind === 'string' ? r.error_kind : null,
    topic: typeof r.topic === 'string' ? r.topic : null,
    state,
    seen_count: Number(r.seen_count) || 0,
    clean_count: Number(r.clean_count) || 0,
    came_back: r.came_back === true,
    evidence: evidenceList(r.evidence),
    practice_ids: Array.isArray(r.practice_ids) ? r.practice_ids.filter((x): x is string => typeof x === 'string') : [],
    last_seen_at: typeof r.last_seen_at === 'string' ? r.last_seen_at : null,
    last_clean_at: typeof r.last_clean_at === 'string' ? r.last_clean_at : null,
    student_fixed_at: typeof r.student_fixed_at === 'string' ? r.student_fixed_at : null,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

/** The columns a state change writes back (never id / identity / created_at). */
function writable(e: MistakeEntry, nowIso: string) {
  return {
    subject: e.subject,
    error_kind: e.error_kind,
    topic: e.topic,
    state: e.state,
    seen_count: e.seen_count,
    clean_count: e.clean_count,
    came_back: e.came_back,
    evidence: e.evidence,
    practice_ids: e.practice_ids,
    last_seen_at: e.last_seen_at,
    last_clean_at: e.last_clean_at,
    student_fixed_at: e.student_fixed_at,
    updated_at: nowIso,
  };
}

// ── reads ───────────────────────────────────────────────────────────────────

/** Every entry of one student, as stored (no sweep). Read-only — the backfill's dry run uses it. */
export async function fetchMistakeRows(svc: SupabaseClient, identity: string): Promise<MistakeRow[]> {
  if (!identity) return [];
  const { data, error } = await svc
    .from(MISTAKES_TABLE)
    .select(COLUMNS)
    .eq('airtable_student_id', identity)
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(`notebook_mistakes read failed: ${error.message}`);
  return (data ?? []).map(rowFrom).filter((r): r is MistakeRow => r !== null);
}

/**
 * The student's entries for display, with the 14-day rule applied on the way
 * out: a "Corrected" entry that has stayed quiet for STUDENT_FIXED_DAYS is
 * written as fixed before it is returned (reading IS the sweep — no cron).
 */
export async function loadMistakes(svc: SupabaseClient, identity: string, now: Date = new Date()): Promise<MistakeRow[]> {
  const rows = await fetchMistakeRows(svc, identity);
  const out: MistakeRow[] = [];
  for (const r of rows) {
    const swept = sweepStudentFixed(r, now);
    if (swept !== r) {
      const { error } = await svc
        .from(MISTAKES_TABLE)
        .update({ state: swept.state, came_back: swept.came_back, updated_at: now.toISOString() })
        .eq('id', r.id)
        .eq('airtable_student_id', identity);
      if (error) console.warn('[notebook-mistakes] sweep write failed:', error.message);
    }
    out.push({ ...r, ...swept });
  }
  return out;
}

// ── writes ──────────────────────────────────────────────────────────────────

/**
 * Fold a batch of observations into the student's entries and persist the
 * difference: new entries are upserted on (student, title) — race-safe against
 * a second hook firing for the same paper — and changed entries are updated
 * by id, still scoped to the identity.
 */
export async function applyObservations(
  svc: SupabaseClient,
  identity: string,
  observations: Observation[],
  now: Date = new Date(),
): Promise<{ created: number; updated: number }> {
  if (!identity || !observations.length) return { created: 0, updated: 0 };
  const rows = await fetchMistakeRows(svc, identity);
  const fold = foldObservations(rows, observations, now, identity);
  const nowIso = now.toISOString();

  if (fold.created.length) {
    const inserts = fold.created.map(e => ({ ...writable(e, nowIso), airtable_student_id: identity, title: e.title }));
    const { error } = await svc
      .from(MISTAKES_TABLE)
      .upsert(inserts, { onConflict: 'airtable_student_id,title' });
    if (error) throw new Error(`notebook_mistakes insert failed: ${error.message}`);
  }
  for (const u of fold.updated) {
    const { error } = await svc
      .from(MISTAKES_TABLE)
      .update(writable(u, nowIso))
      .eq('id', u.id)
      .eq('airtable_student_id', identity);
    if (error) throw new Error(`notebook_mistakes update failed: ${error.message}`);
  }
  return { created: fold.created.length, updated: fold.updated.length };
}

/**
 * A released paper: every lost part / sheet-diagnosis skill creates or darkens
 * the student's entries; every topic with nothing lost is a clean result.
 * `releasedAt` becomes the evidence date. Idempotent per run.
 */
export async function applyRunRelease(
  svc: SupabaseClient,
  identity: string,
  run: ReleasedRunInput,
  releasedAt: string,
  now: Date = new Date(),
): Promise<{ created: number; updated: number; observations: number }> {
  const subject = run.paper_subject?.trim() || paperSubjectFromName(run.paper_name) || null;
  const observations = entriesFromRun(run.result_json, run.id, releasedAt, { paperName: run.paper_name, subject });
  const r = await applyObservations(svc, identity, observations, now);
  return { ...r, observations: observations.length };
}

/** A graded practice attempt (math path only — science tags are not this vocabulary). */
export async function applyGradedAttempt(
  svc: SupabaseClient,
  identity: string,
  attempt: AttemptInput,
  now: Date = new Date(),
): Promise<{ created: number; updated: number }> {
  return applyObservations(svc, identity, observationsFromAttempt(attempt), now);
}

/**
 * The student's "Corrected" tap. Returns the row after the change, or null when
 * no row with that id belongs to this identity (the route answers 404).
 */
export async function markMistakeCorrected(
  svc: SupabaseClient,
  identity: string,
  id: string,
  now: Date = new Date(),
): Promise<MistakeRow | null> {
  if (!identity || !UUID_RE.test(id)) return null;
  const { data, error } = await svc
    .from(MISTAKES_TABLE)
    .select(COLUMNS)
    .eq('id', id)
    .eq('airtable_student_id', identity)
    .maybeSingle();
  if (error) throw new Error(`notebook_mistakes read failed: ${error.message}`);
  const row = rowFrom(data);
  if (!row) return null;
  const next = markCorrected(row, now);
  if (next === row) return row;
  const { error: wErr } = await svc
    .from(MISTAKES_TABLE)
    .update({ state: next.state, student_fixed_at: next.student_fixed_at, updated_at: now.toISOString() })
    .eq('id', id)
    .eq('airtable_student_id', identity);
  if (wErr) throw new Error(`notebook_mistakes update failed: ${wErr.message}`);
  return { ...row, ...next };
}

/**
 * Link the Practice items that fix a skill (SPEC-PORTAL-V2 §7 — the hand-back
 * calls this with the sheet skill's title and the portal_assignments ids it
 * created). Appends, never removes. When the student has no entry with that
 * title yet — the hand-back runs before the paper releases — a placeholder is
 * created (state dark, seen_count 0, no evidence) that the release then
 * darkens for real; the Notebook hides entries with no evidence, so nothing
 * shows early.
 */
export async function addPracticeLinks(
  identity: string,
  skillTitle: string,
  assignmentIds: readonly string[],
  svc: SupabaseClient = getSupabaseAdmin(),
): Promise<{ ok: true; id: string; created: boolean; practice_ids: string[] } | { ok: false; error: string }> {
  const title = String(skillTitle ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const ids = [...new Set(assignmentIds.map(s => String(s).trim()).filter(s => UUID_RE.test(s)))];
  if (!identity) return { ok: false, error: 'identity is required' };
  if (!title) return { ok: false, error: 'skillTitle is required' };
  if (!ids.length) return { ok: false, error: 'no valid assignment ids' };
  const nowIso = new Date().toISOString();

  const { data, error } = await svc
    .from(MISTAKES_TABLE)
    .select(COLUMNS)
    .eq('airtable_student_id', identity)
    .eq('title', title)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const row = rowFrom(data);

  if (row) {
    const merged = [...new Set([...row.practice_ids, ...ids])];
    if (merged.length === row.practice_ids.length) return { ok: true, id: row.id, created: false, practice_ids: merged };
    const { error: wErr } = await svc
      .from(MISTAKES_TABLE)
      .update({ practice_ids: merged, updated_at: nowIso })
      .eq('id', row.id)
      .eq('airtable_student_id', identity);
    if (wErr) return { ok: false, error: wErr.message };
    return { ok: true, id: row.id, created: false, practice_ids: merged };
  }

  const { data: created, error: cErr } = await svc
    .from(MISTAKES_TABLE)
    .upsert(
      { airtable_student_id: identity, title, state: 'dark', seen_count: 0, clean_count: 0, came_back: false, evidence: [], practice_ids: ids, updated_at: nowIso },
      { onConflict: 'airtable_student_id,title' },
    )
    .select('id, practice_ids')
    .single();
  if (cErr || !created) return { ok: false, error: cErr?.message ?? 'insert failed' };
  return { ok: true, id: String(created.id), created: true, practice_ids: (created.practice_ids as string[]) ?? ids };
}
