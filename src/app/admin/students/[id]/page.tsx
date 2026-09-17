// /admin/students/[id] — the student profile (17 Sep 2026: the one door,
// SPEC-STUDENT-FIRST §2). A server page so the Papers tab can be rendered
// server-side and handed to the client shell as a node.
import { Suspense } from 'react';
import StudentProfileClient from './profile-client';
import PapersTab from './papers-tab';

export const dynamic = 'force-dynamic';

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading…</div>}>
      <StudentProfileClient papersTab={<PapersTab studentId={id} />} />
    </Suspense>
  );
}
