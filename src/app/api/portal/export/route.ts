// GET /api/portal/export — PDPA data portability: everything stored about the
// logged-in student, as a downloadable JSON file. Reads via the user-scoped
// client so RLS guarantees the export can only ever contain their own rows.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: account }, { data: attempts }] = await Promise.all([
    supabase.from('portal_accounts').select('*').eq('id', user.id).single(),
    supabase.from('student_attempts').select('*').eq('user_id', user.id).order('attempted_at', { ascending: true }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account,
    practice_attempts: attempts || [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="adrianmath-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
