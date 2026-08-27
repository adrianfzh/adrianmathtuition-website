// /app/my-notes — the student's personal gallery of clippings cut from their
// marked papers with the ✂️ clipper on /app/marking (Adrian, 2026-08-27: "in
// My Notes -> also allow deletion").
//
// Server component: reads with the service key scoped to the logged-in
// student's Airtable id — `portal_notes` has RLS with no policies, so this
// filter IS the access control (the /app/marking pattern). Interactivity
// (note editing, deletion) lives in the client gallery, which talks to
// /api/portal/my-notes.
//
// Deliberately NOT behind requireFullPortal(): clippings come from marked
// papers, which are in the marking-only beta allowlist — an allowed page
// simply never calls the gate (lib/portal-beta.ts).
import { currentStudent } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { MAX_NOTES_PER_STUDENT, type MyNoteRow } from '@/lib/portal-notes';
import MyNotesGallery from './my-notes-gallery';

export const dynamic = 'force-dynamic';

export default async function MyNotesPage() {
  const { account } = await currentStudent();

  const { data } = await getSupabaseAdmin()
    .from('portal_notes')
    .select('id, run_id, source_label, topic, image_url, note, created_at')
    .eq('airtable_student_id', account.airtable_student_id)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTES_PER_STUDENT);

  return <MyNotesGallery initialNotes={(data ?? []) as MyNoteRow[]} />;
}
