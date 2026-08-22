// GET /api/portal/export — PDPA data portability: everything the portal stores
// about the logged-in student, as one downloadable JSON file.
//
// Coverage mirrors what the portal shows them and what delete-account erases
// (widened 2026-08-22 — marked papers, "From Adrian" assignments, weakness
// tags and the learn/recall ledgers were missing; the Settings copy said
// "all stored data", so it has to be true):
//   account            portal_accounts row (profile, prefs, consent record)
//   practice_attempts  every /app/practice answer + its marking
//   marked_papers      paper_marking_runs for the student — full marks only
//                      once released; an unreleased paper is listed by name
//                      and date only (Adrian's release is the gate, never this)
//   assignments        "From Adrian" work, incl. revoked rows (status says so)
//   weakness_tags      the derived focus tags practice grading keeps
//   learn_events       unit_events ledger (Learn usage)
//   recall_messages    timestamps of Recall chats (content is not stored)
//
// The account + attempts reads go through the user-scoped client so RLS
// guarantees own-rows-only; the rest are service-role reads filtered by the
// ids that came out of that RLS-protected account row, never by client input.
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';

const RUN_PUBLIC = 'id, created_at, paper_name, num_photos, released_at';
const RUN_RELEASED = `${RUN_PUBLIC}, total_awarded, total_max, annotated_pdf_url, pdf_url, result_json`;

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: account }, { data: attempts }] = await Promise.all([
    supabase.from('portal_accounts').select('*').eq('id', user.id).single(),
    supabase.from('student_attempts').select('*').eq('user_id', user.id).order('attempted_at', { ascending: true }),
  ]);

  const admin = createServiceClient();
  const studentId: string | null = account?.airtable_student_id ?? null;

  const [released, pending, assignments, tags, events, recalls] = await Promise.all([
    studentId
      ? admin.from('paper_marking_runs').select(RUN_RELEASED)
          .eq('student_id', studentId).not('released_at', 'is', null)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    studentId
      ? admin.from('paper_marking_runs').select(RUN_PUBLIC)
          .eq('student_id', studentId).is('released_at', null)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    studentId
      ? admin.from('portal_assignments').select('*')
          .eq('airtable_student_id', studentId).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    admin.from('weakness_tags').select('tag, count, last_seen').eq('user_id', user.id).order('count', { ascending: false }),
    admin.from('unit_events').select('unit_id, topic, kind, event, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
    admin.from('recall_messages').select('created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account,
    practice_attempts: attempts || [],
    marked_papers: {
      released: released.data || [],
      being_marked: (pending.data || []).map(r => ({ ...(r as object), note: 'Not released yet — marks appear here once Adrian releases the paper.' })),
    },
    assignments: assignments.data || [],
    weakness_tags: tags.data || [],
    learn_events: events.data || [],
    recall_messages: recalls.data || [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="adrianmath-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
