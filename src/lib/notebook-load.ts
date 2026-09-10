// The Notebook's one loader (server only): everything the stream shows, for
// the logged-in student — used by /app/my-notes, Before the paper
// (/app/my-notes/before/[examId]) and the formula sheet (/app/my-notes/formulas)
// so the three pages agree on what is in the book.
//
// Every source is independent — one parallel batch. All fail soft: a load
// error drops its items, never the page. Reads go through the service client
// scoped to the student's portal identity (rec… / acct:<uuid>) — the tables
// have RLS with no policies, so this filter IS the access control.
import { getSupabaseAdmin } from './supabase';
import { createServiceClient } from './supabase-server';
import type { PortalAccount } from './portal-auth';
import { loadMistakes, type MistakeRow } from './notebook-mistakes-store';
import { displayOrder } from './notebook-mistakes';
import { askSignalOn, type AskSignalLine } from './ask-signal';
import { loadAskSignal } from './ask-signal-store';
import { listStudentAssignments } from './portal-assignments';
import { isPage } from './assignments';
import { loadSaves } from './notebook-saves-store';
import type { SaveRow } from './notebook-saves';
import { buildStreamItems, type StreamItem } from './notebook-stream';
import { MAX_NOTES_PER_STUDENT, type MyNoteRow, type TopicOptionGroup } from './portal-notes';
import { MAX_PRIVATE_NOTES, PRIVATE_NOTE_COLUMNS, type PrivateNoteRow } from './notebook-private-notes';
import { getDashboardData } from './portal-dashboard';
import type { UpcomingExam } from './portal-exams';
import { getTopicsForPaperLevel } from './canonical-topics';
import { qbLevelsFor } from './qb-levels';

export interface NotebookLoad {
  items: StreamItem[];
  /** The student's upcoming exams (Airtable Exams, ≤ 120 days) — Before the paper's source. */
  exams: UpcomingExam[];
  /** Canonical topic options for the ➕ Add-a-photo tagger, by category. */
  topicGroups: TopicOptionGroup[];
  /** The student's practice level keys ('AM', 'EM', 'JC2', …). */
  levelKeys: string[];
}

export async function loadNotebook(account: PortalAccount, sid: string): Promise<NotebookLoad> {
  const svc = createServiceClient();
  const [notes, mistakes, askLines, pages, saves, privateNotes, exams] = await Promise.all([
    getSupabaseAdmin()
      .from('portal_notes')
      .select('id, run_id, source_label, topic, image_url, note, created_at, auto_topic, auto_skill, ocr_text')
      .eq('airtable_student_id', sid)
      .order('created_at', { ascending: false })
      .limit(MAX_NOTES_PER_STUDENT)
      .then(r => (r.data ?? []) as MyNoteRow[], () => [] as MyNoteRow[]),
    // The read applies the 14-day "Corrected" → Fixed sweep on the way out.
    loadMistakes(svc, sid).catch((): MistakeRow[] => []),
    askSignalOn(account.prefs) ? loadAskSignal(svc, sid) : Promise.resolve([] as AskSignalLine[]),
    listStudentAssignments(sid, account).then(rows => rows.filter(isPage), () => []),
    loadSaves(svc, sid).catch((): SaveRow[] => []),
    // §8 private notes: this loader and the private-notes route are the only readers.
    svc.from('notebook_private_notes').select(PRIVATE_NOTE_COLUMNS)
      .eq('airtable_student_id', sid).order('created_at', { ascending: false }).limit(MAX_PRIVATE_NOTES)
      .then(r => (r.data ?? []) as PrivateNoteRow[], () => [] as PrivateNoteRow[]),
    // Exams ride Home's own Airtable batch (60 s cache per student, lib/portal-dashboard).
    getDashboardData(account).then(d => d.upcomingExams, () => [] as UpcomingExam[]),
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

  const items = buildStreamItems({ mistakes: ordered, practiceFor, saves, notes, pages, skills: askLines, privateNotes });

  // Topic options for the ➕ Add-a-photo tagger: the canonical list for the
  // student's level(s), merged by category label and deduped. Optional in the UI.
  const levels = qbLevelsFor(account.level ?? null, account.subjects ?? null);
  const seenTopics = new Set<string>();
  const topicGroups: TopicOptionGroup[] = [];
  for (const { key } of levels) {
    for (const cat of getTopicsForPaperLevel(key)) {
      const fresh = cat.topics.filter(t => !seenTopics.has(t));
      if (fresh.length === 0) continue;
      fresh.forEach(t => seenTopics.add(t));
      const existing = topicGroups.find(g => g.label === cat.label);
      if (existing) existing.topics.push(...fresh);
      else topicGroups.push({ label: cat.label, topics: fresh });
    }
  }

  return { items, exams, topicGroups, levelKeys: levels.map(l => l.key) };
}
