// "Their app, as they see it" (13 Sep 2026) is now the profile's Papers tab
// (17 Sep 2026, SPEC-STUDENT-FIRST §3) — same rules, same rows, Adrian's
// doors under each card. The old address keeps working by redirect.
import { redirect } from 'next/navigation';

export default async function StudentAppMirrorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/students/${id}?tab=papers`);
}
