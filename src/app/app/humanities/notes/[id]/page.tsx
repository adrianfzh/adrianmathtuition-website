// /app/humanities/notes/<id> — one topic's notes (21 Oct 2026, lib/humanities-notes.ts): the big idea, the timeline,
// key terms, how it happened (one step a line), the reasons with their evidence, using it in the exam, and one
// well-used paragraph. One idea per line throughout (CLAUDE.md readability rule).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { humanitiesNotesOpen } from '@/lib/portal-beta';
import { notesPage, NOTES_SUBJECT_NAME } from '@/lib/humanities-notes';

export const dynamic = 'force-dynamic';

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
    <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</h2>
    {children}
  </section>
);

export default async function HumanitiesNotesPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await humanitiesNotesOpen())) redirect('/app/humanities');
  const p = notesPage((await params).id);
  if (!p) notFound();
  const sides = [...new Set((p.reasons ?? []).map(r => r.side))];
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href="/app/humanities/notes" className="text-[12px] text-gray-500 hover:text-navy">‹ Notes</Link>
      <div>
        <p className="text-[12px] font-semibold text-amber-800">{NOTES_SUBJECT_NAME[p.subject]} · {p.unit}</p>
        <h1 className="text-2xl font-bold text-navy leading-snug">{p.title}</h1>
      </div>

      <Card title="The big idea">
        <ul className="space-y-1.5">{p.bigIdea.map((l, i) => <li key={i} className="text-[15px] text-gray-800 leading-snug">{l}</li>)}</ul>
      </Card>

      {p.timeline?.length ? (
        <Card title="Key dates">
          <ol className="space-y-2.5">
            {p.timeline.map((t, i) => (
              <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-2">
                <span className="text-[14px] font-bold text-navy">{t.when}</span>
                <span className="text-[15px] text-gray-800 leading-snug">{t.what}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card title="Key terms">
        <dl className="space-y-2">
          {p.terms.map(t => (
            <div key={t.term}>
              <dt className="text-[15px] font-bold text-navy">{t.term}</dt>
              <dd className="text-[14px] text-gray-700 leading-snug">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {p.chains.map(c => (
        <Card key={c.title} title={c.title}>
          <ol className="space-y-2">
            {c.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-900 text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="text-[15px] text-gray-800 leading-snug">{s}</span>
              </li>
            ))}
          </ol>
        </Card>
      ))}

      {sides.map(side => (
        <Card key={side} title={`Reasons: ${side.toLowerCase()}`}>
          <div className="space-y-4">
            {(p.reasons ?? []).filter(r => r.side === side).map(r => (
              <div key={r.reason}>
                <p className="text-[15px] font-bold text-navy">{r.reason}</p>
                <ul className="mt-1 space-y-1">
                  {r.evidence.map((e, i) => <li key={i} className="text-[14px] text-gray-700 leading-snug pl-3 border-l-2 border-amber-200">{e}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card title="Using it in the exam">
        <ul className="space-y-1.5">{p.inExam.map((l, i) => <li key={i} className="text-[15px] text-gray-800 leading-snug">{l}</li>)}</ul>
      </Card>

      {p.example && (
        <Card title="A well-used paragraph">
          <p className="text-[13px] text-gray-500 italic">{p.example.question}</p>
          <p className="text-[15px] text-gray-800 leading-relaxed mt-2">{p.example.text}</p>
        </Card>
      )}
    </div>
  );
}
