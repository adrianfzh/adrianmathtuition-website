// /api/admin/papers — the marked-script library behind /admin/papers.
//
// GET  → every marking run, newest first, reduced to what's useful when you're
//        sitting next to the student: score, the topics that bled marks, and
//        links to the copies you can put on the screen.
// POST → { runId, studentId } tags a run with a student (or untags with null).
//
// Reads Supabase DIRECTLY rather than through /api/admin/mark-paper's proxy to
// the bot. The proxy only exposes `by-student`, which is useless for the exact
// problem this page exists to fix: of 43 runs, 2 carried a student_id, so a
// per-student view showed almost nothing. Tagging is also what unblocks
// marked-paper evidence in the parent reports (`report-facts.ts`) — an untagged
// run belongs to nobody and can never appear in one.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { airtableRequest } from '@/lib/airtable';
import { recomputeTotals, pendingCount } from '@/lib/mark-triage';
import { aggregateTopicBleed } from '@/lib/report-facts';

export const runtime = 'nodejs';

const DEFAULT_DAYS = 365;
const MAX_DAYS = 3650;
const DEFAULT_LIMIT = 200;
/** Ceiling on the topic breakdown per run — the page shows the weakest few and
 *  expands to the rest; beyond this it stops being a conversation starter. */
const MAX_TOPICS_PER_RUN = 8;

const COLUMNS =
  'id, created_at, paper_name, student_id, student_name, num_questions, ' +
  'total_awarded, total_max, pdf_url, photos_pdf_url, annotated_pdf_url, released_at, source';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const days = Math.min(Number(q.get('days')) || DEFAULT_DAYS, MAX_DAYS);
  const limit = Math.min(Number(q.get('limit')) || DEFAULT_LIMIT, 500);
  const studentId = q.get('student') || '';
  const untaggedOnly = q.get('untagged') === '1';

  const supa = getSupabaseAdmin();
  let query = supa
    .from('paper_marking_runs')
    .select(`${COLUMNS}, result_json`)
    .gte('created_at', new Date(Date.now() - days * 86400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (studentId) query = query.eq('student_id', studentId);
  if (untaggedOnly) query = query.is('student_id', null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const runs = (data ?? [])
    // A run with no stored marking is a failed or still-queued attempt. It has
    // nothing to go through with a student, and listing it as "0/0" reads as a
    // paper the student scored nothing on.
    .filter(r => Array.isArray((r.result_json as { results?: unknown })?.results))
    .map(r => {
      // Prefer the stored totals; recompute when they're missing, since triage
      // overrides write both and older rows sometimes carry neither.
      const totals =
        r.total_max == null || r.total_awarded == null
          ? recomputeTotals(r.result_json)
          : { awarded: r.total_awarded, max: r.total_max };
      const date = String(r.created_at).slice(0, 10);
      const topics = aggregateTopicBleed([
        { id: r.id, date, name: r.paper_name || 'Paper', totalAwarded: totals.awarded, totalMax: totals.max, resultJson: r.result_json },
      ]).slice(0, MAX_TOPICS_PER_RUN);

      return {
        id: r.id,
        date,
        createdAt: r.created_at,
        paperName: r.paper_name || 'Untitled paper',
        studentId: r.student_id,
        studentName: r.student_name,
        awarded: totals.awarded,
        max: totals.max,
        pct: totals.max > 0 ? Math.round((totals.awarded / totals.max) * 100) : null,
        questions: r.num_questions ?? (r.result_json as { results?: unknown[] })?.results?.length ?? 0,
        // Still-open triage flags, so a script that hasn't been checked isn't
        // walked through as if its marks were final.
        pending: pendingCount(r.result_json),
        released: !!r.released_at,
        annotatedPdfUrl: r.annotated_pdf_url,
        photosPdfUrl: r.photos_pdf_url,
        pdfUrl: r.pdf_url,
        topics,
      };
    });

  return NextResponse.json({
    days,
    runs,
    stats: {
      total: runs.length,
      untagged: runs.filter(r => !r.studentId).length,
      students: new Set(runs.map(r => r.studentId).filter(Boolean)).size,
    },
  });
}

// ── POST: tag a run with a student ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { runId?: string; studentId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { runId, studentId } = body;
  if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  // Resolve the NAME from Airtable rather than trusting one sent by the client:
  // student_name is denormalised into this row and shows up in triage, so a
  // stale or mistyped name would outlive whatever screen produced it.
  let studentName: string | null = null;
  if (studentId) {
    try {
      // Single-record GET ignores fields[] — fetch all and pick in JS.
      const student = await airtableRequest('Students', `/${studentId}`);
      studentName = (student?.fields?.['Student Name'] as string) || null;
      if (!studentName) return NextResponse.json({ error: 'student has no name' }, { status: 400 });
    } catch {
      return NextResponse.json({ error: 'student not found' }, { status: 404 });
    }
  }

  const { error } = await getSupabaseAdmin()
    .from('paper_marking_runs')
    .update({ student_id: studentId || null, student_name: studentName })
    .eq('id', runId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, runId, studentId: studentId || null, studentName });
}
