// Practice Again hands back its questions — SPEC-PORTAL-V2 §7, the I/O half.
//
// Three doors, all fail-soft (they log and return counts; none throws):
//
//   createHeldPracticeItems   /api/admin/sheet-jobs `done` — one portal_assignments
//                             row per practice question, status 'held'. Idempotent
//                             on (sheet_job_id, sheet_index): re-posting the same
//                             `done` inserts nothing new.
//   releaseHeldPracticeItems  mark-triage `release` + release-with-sheet — every
//                             held row written FROM this run flips to 'assigned'
//                             in the same step that stamps released_at, so the
//                             student sees the paper, the sheet and the items at
//                             one moment (SPEC-TEACHING-CYCLE step 7).
//   deleteHeldPracticeItems   /api/admin/sheet-jobs `cancel` — a stopped sheet
//                             leaves no held rows behind. Only HELD rows: once
//                             released, an item is the student's.
//
// The shape-checking and row-building are pure in lib/practice-again.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bankIdsNamed, heldItemsLine, practiceAgainRows, sanitizeSheetQuestions,
  type PracticeAgainJob, type SheetQuestion,
} from './practice-again';
import { addPracticeLinks } from './notebook-mistakes-store';

export type HeldItemsOutcome = {
  /** Rows this call inserted. */
  created: number;
  /** Rows already present from an earlier `done` for the same job (ON CONFLICT DO NOTHING). */
  already: number;
  bank: number;
  generated: number;
  /** Payload entries that yielded no row (malformed, or a bank id that is not a live bank row and no text). */
  skipped: number;
  /** Every held row for this job after the call — what the Notebook link needs. */
  ids: string[];
  /** The ready-made summary line for the Telegram / response, or null when nothing happened. */
  line: string | null;
  error?: string;
};

const NOTHING: HeldItemsOutcome = { created: 0, already: 0, bank: 0, generated: 0, skipped: 0, ids: [], line: null };

/**
 * Turn the worker's `questions[]` (raw payload OR already-sanitised list) into
 * held portal_assignments rows for this sheet job. Never throws.
 */
export async function createHeldPracticeItems(
  sb: SupabaseClient,
  job: PracticeAgainJob,
  rawQuestions: unknown,
): Promise<HeldItemsOutcome> {
  try {
    const { questions, skipped: malformed } = isSanitised(rawQuestions)
      ? { questions: rawQuestions, skipped: 0 }
      : sanitizeSheetQuestions(rawQuestions);
    if (!questions.length) return { ...NOTHING, skipped: malformed, line: heldItemsLine({ ...NOTHING, skipped: malformed }) };

    // The paper's subject rides onto every item so the subject gate treats them
    // like any other row. Best-effort: a missing run leaves it null (= shown).
    let subject: string | null = null;
    try {
      const { data: run } = await sb.from('paper_marking_runs')
        .select('paper_subject').eq('id', job.run_id).maybeSingle<{ paper_subject: string | null }>();
      subject = run?.paper_subject ?? null;
    } catch { /* subject stays null */ }

    // A bank id the worker named is trusted only if it IS a live bank row.
    const named = bankIdsNamed(questions);
    const bankIds = new Set<string>();
    if (named.length) {
      const { data: found } = await sb.from('questions').select('id').in('id', named).is('deleted_at', null);
      for (const r of (found || []) as { id: string }[]) bankIds.add(String(r.id).toLowerCase());
    }

    const { rows, skipped } = practiceAgainRows(job, questions, { bankIds, subject });
    let created = 0;
    if (rows.length) {
      // ON CONFLICT (sheet_job_id, sheet_index) DO NOTHING — RETURNING yields only
      // the rows actually inserted, so `created` is honest on a re-run.
      const { data: ins, error } = await sb.from('portal_assignments')
        .upsert(rows, { onConflict: 'sheet_job_id,sheet_index', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.warn('[practice-again] held items not created', job.id, error.message);
        return { ...NOTHING, skipped: malformed + skipped.length, error: error.message };
      }
      created = (ins || []).length;
    }

    const { data: all } = await sb.from('portal_assignments')
      .select('id, kind, skill_title').eq('sheet_job_id', job.id).eq('status', 'held');
    const allRows = (all || []) as { id: string; kind: string; skill_title: string | null }[];
    const summary = {
      created,
      already: Math.max(0, allRows.length - created),
      bank: allRows.filter(r => r.kind === 'question').length,
      generated: allRows.filter(r => r.kind === 'generated').length,
      skipped: malformed + skipped.length,
    };

    // The Notebook's mistake entry for each skill points at the items that fix it
    // (SPEC-PORTAL-V2 §6 "linked to the Practice items"). Best-effort, per skill:
    // a failed link never fails the hand-back.
    if (job.airtable_student_id) {
      const bySkill = new Map<string, string[]>();
      for (const r of allRows) {
        const t = (r.skill_title || '').trim();
        if (!t) continue;
        bySkill.set(t, [...(bySkill.get(t) || []), r.id]);
      }
      for (const [skill, ids] of bySkill) {
        try {
          const res = await addPracticeLinks(job.airtable_student_id, skill, ids, sb);
          if (!res.ok) console.warn('[practice-again] notebook link skipped', job.id, skill, res.error);
        } catch (e) {
          console.warn('[practice-again] notebook link failed', job.id, skill, (e as Error).message);
        }
      }
    }

    return { ...summary, ids: allRows.map(r => r.id), line: heldItemsLine(summary) };
  } catch (e) {
    const msg = (e as Error).message;
    console.warn('[practice-again] held items failed', job.id, msg);
    return { ...NOTHING, error: msg };
  }
}

function isSanitised(v: unknown): v is SheetQuestion[] {
  return Array.isArray(v) && v.every(x => x && typeof x === 'object' && typeof (x as SheetQuestion).position === 'number' && 'skillTitle' in (x as object));
}

/**
 * Release every held practice-again item written FROM this run. Returns how
 * many flipped (0 when the run had no sheet, or they were already released).
 * Idempotent; never throws.
 */
export async function releaseHeldPracticeItems(sb: SupabaseClient, runId: string): Promise<{ released: number; error?: string }> {
  try {
    const { data, error } = await sb.from('portal_assignments')
      .update({ status: 'assigned' })
      .eq('source_run_id', runId).eq('status', 'held')
      .select('id');
    if (error) {
      console.warn('[practice-again] release flip failed', runId, error.message);
      return { released: 0, error: error.message };
    }
    return { released: (data || []).length };
  } catch (e) {
    const msg = (e as Error).message;
    console.warn('[practice-again] release flip threw', runId, msg);
    return { released: 0, error: msg };
  }
}

/** A cancelled sheet leaves no held rows behind. Released rows are never touched. Never throws. */
export async function deleteHeldPracticeItems(sb: SupabaseClient, sheetJobId: string): Promise<{ deleted: number; error?: string }> {
  try {
    const { data, error } = await sb.from('portal_assignments')
      .delete()
      .eq('sheet_job_id', sheetJobId).eq('status', 'held')
      .select('id');
    if (error) {
      console.warn('[practice-again] held items not deleted', sheetJobId, error.message);
      return { deleted: 0, error: error.message };
    }
    return { deleted: (data || []).length };
  } catch (e) {
    const msg = (e as Error).message;
    console.warn('[practice-again] held delete threw', sheetJobId, msg);
    return { deleted: 0, error: msg };
  }
}
