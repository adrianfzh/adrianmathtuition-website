// /app/submit/tutor-marked — file a paper the tutor marked ON PAPER (5 Oct 2026,
// lib/tutor-marked). Photos or a PDF of the hand-marked copy, the paper's name, and
// the total (read off the pages, or typed when that read is unsure). No marking.
// Behind TUTOR_MARKED_UPLOAD_OPEN_TO_STUDENTS.
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/portal-auth';
import { tutorMarkedUploadOpen } from '@/lib/portal-beta';
import { allowedSubjects } from '@/lib/portal-subjects';
import TutorMarkedClient from './tutor-marked-client';

export const dynamic = 'force-dynamic';

export default async function TutorMarkedPage() {
  const account = await currentAccount();
  if (!(await tutorMarkedUploadOpen())) redirect('/app/submit');
  return <TutorMarkedClient subjects={allowedSubjects(account)} />;
}
