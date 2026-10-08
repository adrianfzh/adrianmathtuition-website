// /app/languages/listening/<id> — one recording and its questions
// (SPEC-ENGLISH-ORAL-LISTENING.md). The words of the recording and the key are NOT in this page;
// they come back with the check.
import { redirect } from 'next/navigation';
import { englishListeningOpen } from '@/lib/portal-beta';
import { publicListening } from '@/lib/english-listening';
import { listeningAudio, listeningById } from '@/lib/english-speaking-data';
import ListeningForm from '../listening-form';

export const dynamic = 'force-dynamic';

export default async function ListeningPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await englishListeningOpen())) redirect('/app/languages');
  const { id } = await params;
  const set = listeningById(id);
  if (!set) redirect('/app/languages/listening');
  return <ListeningForm set={publicListening(set)} audio={listeningAudio(set.id)} />;
}
