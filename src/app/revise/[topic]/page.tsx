// /revise/[level] — topic browser for a level's revision decks.
// Lists every topic that has published content_snippets, linking to its
// 💡 Worked Examples deck and ⚡ Quick Recall deck (only kinds that exist).
// [topic] param is historically the LEVEL segment (am/em/jc/s1/s2) — the
// deck routes underneath are /revise/[level]/[topic-slug]/{worked-examples,recall}.
import { notFound } from 'next/navigation';
import { topicSlug } from '@/lib/topic-slug';
import { getSupabase } from '@/lib/supabase';

const VALID_LEVELS = ['am', 'em', 'jc', 's1', 's2'];
const LEVEL_LABELS: Record<string, string> = {
  am: 'A-Math (O-Level)', em: 'E-Math (O-Level)', jc: 'H2 Math (A-Level)',
  s1: 'Sec 1 Math', s2: 'Sec 2 Math',
};

export const revalidate = 300; // topics change rarely; cache for 5 min

export default async function LevelTopicsPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic: levelParam } = await params;
  const level = levelParam.toLowerCase();
  if (!VALID_LEVELS.includes(level)) return notFound();

  const supa = getSupabase();
  const { data } = await supa
    .from('content_snippets')
    .select('topic, content_kind')
    .eq('level', level.toUpperCase())
    .eq('is_published', true)
    .in('content_kind', ['worked_example', 'recall_card']);

  const byTopic = new Map<string, { examples: number; recall: number }>();
  for (const row of data || []) {
    const t = byTopic.get(row.topic) || { examples: 0, recall: 0 };
    if (row.content_kind === 'worked_example') t.examples += 1;
    else t.recall += 1;
    byTopic.set(row.topic, t);
  }
  const topics = [...byTopic.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <main className="min-h-screen bg-[#F5EFE2] px-5 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          Revision decks
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {LEVEL_LABELS[level] || level.toUpperCase()}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          ⚡ Quick recall — one reflex per card, for speed. 💡 Worked examples — full
          step-by-step solutions.
        </p>

        {topics.length === 0 ? (
          <p className="mt-10 text-slate-500">Decks for this level are still being made.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {topics.map(([topic, counts]) => {
              const slug = topicSlug(topic);
              return (
                <li
                  key={topic}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="font-semibold text-slate-800">{topic}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {counts.recall > 0 && (
                      <a
                        href={`/revise/${level}/${slug}/recall`}
                        className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 hover:bg-amber-200"
                      >
                        ⚡ Quick recall · {counts.recall}
                      </a>
                    )}
                    {counts.examples > 0 && (
                      <a
                        href={`/revise/${level}/${slug}/worked-examples`}
                        className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-800 hover:bg-sky-200"
                      >
                        💡 Worked examples · {counts.examples}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
