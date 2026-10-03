// /app/science/processes — Biology processes in pictures (3 Oct 2026): the
// answers that are a chain of cause and effect, one box a step with an arrow
// between, the scoring phrase highlighted; a control loop is two chains side
// by side. Server-rendered, no script. Adrian's cookie only until
// BIOLOGY_PROCESSES_OPEN_TO_STUDENTS flips. Data: lib/bio-processes.ts.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { BIOLOGY_PROCESSES_OPEN_TO_STUDENTS, scienceMarkingOpen, viewingAsStudent } from '@/lib/portal-beta';
import { BIO_PROCESSES, type BioProcess } from '@/lib/bio-processes';
import { Marked, STUDY_CARD, StudyHeader } from '../study-bits';

export const dynamic = 'force-dynamic';

function Arrow() {
  return (
    <svg viewBox="0 0 16 18" className="w-4 h-[18px] mx-auto text-emerald-600" aria-hidden>
      <path d="M8 1 V15 M3 10.5 L8 16 L13 10.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One chain: numbered boxes, an arrow down between them. */
function Chain({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => (
        <li key={i}>
          {i > 0 && <Arrow />}
          <div className="mt-1 flex gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
            <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center" aria-hidden>{i + 1}</span>
            <p className="text-[15px] leading-snug text-gray-700"><Marked text={s} /></p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ProcessCard({ p }: { p: BioProcess }) {
  return (
    <section id={p.id} className={`${STUDY_CARD} px-4 py-4 space-y-3 scroll-mt-20`} aria-label={p.title}>
      <div>
        <h2 className="text-[17px] font-bold text-navy leading-tight">{p.title}</h2>
        <p className="text-[13px] text-gray-500">{p.lede}</p>
      </div>
      {p.steps && <Chain steps={p.steps} />}
      {p.branches && (
        <div className="grid gap-4 sm:grid-cols-2">
          {p.branches.map(b => (
            <div key={b.label} className="space-y-2">
              <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-700">{b.label}</p>
              <Chain steps={b.steps} />
            </div>
          ))}
        </div>
      )}
      {p.end && (
        <div>
          <Arrow />
          <p className="mt-1 rounded-2xl bg-emerald-600 text-white text-[15px] font-semibold px-3 py-2.5 text-center [&_strong]:bg-transparent [&_strong]:text-white"><Marked text={p.end} /></p>
        </div>
      )}
      {p.remember && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] leading-snug text-gray-800">
          <span className="font-bold text-amber-800">Remember: </span>{p.remember}
        </p>
      )}
    </section>
  );
}

export default async function BiologyProcessesPage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const isAdmin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value) && !(await viewingAsStudent());
  if (!BIOLOGY_PROCESSES_OPEN_TO_STUDENTS && !isAdmin) redirect('/app/science');
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <StudyHeader tile="bg-emerald-600" icon="flask" title="Processes in pictures" sub="Biology, step by step · the highlighted words score" />
      <nav className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 text-[13px] font-semibold" aria-label="Jump to a process">
        {BIO_PROCESSES.map(p => (
          <a key={p.id} href={`#${p.id}`} className="shrink-0 rounded-full bg-white border border-gray-200 px-3 py-1.5 text-navy whitespace-nowrap">{p.title}</a>
        ))}
      </nav>
      {BIO_PROCESSES.map(p => <ProcessCard key={p.id} p={p} />)}
      <p className="text-[12px] text-gray-400">
        For O-Level Biology (6093). Your school&apos;s wording may differ slightly. <Link href="/app/science" className="underline underline-offset-2">Back to Science</Link>
      </p>
    </div>
  );
}
