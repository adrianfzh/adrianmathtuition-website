// /app/notebook — the student's error notebook.
//
// Born from marked papers: every dropped-marks question becomes an entry, the
// student re-attempts the matched VARIANT question (never the original — that
// tests memory of the answer), and two clean hits archive it as conquered.
// The interactive half lives in notebook-client; this shell only gates auth.
import { currentAccount } from '@/lib/portal-auth';
import { requireFullPortal } from '@/lib/portal-beta';
import NotebookClient from './notebook-client';

export const dynamic = 'force-dynamic';

export default async function NotebookPage() {
  // Hidden during the marking-only beta (Adrian, 2026-08-24) — students land
  // back on the dashboard; Adrian's admin cookie passes.
  await requireFullPortal();
  await currentAccount();
  return <NotebookClient />;
}
