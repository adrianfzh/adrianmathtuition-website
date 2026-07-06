// TEMP demo page (unlinked): renders one composed lesson from lesson_cards to
// evaluate replacing the raw-KB Notes view. /app/notes-preview?lesson=<uuid>
// If approved, this layout becomes the /app/notes topic-detail view and this
// route is removed.
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { requireAuth } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  refresher: '📖 Refresher',
  worked_example: '✏️ Worked example',
  practice: '🎯 Try it yourself',
};

export default async function NotesPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  await requireAuth();
  const { lesson: lessonId } = await searchParams;
  const supabase = createServiceClient();

  const { data: lesson } = await supabase
    .from('lessons').select('id, name, level, topics').eq('id', lessonId || '').maybeSingle();
  if (!lesson) {
    return <p className="text-sm text-gray-500 p-4">Pass ?lesson=&lt;uuid&gt; — lesson not found.</p>;
  }

  const { data: cards } = await supabase
    .from('lesson_cards')
    .select('id, content_kind, section_name, card_title, content, marks, order_index')
    .eq('lesson_id', lesson.id)
    .order('order_index');

  const sections = new Map<string, NonNullable<typeof cards>>();
  for (const c of cards || []) {
    if (!c.content?.trim()) continue; // skip empty placeholders
    const key = c.section_name || 'General';
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(c);
  }

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <div className="pt-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Preview — lesson_cards layout</p>
        <h1 className="text-xl font-bold text-navy">{lesson.name} <span className="text-sm font-medium text-gray-400">({lesson.level})</span></h1>
      </div>

      {[...sections.entries()].map(([name, list]) => (
        <div key={name} className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h2 className="text-base font-bold text-navy mb-3">{name}</h2>
          <div className="space-y-4">
            {list.map(c => (
              <div
                key={c.id}
                className={
                  c.content_kind === 'worked_example'
                    ? 'rounded-xl border border-[hsl(45,60%,85%)] bg-[hsl(45,90%,98%)] p-4'
                    : c.content_kind === 'practice'
                    ? 'rounded-xl border border-blue-100 bg-blue-50/40 p-4'
                    : ''
                }
              >
                <p className="text-xs font-semibold text-gray-400 mb-1">
                  {KIND_LABEL[c.content_kind] || c.content_kind}
                  {c.card_title ? <span className="text-gray-600"> · {c.card_title}</span> : null}
                  {c.marks ? <span> · [{c.marks}m]</span> : null}
                </p>
                <div className="prose prose-sm max-w-none text-gray-800 [&_p]:my-1.5 overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {c.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
