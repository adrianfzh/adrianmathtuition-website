// /app/reschedule — student self-service lesson moves, from the Home page's
// "Next lesson" row. Deliberately NOT behind requireFullPortal: this is lesson
// logistics (the same thing students already do via the Telegram/WhatsApp
// bot), not portal content, so it stays available during the marking-only
// beta. All rules and the write live bot-side — see /api/portal/reschedule.
import { currentStudent } from '@/lib/portal-auth';
import RescheduleClient from './reschedule-client';

export const dynamic = 'force-dynamic';

export default async function ReschedulePage() {
  await currentStudent(); // auth gate only — data comes from the API
  return <RescheduleClient />;
}
