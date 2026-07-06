// /app/notes — revision notes from the knowledge base, filtered to the
// student's level. Server component; KB reads use the service client (the
// KB is not student-owned data — it's Adrian's content, safe to serve to any
// authenticated student at their level).
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { currentStudent } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Airtable Level → KB subject tabs
function subjectsForLevel(level: string | null): string[] {
  if (!level) return ['EM', 'AM', 'JC'];
  if (/^Sec\s?1/i.test(level)) return ['S1'];
  if (/^Sec\s?2/i.test(level)) return ['S2'];
  if (/^Sec/i.test(level)) return ['EM', 'AM'];
  if (/^JC/i.test(level)) return ['JC'];
  return ['EM', 'AM', 'JC'];
}

const SUBJECT_LABEL: Record<string, string> = {
  S1: 'Sec 1', S2: 'Sec 2', EM: 'E Math', AM: 'A Math', JC: 'H2 Math',
};
const SECTION_BADGE: Record<string, string> = {
  concept: '💡 Concept', definition: '📖 Definition', formula: '📐 Formula',
  method: '🛠 Method', example: '✏️ Example', tip: '⭐ Tip', pitfall: '⚠️ Pitfall',
};
const SECTION_ORDER = ['concept', 'definition', 'formula', 'method', 'example', 'tip', 'pitfall'];

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; topic?: string }>;
}) {
  const { account } = await currentStudent();
  const sp = await searchParams;
  const subjects = subjectsForLevel(account.level);
  const subject = subjects.includes(sp.subject || '') ? sp.subject! : subjects[0];
  const topic = sp.topic || null;
  const supabase = createServiceClient();

  const card = 'bg-white rounded-2xl border border-black/5 shadow-sm';

  // ---- Topic detail view ----
  if (topic) {
    const { data: entries } = await supabase
      .from('kb_entries')
      .select('id, subtopic, section_type, title, content, importance')
      .eq('subject', subject)
      .eq('topic', topic)
      .eq('status', 'approved')
      .not('is_current', 'is', false)
      .order('subtopic')
      .order('importance', { ascending: false });

    // Group by subtopic, order sections within each by type then importance
    const bySubtopic = new Map<string, NonNullable<typeof entries>>();
    for (const e of entries || []) {
      const key = e.subtopic || 'General';
      if (!bySubtopic.has(key)) bySubtopic.set(key, []);
      bySubtopic.get(key)!.push(e);
    }
    for (const list of bySubtopic.values()) {
      list.sort((a, b) =>
        SECTION_ORDER.indexOf(a.section_type) - SECTION_ORDER.indexOf(b.section_type) ||
        (b.importance || 0) - (a.importance || 0));
    }

    return (
      <div className="space-y-4 pb-20 sm:pb-4">
        <div className="flex items-center justify-between pt-1">
          <div>
            <Link href={`/app/notes?subject=${subject}`} className="text-sm text-navy underline underline-offset-2">
              ← {SUBJECT_LABEL[subject] || subject} topics
            </Link>
            <h1 className="text-xl font-bold text-navy mt-1">{topic}</h1>
          </div>
        </div>

        {bySubtopic.size === 0 && (
          <div className={`${card} p-5`}><p className="text-sm text-gray-500">No notes for this topic yet.</p></div>
        )}

        {[...bySubtopic.entries()].map(([sub, list]) => (
          <div key={sub} className={`${card} p-5`}>
            <h2 className="text-base font-bold text-navy mb-3">{sub}</h2>
            <div className="space-y-4">
              {list.map(e => (
                <div key={e.id} className="border-l-2 border-[hsl(45,80%,85%)] pl-3">
                  <p className="text-xs font-semibold text-gray-400 mb-0.5">
                    {SECTION_BADGE[e.section_type] || e.section_type}
                    {e.title ? <span className="text-gray-600"> · {e.title}</span> : null}
                  </p>
                  <div className="prose prose-sm max-w-none text-gray-800 [&_p]:my-1.5">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {e.content || ''}
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

  // ---- Topic list view ----
  const { data: rows } = await supabase
    .from('kb_entries')
    .select('topic')
    .eq('subject', subject)
    .eq('status', 'approved')
    .not('is_current', 'is', false);

  const counts = new Map<string, number>();
  for (const r of rows || []) counts.set(r.topic, (counts.get(r.topic) || 0) + 1);
  const topics = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Notes</h1>

      {subjects.length > 1 && (
        <div className="flex gap-2">
          {subjects.map(s => (
            <Link
              key={s}
              href={`/app/notes?subject=${s}`}
              className={`text-sm rounded-full px-4 py-1.5 font-semibold transition-colors ${
                s === subject ? 'bg-navy text-[hsl(45,100%,96%)]' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/40'
              }`}
            >
              {SUBJECT_LABEL[s] || s}
            </Link>
          ))}
        </div>
      )}

      <div className={`${card} divide-y divide-gray-100`}>
        {topics.length === 0 && <p className="p-5 text-sm text-gray-500">No notes available yet.</p>}
        {topics.map(([t, n]) => (
          <Link
            key={t}
            href={`/app/notes?subject=${subject}&topic=${encodeURIComponent(t)}`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-[hsl(45,100%,98%)] transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">{t}</span>
            <span className="text-xs text-gray-400">{n} notes ›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
