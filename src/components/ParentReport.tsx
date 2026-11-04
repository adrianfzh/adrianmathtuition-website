// 👪 The weekly parent report as a parent sees it (SPEC-PARENT-REPORT.md). One
// component for the private link (/parent/r/<token>), the parent's own page
// (/parent) and Adrian's preview (/admin/parent-report). Server component, no JS:
// "Stop these reports" is a plain form POST.
import type { ReportWords } from '@/lib/parent-report';

export function ParentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-md px-4 py-5">
        <p className="text-xs font-semibold tracking-wide text-slate-400">ADRIANMATH</p>
        {children}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-1.5 text-[16px] leading-snug">{children}</div>
    </section>
  );
}

export default function ParentReport({ words, shareUrl, stop }: {
  words: ReportWords;
  shareUrl: string;
  stop?: { action: string; fields: Record<string, string> } | null;
}) {
  return (
    <article className="mt-2 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{words.title}</p>
      <h1 className="mt-0.5 text-2xl font-bold text-[#1e3a5f]">{words.heading}</h1>

      <Section title="This week">
        {words.done.length
          ? <ul className="list-disc space-y-1.5 pl-5">{words.done.map((d) => <li key={d}>{d}</li>)}</ul>
          : <p>No practice or papers this week.</p>}
      </Section>

      {words.wins.length > 0 && (
        <Section title="Going well">
          <ul className="list-disc space-y-1.5 pl-5">{words.wins.map((d) => <li key={d}>{d}</li>)}</ul>
        </Section>
      )}

      {words.weak && <Section title="To work on"><p>{words.weak}</p></Section>}

      <p className="mt-6 text-[16px] leading-snug">{words.action}</p>
      <a href={shareUrl} className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#25D366] px-4 py-3 text-[16px] font-semibold text-white">
        {words.button}
      </a>

      {stop && (
        <form action={stop.action} method="post" className="mt-6 border-t border-slate-100 pt-4 text-center">
          {Object.entries(stop.fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button type="submit" className="text-sm text-slate-400 underline">Stop these reports</button>
        </form>
      )}
    </article>
  );
}
