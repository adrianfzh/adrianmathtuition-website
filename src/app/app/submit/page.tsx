// /app/submit — hand in a photographed paper for marking.
// Server component gates the session; the phone-first UI is the client half.
// The submission becomes a ⏳ pending run in Adrian's /admin/mark-paper history
// (never anything student-visible until he marks AND releases it).
import { currentStudent } from '@/lib/portal-auth';
import SubmitClient from './submit-client';

export const dynamic = 'force-dynamic';

export default async function SubmitPage() {
  await currentStudent();
  return <SubmitClient />;
}
