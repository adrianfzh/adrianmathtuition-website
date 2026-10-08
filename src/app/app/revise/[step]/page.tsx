// /app/revise/[step] — 📗 one revision step (SPEC-SELF-LEARNING.md §4, 9 Oct 2026):
// a worked example one line a tap → try one with the next step on tap → five on
// your own, typed and checked at once, pass 4 of 5. Everything is worked out on
// the device from the step's brackets (lib/revise-step) — no model, no database.
// ADMIN ONLY behind REVISE_OPEN_TO_STUDENTS (lib/portal-beta): a student who
// types the address lands back on Home. Linked from nowhere yet.
import { notFound, redirect } from 'next/navigation';
import { reviseVisible } from '@/lib/portal-beta';
import { reviseStepBySlug } from '@/lib/revise-steps';
import ReviseFlow from './revise-flow';

export const dynamic = 'force-dynamic';

export default async function RevisePage({ params }: { params: Promise<{ step: string }> }) {
  if (!(await reviseVisible())) redirect('/app');
  const { step: slug } = await params;
  const step = reviseStepBySlug(slug);
  if (!step) notFound();
  return <ReviseFlow step={step} />;
}
