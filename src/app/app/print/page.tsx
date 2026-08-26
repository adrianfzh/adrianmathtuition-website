// /app/print — "Print a paper": student self-serve printable papers
// (SPEC-PRINT-PAPER.md). Three presets — Mock exam / My topics / Fix my weak
// spots — generated from the QB, pre-registered for the marking loop, and
// downloaded as a PDF with working space + an answer-key page.
//
// Rides the full-portal switch (spec D2): hidden from marking-only beta
// students; Adrian's admin cookie sees it, and generating needs his test
// STUDENT session too (the API registers papers against a student).
import Link from 'next/link';
import { requireFullPortal } from '@/lib/portal-beta';
import { createSupabaseServer } from '@/lib/supabase-server';
import { qbLevelsFor } from '@/lib/qb-levels';
import { PRINT_POOL_SCOPE } from '@/lib/print-paper';
import PrintClient from './print-client';

export const dynamic = 'force-dynamic';

export default async function PrintPage() {
  await requireFullPortal();

  let levels: { key: string; label: string }[] | null = null;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: account } = await supabase
      .from('portal_accounts')
      .select('level, subjects')
      .eq('id', user.id)
      .single<{ level: string | null; subjects: string[] | null }>();
    if (account) {
      levels = qbLevelsFor(account.level, account.subjects).filter(l => PRINT_POOL_SCOPE[l.key]);
    }
  }

  if (!levels || !levels.length) {
    // Admin cookie without a student session (or an account with no levels):
    // papers register against a student, so there is nobody to print for.
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">Print a paper</h1>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <p className="text-sm text-gray-600">
            Papers are printed for a student account. <Link href="/login" className="font-semibold text-navy underline">Log in as a student</Link> to
            generate one — every paper is registered so handing it back in marks against the exact questions on it.
          </p>
        </div>
      </div>
    );
  }

  return <PrintClient levels={levels} />;
}
