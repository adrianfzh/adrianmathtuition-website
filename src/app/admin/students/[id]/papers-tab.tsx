// The profile's 📄 Papers tab (17 Sep 2026, SPEC-STUDENT-FIRST §3): the
// student's own Papers view, rendered by the SAME component the student's
// /app/marking uses (app/marking/papers-view), with `admin` on — so what
// Adrian sees is what they see, by construction, plus his doors under each
// card. Server component: verifies the admin cookie itself (the client shell
// has its own password gate, but this node is rendered before it runs).
import { cookies } from 'next/headers';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { PortalAccount } from '@/lib/portal-auth';
import PapersView from '@/app/app/marking/papers-view';

export default async function PapersTab({ studentId }: { studentId: string }) {
  const jar = await cookies();
  if (!verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value)) return null;
  const { data } = await getSupabaseAdmin().from('portal_accounts').select('*').eq('airtable_student_id', studentId).maybeSingle();
  const account = (data as PortalAccount | null) ?? null;
  return (
    <div>
      {!account && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>No app account yet — the list below is what they would see once invited.</p>}
      <PapersView account={account} sid={studentId} admin />
    </div>
  );
}
