// /app/languages/listening/<id> — one recording and its questions (SPEC-ENGLISH-ORAL-LISTENING.md).
// <id> is a set of the first paper (ls01…) or a part of a made paper (lp001-1…, from the table, its
// recording in the public bucket). The words of the recording and the key are NOT in this page;
// they come back with the check.
import { redirect } from 'next/navigation';
import { englishListeningOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { publicListening } from '@/lib/english-listening';
import { paperOfPart, partId } from '@/lib/english-listening-papers';
import { loadPart, partAudioUrl } from '@/lib/english-listening-store';
import { listeningAudio, listeningById } from '@/lib/english-speaking-data';
import ListeningForm from '../listening-form';

export const dynamic = 'force-dynamic';

export default async function ListeningPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await englishListeningOpen())) redirect('/app/languages');
  const { id } = await params;
  const pid = paperOfPart(id);
  if (pid) {
    const admin = !(await viewingAsStudent()) && (await isNotesAuthed());
    const got = await loadPart(id, { admin }).catch(() => null);
    if (!got) redirect('/app/languages/listening');
    const i = got.paper.paper.parts.findIndex(s => s.id === id);
    const paperHref = `/app/languages/listening/paper/${pid}`;
    return <ListeningForm key={id} set={publicListening(got.set)} audio={partAudioUrl(id)} kicker={`Part ${i + 1} of 4`}
      back={{ href: paperHref, label: 'The paper' }}
      next={i < 3 ? { href: `/app/languages/listening/${partId(pid, i + 1)}`, label: `Next: part ${i + 2}` } : undefined} />;
  }
  const set = listeningById(id);
  if (!set) redirect('/app/languages/listening');
  return <ListeningForm set={publicListening(set)} audio={listeningAudio(set.id)} />;
}
