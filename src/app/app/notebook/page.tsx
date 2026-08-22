// /app/notebook — the student's error notebook.
//
// Born from marked papers: every dropped-marks question becomes an entry, the
// student re-attempts the matched VARIANT question (never the original — that
// tests memory of the answer), and two clean hits archive it as conquered.
// The interactive half lives in notebook-client; this shell only gates auth.
import { currentStudent } from '@/lib/portal-auth';
import NotebookClient from './notebook-client';

export const dynamic = 'force-dynamic';

export default async function NotebookPage() {
  await currentStudent();
  return <NotebookClient />;
}
