// /admin/papers — the marked-script library was folded into the desk's
// Completed lane (17 Sep 2026, SPEC-STUDENT-FIRST §5), and the desk into Mark a
// paper (30 Sep 2026). A student's papers are their profile's Papers tab.
// The API route /api/admin/papers stays (the profile and the mark page read it).
import { redirect } from 'next/navigation';

export default async function PapersRedirect({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { student } = await searchParams;
  redirect(student && /^rec[A-Za-z0-9]+$/.test(student) ? `/admin/students/${student}?tab=papers` : '/admin/mark-paper');
}
