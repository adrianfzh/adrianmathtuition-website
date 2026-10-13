// Shared by the two student-app routes that proxy the bot's lesson-moving law:
// /api/portal/reschedule and /api/portal/waitlist. The studentId always comes
// from the portal session, never from the client.
import { createSupabaseServer } from '@/lib/supabase-server';
import type { PortalAccount } from '@/lib/portal-auth';

export async function sessionStudentId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase
    .from('portal_accounts').select('airtable_student_id').eq('id', user.id).single<Pick<PortalAccount, 'airtable_student_id'>>();
  return account?.airtable_student_id ?? null;
}

export function botConfig(): { base: string; secret: string } | null {
  const base = process.env.BOT_BASE_URL, secret = process.env.BOT_INTERNAL_SECRET;
  return base && secret ? { base, secret } : null;
}
