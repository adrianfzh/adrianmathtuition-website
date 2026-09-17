// /admin/papers — the marked-script library was folded into the desk's
// Completed lane (17 Sep 2026, SPEC-STUDENT-FIRST §5). The API route
// /api/admin/papers stays (the profile and the mark page read it).
import { redirect } from 'next/navigation';

export default async function PapersRedirect({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { student } = await searchParams;
  redirect(student ? `/admin/desk?lane=released&student=${encodeURIComponent(student)}` : '/admin/desk?lane=released');
}
