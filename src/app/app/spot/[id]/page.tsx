// /app/spot/<unitId> — 🔍 Spot the mistake (SPEC-SPOT-ERROR.md): one approved
// card, opened from a My Notebook mistake of the same kind. Someone else's
// working (re-written, never copied) — the student taps the wrong line, then
// reads why and the fix.
//
// Behind SPOT_ERROR_OPEN_TO_STUDENTS (lib/portal-beta spotErrorVisible): until
// it opens, Adrian's admin cookie and the preview student only. A student only
// ever opens an APPROVED card; Adrian also sees waiting ones (to try them).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { spotErrorVisible } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isSpotPayload } from '@/lib/spot-error';
import SpotErrorCard from '@/components/SpotErrorCard';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const account = await sessionAccount();
  const identity = account ? portalIdentity(account) : null;
  if (!(await spotErrorVisible(identity))) notFound();

  const { data: unit } = await getSupabaseAdmin()
    .from('learning_units')
    .select('id, status, payload')
    .eq('id', id)
    .eq('kind', 'autopsy')
    .maybeSingle();
  if (!unit || !isSpotPayload(unit.payload)) notFound();
  if (unit.status !== 'approved' && !(await isNotesAuthed())) notFound();

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/my-notes" className="text-sm text-gray-500 hover:text-navy">‹ My Notebook</Link>
        <h1 className="text-xl font-bold text-navy mt-1">🔍 Spot the mistake</h1>
        <p className="text-sm text-gray-500 mt-0.5">The same kind of slip as one of yours — in someone else&apos;s working. Find it.</p>
      </div>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
        <SpotErrorCard payload={unit.payload} />
      </div>
    </div>
  );
}
