// /app/humanities/notes — the notes for the student's Humanities subjects (21 Oct 2026, lib/humanities-notes.ts).
// Behind HUMANITIES_NOTES_OPEN_TO_STUDENTS (closed: one sample topic for Adrian first).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/portal-auth';
import { humanitiesNotesOpen } from '@/lib/portal-beta';
import { studentHumanities } from '@/lib/portal-prefs';
import { notesFor, NOTES_SUBJECT_NAME } from '@/lib/humanities-notes';

export const dynamic = 'force-dynamic';

export default async function HumanitiesNotesList() {
  if (!(await humanitiesNotesOpen())) redirect('/app/humanities');
  const pages = notesFor(studentHumanities((await currentAccount())?.prefs));
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href="/app/humanities/own" className="text-[12px] text-gray-500 hover:text-navy">‹ Check my answer</Link>
      <div>
        <h1 className="text-xl font-bold text-navy leading-snug">Notes</h1>
        <p className="text-sm text-gray-600 mt-1">The facts, terms and examples a top answer uses, one topic at a time.</p>
      </div>
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm divide-y divide-black/5">
        {pages.map(p => (
          <Link key={p.id} href={`/app/humanities/notes/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/60">
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-semibold text-amber-800">{NOTES_SUBJECT_NAME[p.subject]} · {p.unit}</span>
              <span className="block text-[15px] font-bold text-navy">{p.title}</span>
            </span>
            <span className="shrink-0 text-gray-400">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
