// The dashboard "Today stack": up to 4 personalised "start here" learn cards,
// in priority order. Each card names a topic that ALSO exists in the student's
// learning_units (so the /app/learn deep-link always lands on real content).
//
//   1. Lesson sync   — topics covered in the student's lessons (last 14 days)
//   2. Exam proximity— topics an upcoming exam (≤21 days) will test
//   3. Weakness      — practice topics with mastery < 50 and ≥1 attempt
//
// Every external call (Airtable, Supabase) degrades to no-op on failure — this
// feeds the dashboard and its route, both of which must never 500.
import { getSupabaseAdmin } from './supabase';
import { learnSubjectsForLevel } from './learn';
import { unresolvedFails } from './learn-review';
import { qbLevelsFor } from './practice';
import { airtableRequestAll } from './airtable';
import type { PortalAccount } from './portal-auth';

export type TodayCard = { topic: string; subject: string; reason: string; chip: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function todaySGT(): Date {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // SGT = UTC+8
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

export async function getTodayCards(account: PortalAccount): Promise<TodayCard[]> {
  const supabase = getSupabaseAdmin();
  const subjects = learnSubjectsForLevel(account.level);

  // Authoritative set of topics we can actually link to: approved learning_units
  // for the student's subjects. norm(topic) → the canonical topic + its subject.
  const learnByNorm = new Map<string, { topic: string; subject: string }>();
  try {
    const { data: units } = await supabase
      .from('learning_units')
      .select('subject, topic')
      .eq('status', 'approved')
      .in('subject', subjects);
    for (const u of (units || []) as { subject: string; topic: string }[]) {
      const key = norm(u.topic);
      if (key && !learnByNorm.has(key)) learnByNorm.set(key, { topic: u.topic, subject: u.subject });
    }
  } catch { /* no learn content → empty stack */ }

  if (learnByNorm.size === 0) return [];

  const cards: TodayCard[] = [];
  const used = new Set<string>(); // normalised topics already carded (first reason wins)

  const push = (rawTopic: string, reason: string, chip: string) => {
    if (cards.length >= 4) return;
    const key = norm(rawTopic);
    if (!key || used.has(key)) return;
    const hit = learnByNorm.get(key);
    if (!hit) return;
    used.add(key);
    cards.push({ topic: hit.topic, subject: hit.subject, reason, chip });
  };

  const today = todaySGT();
  const studentId = account.airtable_student_id;

  // 1. Lesson sync — topics from this student's lessons in the last 14 days,
  //    most-recent lesson first. Linked-record match done in JS (Airtable gotcha).
  if (cards.length < 4) {
    try {
      const from = iso(addDays(today, -14));
      const formula = encodeURIComponent(
        `AND({Date}>='${from}',{Status}!='Cancelled',{Status}!='Cancelled - Prorated')`,
      );
      const { records } = await airtableRequestAll(
        'Lessons',
        `?filterByFormula=${formula}&fields[]=Date&fields[]=Student&fields[]=Topics Covered&fields[]=Topics Free Text&sort[0][field]=Date&sort[0][direction]=desc`,
      );
      const mine = records.filter((r: any) => r.fields['Student']?.[0] === studentId);
      for (const r of mine) {
        if (cards.length >= 4) break;
        const f = r.fields;
        let topics: string[] = [];
        try { topics = JSON.parse((f['Topics Covered'] as string) || '[]'); } catch { /* noop */ }
        const free = ((f['Topics Free Text'] as string) || '')
          .split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const t of [...topics, ...free]) push(t, 'Covered in your lesson', '🎓 Covered in your lesson');
      }
    } catch { /* Airtable down → skip this reason */ }
  }

  // 2. Exam proximity — topics an upcoming exam (within 21 days) will test.
  if (cards.length < 4) {
    try {
      const horizon = iso(addDays(today, 22)); // exclusive upper bound (Airtable date gotcha)
      const todayStr = iso(today);
      const formula = encodeURIComponent(
        `AND({Exam Date}>='${todayStr}',{Exam Date}<'${horizon}',{No Exam}!=1)`,
      );
      const { records } = await airtableRequestAll(
        'Exams',
        `?filterByFormula=${formula}&fields[]=Student&fields[]=Exam Date&fields[]=Tested Topics&sort[0][field]=Exam Date&sort[0][direction]=asc`,
      );
      const mine = records.filter((r: any) => r.fields['Student']?.[0] === studentId);
      for (const r of mine) {
        if (cards.length >= 4) break;
        const tested = ((r.fields['Tested Topics'] as string) || '')
          .split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const t of tested) push(t, 'Your exam tests this', '🔥 Your exam tests this');
      }
    } catch { /* Airtable down → skip this reason */ }
  }

  // 3. Weakness — practice topics with mastery < 50 and ≥1 attempt (weakest first).
  //    Reuses the practice_overview mastery join, one call per scoped QB level.
  if (cards.length < 4) {
    try {
      const levels = qbLevelsFor(account.level, account.subjects);
      const weak: { topic: string; mastery: number }[] = [];
      for (const lvl of levels) {
        const { data, error } = await supabase.rpc('practice_overview', {
          p_user: account.id,
          p_level: lvl.key,
        });
        if (error) continue;
        for (const r of (data || []) as { topic: string; attempts: number; avg_mastery: number | null }[]) {
          const attempts = Number(r.attempts) || 0;
          const mastery = r.avg_mastery != null ? Number(r.avg_mastery) : null;
          if (attempts >= 1 && mastery != null && mastery < 50) weak.push({ topic: r.topic, mastery });
        }
      }
      weak.sort((a, b) => a.mastery - b.mastery);
      for (const w of weak) {
        if (cards.length >= 4) break;
        push(w.topic, 'Needs work', '🩹 Needs work');
      }
    } catch { /* Supabase issue → skip this reason */ }
  }

  // 4. Review time — the topic with the most unresolved learn-unit fails.
  //    Only if a card slot remains (lowest priority).
  if (cards.length < 4) {
    try {
      const fails = await unresolvedFails(supabase, account.id);
      const byTopic = new Map<string, number>();
      for (const f of fails) if (f.topic) byTopic.set(f.topic, (byTopic.get(f.topic) || 0) + 1);
      const ranked = [...byTopic.entries()].sort((a, b) => b[1] - a[1]);
      for (const [topic] of ranked) {
        if (cards.length >= 4) break;
        push(topic, 'Review time', '🔄 Review time');
      }
    } catch { /* no events yet → skip */ }
  }

  return cards.slice(0, 4);
}
