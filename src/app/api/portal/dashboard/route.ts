// GET /api/portal/dashboard — dashboard aggregations for the logged-in student.
// Session-cookie auth (Supabase); returns 401 JSON rather than redirecting so
// client-side refreshes can handle expiry gracefully.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getDashboardData } from '@/lib/portal-dashboard';
import type { PortalAccount } from '@/lib/portal-auth';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: account } = await supabase
    .from('portal_accounts')
    .select('*')
    .eq('id', user.id)
    .single<PortalAccount>();
  if (!account) return NextResponse.json({ error: 'No portal account' }, { status: 403 });

  const data = await getDashboardData(account);
  return NextResponse.json(data);
}
