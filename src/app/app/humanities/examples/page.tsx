// /app/humanities/examples — the example bank for Social Studies structured
// response (SPEC-HUMANITIES.md §A3, 7 Oct 2026): real examples, one short fact a
// line, and what each one shows. Behind humanitiesOpen().
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { humanitiesOpen } from '@/lib/portal-beta';
import { examplesByTheme } from '@/lib/humanities-examples';
import { SS_THEME_NAME } from '@/lib/humanities-questions';

export const dynamic = 'force-dynamic';

export default async function HumanitiesExamplesPage() {
  if (!(await humanitiesOpen())) redirect('/app');
  const groups = examplesByTheme();
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href="/app/humanities" className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>
      <div>
        <h1 className="text-xl font-bold text-navy leading-tight">Examples to use</h1>
        <p className="text-sm text-gray-600 mt-1">For &ldquo;Explain two ways&rdquo; and &ldquo;Do you agree?&rdquo;</p>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-3xl px-4 py-3 text-sm text-gray-700 space-y-1">
        <p>Learn two or three for each issue.</p>
        <p>In each paragraph: make your <b>point</b>, give one <b>example</b>, then <b>link</b> it to the question.</p>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {groups.map(g => (
          <a key={g.theme} href={`#${g.theme}`} className="text-[12px] font-semibold text-amber-800 bg-white border border-amber-200 rounded-full px-3 py-1">{SS_THEME_NAME[g.theme]}</a>
        ))}
      </nav>

      {groups.map(g => (
        <section key={g.theme} id={g.theme} className="space-y-2 scroll-mt-20">
          <h2 className="text-[13px] font-semibold text-navy pt-1">{SS_THEME_NAME[g.theme]}</h2>
          {g.examples.map(e => (
            <article key={e.id} className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
              <h3 className="text-[15px] font-bold text-navy leading-snug">{e.name}</h3>
              <ul className="mt-1.5 space-y-1">
                {e.what.map((line, i) => <li key={i} className="text-[15px] text-gray-800 leading-snug">{line}</li>)}
              </ul>
              <div className="mt-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">
                <p className="text-[12px] font-semibold text-amber-800">What it shows</p>
                <p className="text-[15px] font-semibold text-navy leading-snug">{e.shows}</p>
              </div>
              <p className="mt-2 text-[12px] text-gray-500">Use it for: {e.use.join(' · ')}</p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
