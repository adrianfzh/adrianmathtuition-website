// Server half of ➕ Add pages (?addTo=<runId> on /app/submit and /app/science/submit).
// Ownership + "has marking started?" are checked here; opening the screen asks the
// bot to hold the paper out of the queue for 10 minutes while the student
// photographs (bot handlers/webchat.js holdForPages). Best-effort: a failed hold
// only means marking might start before they finish — the add is refused politely then.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { canAddPages } from '@/lib/add-pages';
import AddPagesClient from './add-pages-client';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function AddPagesView({ runId, studentId, backHref }: { runId: string; studentId: string; backHref: string }) {
  const { data: run } = await getSupabaseAdmin()
    .from('paper_marking_runs')
    .select('id, student_id, paper_name, total_max, released_at, queue_status, lease_until, portal:result_json->portal_submission, queue:result_json->queue, source:result_json->source, queued_for:result_json->queued_for, results:result_json->results')
    .eq('id', runId).maybeSingle();
  if (!run || run.student_id !== studentId || !run.portal) redirect(backHref);
  const row = {
    total_max: run.total_max, released_at: run.released_at, queue_status: run.queue_status, lease_until: run.lease_until,
    result_json: { queue: run.queue, source: run.source, queued_for: run.queued_for, results: run.results },
  };
  const title = (run.paper_name as string | null) || 'your paper';
  const pagesNow = Array.isArray((run.source as { photos?: unknown[] } | null)?.photos) ? (run.source as { photos: unknown[] }).photos.length : 0;

  if (!canAddPages(row)) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">➕ Add pages: {title}</h1>
        <div className={`${CARD} p-5 text-center`}>
          <p className="text-4xl">🖊</p>
          <p className="font-bold text-navy mt-2">Marking has already started on this paper</p>
          <p className="text-sm text-gray-600 mt-1.5">
            Pages can only be added while a paper is still waiting. Hand the missing pages in as a separate paper —
            name it “{title} (extra pages)” so Adrian can see they belong together.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <a href={backHref.includes('science') ? '/app/science/submit' : '/app/submit'} className="text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5">Hand them in</a>
            <Link href={backHref} className="text-sm font-semibold text-navy rounded-xl px-4 py-2.5 border border-gray-200 bg-white">Back</Link>
          </div>
        </div>
      </div>
    );
  }

  const botBase = process.env.BOT_BASE_URL, botSecret = process.env.BOT_INTERNAL_SECRET;
  if (botBase && botSecret) {
    try {
      await fetch(`${botBase}/api/mark-paper`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'pages-hold', id: runId }),
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });
    } catch { /* best-effort */ }
  }
  return <AddPagesClient runId={runId} title={title} pagesNow={pagesNow} backHref={backHref} />;
}
