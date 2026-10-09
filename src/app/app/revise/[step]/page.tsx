// /app/revise/[step] — the first address of the LEARN steps (9 Oct 2026, before
// Learn and Revise were told apart). Kept as a redirect so the links Adrian was
// given still open; the steps live at /app/learn-step/[step]. "Revise" is being
// kept for the path that starts from exam questions (SPEC-SELF-LEARNING.md §4a).
import { redirect } from 'next/navigation';

const MOVED: Record<string, string> = { 'perfect-squares': 'special-products' };

export default async function OldLearnStepAddress({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  redirect(`/app/learn-step/${MOVED[step] ?? step}`);
}
