// /admin/extraction-rules — 📜 every rule the question-bank extraction follows, in plain words
// (Adrian, 5 Oct 2026: "are standing rules fixed?" → "yes do that").
// Read-only. The rows are Supabase `extraction_rules`; the workers read the law
// (`extraction_worker_prompt` 'exam-extraction'), and each row's law_text is the text there.
// Proposed rules (from the bot's extraction learner) sit on top; Adrian answers them from
// Telegram ("ship proposal xr-…"). "Change this" copies a request he hands to a session.
// docs/EXTRACTION-QUEUE.md §The rules in plain words.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { addedLine, changeRequest, groupRules, lines, type ExtractionRule } from '@/lib/extraction-rules';
import CopyButton from './CopyButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Extraction rules' };

function RuleCard({ r, tone = 'plain' }: { r: ExtractionRule; tone?: 'plain' | 'waiting' }) {
  const why = lines(r.why);
  const change = lines(r.proposal);
  const papers = (r.evidence ?? []).filter(e => e && e.paper);
  return (
    <li className={`rounded-xl border p-4 ${tone === 'waiting' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <p className="font-semibold text-gray-900">{r.title}</p>
      {lines(r.plain_words).map((l, i) => <p key={i} className="mt-1 text-[15px] leading-relaxed text-gray-800">{l}</p>)}
      <p className="mt-1.5 text-xs text-gray-500">{addedLine(r)}</p>
      {why.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{tone === 'waiting' ? 'What happened' : 'Why'}</p>
          {why.map((l, i) => <p key={i} className="text-sm leading-relaxed text-gray-700">{l}</p>)}
        </div>
      )}
      {tone === 'waiting' && change.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">What it would change</p>
          {change.map((l, i) => <p key={i} className="text-sm leading-relaxed text-gray-700">{l}</p>)}
        </div>
      )}
      {tone === 'waiting' && r.note && <p className="mt-2 text-sm text-gray-700">Your note: “{r.note}”</p>}
      {tone === 'waiting' && (
        <p className="mt-3 text-sm text-gray-700">
          To decide: tap Ship, Change or Drop under its Telegram message, or type <span className="font-mono">ship proposal {r.slug}</span>.
        </p>
      )}
      {papers.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-500">The papers ({papers.length}{(r.requeue_ids?.length ?? 0) > 0 ? ` · ${r.requeue_ids!.length} go back in the queue` : ''})</summary>
          <ul className="mt-1 space-y-1">
            {papers.slice(0, 40).map((e, i) => (
              <li key={i} className="text-xs text-gray-600"><span className="font-medium text-gray-700">{e.paper}</span>{e.said ? ` — ${e.said}` : ''}</li>
            ))}
            {papers.length > 40 && <li className="text-xs text-gray-500">…and {papers.length - 40} more</li>}
          </ul>
        </details>
      )}
      {r.law_text && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-gray-500">The exact text the worker reads{r.law_section ? ` (${r.law_section})` : ''}</summary>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500">{r.law_text}</p>
        </details>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <span className="truncate font-mono text-xs text-gray-400">{r.slug}</span>
        <CopyButton text={changeRequest(r)} />
      </div>
    </li>
  );
}

function Section({ title, hint, rules, tone }: { title: string; hint: string; rules: ExtractionRule[]; tone?: 'plain' | 'waiting' }) {
  if (!rules.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-gray-900">{title} <span className="text-sm font-normal text-gray-500">({rules.length})</span></h2>
      <p className="text-sm text-gray-500">{hint}</p>
      <ul className="mt-3 space-y-3">{rules.map(r => <RuleCard key={r.slug} r={r} tone={tone} />)}</ul>
    </section>
  );
}

export default async function ExtractionRulesPage() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) redirect('/admin');
  const { data, error } = await getSupabaseAdmin().from('extraction_rules').select('*').order('added_at', { ascending: false });
  const g = groupRules((data ?? []) as ExtractionRule[]);

  return (
    <main className="mx-auto max-w-3xl bg-gray-50 px-4 pb-16 pt-6">
      <Link href="/admin" className="text-sm text-indigo-600">← Admin</Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">📜 Extraction rules</h1>
      <p className="mt-1 text-[15px] text-gray-700">Every rule the question-bank workers follow, in plain words.</p>
      <p className="text-[15px] text-gray-700">“Change this” copies a request — finish the sentence and give it to a session.</p>
      <p className="text-sm text-gray-500">New rules come from the daily extraction learner, which reads the workers’ own notes.</p>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not read the rules: {error.message}</p>}

      <Section title="Waiting for you" hint="Proposed rules. They change how papers are filed, so nothing happens until you say." rules={g.waiting} tone="waiting" />
      <Section title="How papers are filed" hint="Level, school, exam, which papers are skipped or split, whose answer key wins." rules={g.filing} />
      <Section title="What the worker does" hint="Checks and steps that help the worker do the job well. They change no filing." rules={g.worker} />

      {g.spellings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-gray-900">Known spellings of a school <span className="text-sm font-normal text-gray-500">({g.spellings.length})</span></h2>
          <p className="text-sm text-gray-500">The worker looks for a paper under every spelling before extracting it again. The name it stores never changes.</p>
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {g.spellings.map(r => (
              <li key={r.slug} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{r.title.replace(/^Spellings of one school:\s*/, '')}</p>
                  <p className="text-xs text-gray-500">{addedLine(r)}</p>
                </div>
                <CopyButton text={changeRequest(r)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {g.old.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-gray-600">Retired and dropped ({g.old.length})</summary>
          <ul className="mt-3 space-y-3">{g.old.map(r => <RuleCard key={r.slug} r={r} />)}</ul>
        </details>
      )}
    </main>
  );
}
