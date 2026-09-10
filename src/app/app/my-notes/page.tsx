// /app/my-notes — "My Notebook": the student's one personal tab (Adrian,
// 2026-08-28: "yes do My Plan → My Notebook"), and since 11 Sep 2026 ONE STREAM
// (SPEC-NOTEBOOK-V2 §9, Adrian: "build this"): a search box, filter chips, then
// every item newest first with an icon for what it is — nothing is filed by
// hand, you scroll or search. What lands in the stream:
//
//   • Your mistakes — the living list of mistake patterns (SPEC-PORTAL-V2 §6,
//     notebook_mistakes via lib/notebook-mistakes-store): born from released
//     papers and graded practice, fading as clean results arrive — Still
//     happening, Getting better, Fixed. "Corrected" (mistake-actions.tsx) lets
//     the student mark one fixed; evidence can bring it back. Each links to the
//     Practice items that fix it when the hand-back named any.
//   • 💾 Saved answers (SPEC-NOTEBOOK-V2 §1, opt-in) — from the Ask tab, filed
//     under topic + skill, title the student's own; rename / delete inline.
//   • 📷 Photos and ✂️ clippings (portal_notes; lightbox in my-notes-gallery.tsx,
//     ➕ Add a photo beside the search box; photos are read for topic + skill +
//     searchable text, lib/photo-tag.ts).
//   • 📖 Pages from Adrian (SPEC-NOTEBOOK-V2 §12) — open their own route.
//   • 💬 Keeps coming up (opt-in — Settings → "Show skills I keep asking about"):
//     the bank sub-skills the student keeps asking the app about (lib/ask-signal).
//   (Questions to retry — DROPPED 10 Sep 2026: nobody ever attempted one.
//   notebook_entries rows still accrue at release for export/retention.)
//
// The items are built here (lib/notebook-stream.ts, pure/tested) and filtered
// on the client (stream.tsx). ?open=<item id> lands with that item open — the
// Home resurface card's door (lib/resurface.ts).
//
// /app/plan redirects here. Server component: reads with the service key
// scoped to the logged-in student's portal identity (rec… / acct:<uuid>,
// lib/portal-auth.portalIdentity) — the tables have RLS with no policies, so
// this filter IS the access control (the /app/marking pattern).
//
// Deliberately NOT behind requireFullPortal(): everything here derives from
// marked papers (in the marking-only beta allowlist) or is the student's own —
// an allowed page simply never calls the gate (lib/portal-beta.ts).
import Link from 'next/link';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createServiceClient } from '@/lib/supabase-server';
import { loadMistakes, type MistakeRow } from '@/lib/notebook-mistakes-store';
import { displayOrder } from '@/lib/notebook-mistakes';
import { askSignalOn, type AskSignalLine } from '@/lib/ask-signal';
import { loadAskSignal } from '@/lib/ask-signal-store';
import { listStudentAssignments } from '@/lib/portal-assignments';
import { isPage } from '@/lib/assignments';
import { loadSaves } from '@/lib/notebook-saves-store';
import type { SaveRow } from '@/lib/notebook-saves';
import { buildStreamItems } from '@/lib/notebook-stream';
import { MAX_NOTES_PER_STUDENT, type MyNoteRow, type TopicOptionGroup } from '@/lib/portal-notes';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import { qbLevelsFor } from '@/lib/qb-levels';
import NotebookStream from './stream';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function MyNotebookPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  // The plan-page pattern: Adrian's admin cookie may browse /app/* without a
  // student session, but a notebook belongs to a student — show the pointer
  // card. sessionAccount() is per-request cached (lib/portal-auth.ts).
  const account = await sessionAccount();
  const sid: string | null = account ? portalIdentity(account) : null;

  if (!sid) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">My Notebook</h1>
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            My Notebook is built from a student&apos;s own marked papers and clippings.{' '}
            <Link href="/login" className="font-semibold text-navy underline">Log in as a student</Link> to see one.
          </p>
        </div>
      </div>
    );
  }

  // Every source is independent — one parallel batch. All fail soft: a load
  // error drops its items, never the page.
  const svc = createServiceClient();
  const [notes, mistakes, askLines, pages, saves] = await Promise.all([
    getSupabaseAdmin()
      .from('portal_notes')
      .select('id, run_id, source_label, topic, image_url, note, created_at, auto_topic, auto_skill, ocr_text')
      .eq('airtable_student_id', sid)
      .order('created_at', { ascending: false })
      .limit(MAX_NOTES_PER_STUDENT)
      .then(r => (r.data ?? []) as MyNoteRow[], () => [] as MyNoteRow[]),
    // The read applies the 14-day "Corrected" → Fixed sweep on the way out.
    loadMistakes(svc, sid).catch((): MistakeRow[] => []),
    askSignalOn(account?.prefs) ? loadAskSignal(svc, sid) : Promise.resolve([] as AskSignalLine[]),
    listStudentAssignments(sid, account).then(rows => rows.filter(isPage), () => []),
    loadSaves(svc, sid).catch((): SaveRow[] => []),
  ]);

  // Mistakes in display order (placeholders with no evidence yet are left out
  // by displayOrder), and the Practice items that fix them — one scoped query.
  const bands = displayOrder(mistakes);
  const ordered = [...bands.stillHappening, ...bands.gettingBetter, ...bands.fixed];
  const practiceById = new Map<string, { id: string; title: string }>();
  const linkedIds = [...new Set(ordered.flatMap(m => m.practice_ids))];
  if (linkedIds.length) {
    try {
      const { data } = await svc.from('portal_assignments').select('id, title, status')
        .eq('airtable_student_id', sid).in('id', linkedIds.slice(0, 200));
      for (const a of data ?? []) {
        if (a.status === 'assigned' || a.status === 'submitted' || a.status === 'marked') {
          practiceById.set(String(a.id), { id: String(a.id), title: String(a.title || 'Practice') });
        }
      }
    } catch { /* the stream still renders without its practice links */ }
  }
  const practiceFor = (m: MistakeRow) =>
    m.practice_ids.map(id => practiceById.get(id)).filter((p): p is { id: string; title: string } => !!p);

  const items = buildStreamItems({ mistakes: ordered, practiceFor, saves, notes, pages, skills: askLines });

  // Topic options for the ➕ Add-a-photo tagger: the canonical list for the
  // student's level(s), merged by category label and deduped. Optional in the UI.
  const seenTopics = new Set<string>();
  const topicGroups: TopicOptionGroup[] = [];
  for (const { key } of qbLevelsFor(account?.level ?? null, account?.subjects ?? null)) {
    for (const cat of getTopicsForPaperLevel(key)) {
      const fresh = cat.topics.filter(t => !seenTopics.has(t));
      if (fresh.length === 0) continue;
      fresh.forEach(t => seenTopics.add(t));
      const existing = topicGroups.find(g => g.label === cat.label);
      if (existing) existing.topics.push(...fresh);
      else topicGroups.push({ label: cat.label, topics: fresh });
    }
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My Notebook</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Everything lands here by itself — your mistakes as they fade, answers you saved, your photos, pages from Adrian. Scroll, or search.
        </p>
      </div>
      <NotebookStream items={items} topicGroups={topicGroups} openId={typeof open === 'string' && open ? open : null} />
    </div>
  );
}
