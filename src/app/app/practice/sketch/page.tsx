// 📈 /app/practice/sketch — the graph-sketch checker (SPEC-SKETCH-CHECK.md, 5 Oct 2026;
// Adrian: "build … the graph sketch checker"). Pick the graph, sketch it on paper,
// photograph it; the red pen checks every asymptote, intercept and turning point is
// drawn and labelled and the shape is right. Closed switch: Adrian's cookie + the demo
// student (lib/portal-beta h2ToolOpen('sketch')).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { h2ToolOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { sketchQuestions, DAILY_SKETCH_CAP } from '@/lib/sketch-check';
import { listSketches } from '@/lib/sketch-check-store';
import { MathText } from '../question-view';
import SketchForm from './sketch-form';

export const dynamic = 'force-dynamic';
const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function SketchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const account = await sessionAccount().catch(() => null);
  const isAdmin = !(await viewingAsStudent()) && (await isNotesAuthed());
  if (!account && !isAdmin) redirect('/login');
  if (!(await h2ToolOpen('sketch', account))) redirect('/app/practice');
  const { q } = await searchParams;
  const identity = account ? portalIdentity(account) : 'admin';
  const past = await listSketches(identity, 10).catch(() => []);
  const questions = sketchQuestions().map(x => ({ id: x.id, source: x.source, shown: x.shown, ask: x.ask, marks: x.marks }));
  const byRef = new Map(questions.map(x => [x.id, x]));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/practice" className="text-xs text-gray-500">‹ Practice</Link>
        <h1 className="text-xl font-bold text-navy mt-1">Check my sketch</h1>
        <p className="text-sm text-gray-600 mt-1">Sketch the graph on paper. Photograph it.</p>
        <p className="text-sm text-gray-600">Every asymptote, intercept and turning point is checked.</p>
      </div>

      <SketchForm questions={questions} initialQuestion={q && byRef.has(q) ? q : null} />
      <p className="text-xs text-gray-400 text-center">{DAILY_SKETCH_CAP} checks a day.</p>

      {past.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">My sketches</p>
          {past.map(p => {
            const src = p.question_ref ? byRef.get(p.question_ref)?.source : null;
            const score = p.status === 'checked' && p.item_count ? `${p.right_count}/${p.item_count} right` : p.status === 'failed' ? 'Not checked' : 'Checking…';
            return (
              <Link key={p.id} href={`/app/practice/sketch/${p.id}`} className={`${CARD} flex items-center gap-3 px-4 py-3 hover:bg-[hsl(45,100%,99%)] transition`}>
                <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                  {src ?? (p.shown ? <MathText text={p.shown.includes('\\') ? `$${p.shown}$` : p.shown} /> : 'A sketch')}
                </span>
                <span className="text-xs text-gray-500 shrink-0">{score}</span>
                <span aria-hidden className="text-gray-300">›</span>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
