// /app/languages/formats — how to set out each situational-writing text type
// (6 Oct 2026). The door is a row on Languages Home. Server-rendered. The
// Languages family is closed (essayMarkingOpen); inside it this page is Adrian's
// cookie only until ENGLISH_FORMATS_OPEN_TO_STUDENTS flips. Data: lib/english-formats.ts.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { englishFormatsOpen, essayMarkingOpen } from '@/lib/portal-beta';
import { BEFORE_WRITING, COMMON_SLIPS, FORMATS, PAIRS, WHAT_SCORES } from '@/lib/english-formats';
import { Marked, STUDY_CARD, StudyHeader } from '../../science/study-bits';

export const dynamic = 'force-dynamic';

const HEAD = 'text-[12px] font-bold uppercase tracking-wide text-violet-700';

function Steps({ lines }: { lines: readonly string[] }) {
  return (
    <ol className="space-y-1.5">
      {lines.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-snug text-gray-700">
          <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center" aria-hidden>{i + 1}</span>
          <span><Marked text={s} /></span>
        </li>
      ))}
    </ol>
  );
}

export default async function EnglishFormatsPage() {
  if (!(await essayMarkingOpen())) redirect('/app');
  if (!(await englishFormatsOpen())) redirect('/app/languages');
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <StudyHeader tile="bg-violet-600" icon="book" title="Formats" sub="Situational writing · 30 marks · 250–350 words" />

      <section className={`${STUDY_CARD} px-4 py-4 space-y-2`} aria-label="What earns the marks">
        <h2 className={HEAD}>What earns the marks</h2>
        <Steps lines={WHAT_SCORES} />
      </section>

      <section className={`${STUDY_CARD} px-4 py-4 space-y-2`} aria-label="Before you write">
        <h2 className={HEAD}>Before you write</h2>
        <Steps lines={BEFORE_WRITING} />
      </section>

      <section className={`${STUDY_CARD} px-4 py-4 space-y-2`} aria-label="Greeting and close">
        <h2 className={HEAD}>Greeting and close go in pairs</h2>
        <div className="divide-y divide-gray-100">
          {PAIRS.map(p => (
            <div key={p.greeting} className="py-2">
              <p className="text-[13px] text-gray-500">{p.when}</p>
              <p className="text-[15px] font-semibold text-navy">{p.greeting} <span className="text-gray-400 font-normal">→</span> {p.close}</p>
            </div>
          ))}
        </div>
      </section>

      <nav className="flex flex-wrap gap-1.5" aria-label="Text types">
        {FORMATS.map(f => (
          <a key={f.key} href={`#${f.key}`} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[13px] font-semibold text-violet-800">{f.name}</a>
        ))}
      </nav>

      {FORMATS.map(f => (
        <section key={f.key} id={f.key} className={`${STUDY_CARD} px-4 py-4 space-y-3 scroll-mt-20`} aria-label={f.name}>
          <div>
            <h2 className="text-[17px] font-bold text-navy leading-tight">{f.name}</h2>
            <p className="text-[13px] text-gray-500">{f.feel}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-violet-200 bg-violet-50/50 px-3 py-2.5">
              <p className={HEAD}>On the page, top to bottom</p>
              <ul className="mt-1 space-y-1">
                {f.layout.map((l, i) => (
                  <li key={i} className="text-[15px] leading-snug text-gray-700"><Marked text={l} /></li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 px-3 py-2.5">
              <p className={HEAD}>What goes in it</p>
              <ul className="mt-1 space-y-1">
                {f.body.map((l, i) => (
                  <li key={i} className="text-[15px] leading-snug text-gray-700"><Marked text={l} /></li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ))}

      <section className={`${STUDY_CARD} px-4 py-4 space-y-2`} aria-label="Slips that cost marks">
        <h2 className={HEAD}>Slips that cost marks</h2>
        <ul className="space-y-1.5">
          {COMMON_SLIPS.map((s, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-snug text-gray-700">
              <span className="font-bold text-red-600 shrink-0" aria-hidden>✗</span><span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[12px] text-gray-400">
        For O-Level English, Paper 1 Section B. <Link href="/app/languages" className="underline underline-offset-2">Back to Languages</Link>
      </p>
    </div>
  );
}
