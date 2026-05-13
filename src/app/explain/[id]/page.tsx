import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getSupabase } from '@/lib/supabase';
import { topicSlug } from '@/lib/topic-slug';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = getSupabase();
  const { data: row } = await supa
    .from('explanations')
    .select('content, topic, level, identified_subgroup_id, identified_subgroup_name, expires_at, question_text')
    .eq('id', id)
    .maybeSingle();

  if (!row) return notFound();

  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-lg text-gray-700">This explanation has expired.</p>
        <p className="text-sm text-gray-500 mt-2">Tap Explain on a recent answer to generate a fresh one.</p>
      </main>
    );
  }

  const sgUrl =
    row.identified_subgroup_id && row.level && row.topic
      ? `/revise/${row.level.toLowerCase()}/${topicSlug(row.topic)}/worked-examples?subgroup=${row.identified_subgroup_id}`
      : null;

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      {(row.level || row.topic) && (
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-4">
          {[row.level, row.topic].filter(Boolean).join(' · ')}
        </div>
      )}
      <article className="prose prose-slate max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[[rehypeKatex, { strict: false, trust: true, output: 'htmlAndMathml' }]]}
        >
          {row.content}
        </ReactMarkdown>
      </article>
      {sgUrl && (
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={sgUrl}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            🎓 Teach me this concept
          </a>
          {row.identified_subgroup_name && (
            <span className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm">
              {row.identified_subgroup_name}
            </span>
          )}
        </div>
      )}
    </main>
  );
}
