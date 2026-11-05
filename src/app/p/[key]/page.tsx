// 👪 The parent's read-only note after a shared-board lesson (SPEC-TUTOR-TOOLS §8; Adrian, 6 Nov 2026). Opened from
// the private link the tutor sends on WhatsApp. Shows only the note — never the board, never anything else.
// Never indexed; disallowed in robots.ts.
import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ParentNote } from '@/lib/board-summary';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: "Today's lesson",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default async function ParentNotePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ok = /^[A-Za-z0-9_-]{20,40}$/.test(key);
  const sb = getSupabaseAdmin();
  const { data } = ok ? await sb.from('shared_boards').select('parent_note, tutor_id, tutor_student_id').eq('parent_key', key).maybeSingle() : { data: null };
  const row = data as { parent_note: ParentNote | null; tutor_id: string; tutor_student_id: string } | null;
  const note = row?.parent_note ?? null;
  const [{ data: t }, { data: s }] = row
    ? await Promise.all([
      sb.from('tutor_accounts').select('display_name, active').eq('id', row.tutor_id).maybeSingle(),
      sb.from('tutor_students').select('name').eq('id', row.tutor_student_id).maybeSingle(),
    ])
    : [{ data: null }, { data: null }];
  const tutor = t as { display_name: string; active: boolean } | null;
  if (!note || !tutor?.active) {
    return <main className="mx-auto max-w-md px-4 py-16 text-center text-slate-700"><p className="text-lg font-semibold">This note is not available</p><p className="mt-2 text-sm">Ask your child’s tutor to send it again.</p></main>;
  }
  const child = String((s as { name?: string } | null)?.name ?? '').trim().split(/\s+/)[0];
  const date = new Date(note.at).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' });
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">{date}</p>
        <h1 className="mt-1 text-xl font-bold">Today’s maths lesson{child ? ` with ${child}` : ''}</h1>
        <p className="text-sm text-slate-500">From {tutor.display_name}</p>
        <section className="mt-5">
          <h2 className="font-bold">What we worked on</h2>
          <p className="mt-1 leading-relaxed">{note.worked}</p>
        </section>
        <section className="mt-4 rounded-xl bg-amber-50 p-3">
          <h2 className="font-bold text-amber-900">What to watch</h2>
          <p className="mt-1 leading-relaxed">{note.watch}</p>
        </section>
        <section className="mt-4">
          <h2 className="font-bold">How you can help at home</h2>
          <p className="mt-1 leading-relaxed">{note.help}</p>
        </section>
      </div>
    </main>
  );
}
