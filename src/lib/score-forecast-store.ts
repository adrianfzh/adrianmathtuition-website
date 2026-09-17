// The score forecast's data (17 Sep 2026): the real GCE papers from the bank
// and a student's marked papers as topic-tagged questions. Server only.
// Pure arithmetic lives in ./score-forecast.
import { getSupabaseAdmin } from './supabase';
import { canonicalTopic, type Level, type ProfilePaper, type TargetPaper } from './score-forecast';

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const qnInt = (s: unknown) => { const m = String(s ?? '').match(/\d+/); return m ? Number(m[0]) : null; };

/** Every GCE paper in the bank for the level (one row per question, exam_type 'GCE' only — the specimen shares the key). */
export async function loadGcePapers(level: Level, years?: number[]): Promise<Map<string, TargetPaper>> {
  const sb = getSupabaseAdmin();
  let q = sb.from('questions').select('year, paper, question_number, topics, total_marks')
    .eq('school', 'GCE').eq('exam_type', 'GCE').eq('level', level).is('deleted_at', null);
  if (years?.length) q = q.in('year', years);
  const { data } = await q.limit(2000);
  const out = new Map<string, TargetPaper>();
  for (const r of (data ?? []) as { year: number; paper: string; question_number: string; topics: string[] | null; total_marks: number | null }[]) {
    const key = `gce ${r.year} ${level.toLowerCase()} p${r.paper}`;
    const t = out.get(key) ?? { key, label: `GCE ${r.year} · Paper ${r.paper}`, total: 0, questions: [] };
    const marks = Number(r.total_marks) || 0;
    t.questions.push({ number: String(r.question_number), topics: (r.topics ?? []).filter(Boolean), marks });
    t.total += marks;
    out.set(key, t);
  }
  return out;
}

export interface StudentTopicPaper extends ProfilePaper {
  name: string;
  gceKey: string | null;
  actual: number | null;
  total: number | null;
}

/** A student's released maths papers for one level, each question tagged with canonical topics. */
export async function loadStudentTopicPapers(sid: string, level: Level, gce: ReadonlyMap<string, TargetPaper>): Promise<StudentTopicPaper[]> {
  const sb = getSupabaseAdmin();
  const subject = level === 'AM' ? 'A Math' : 'E Math';
  const { data } = await sb.from('paper_marking_runs').select('id, created_at, paper_name, total_awarded, total_max, result_json')
    .eq('student_id', sid).eq('paper_subject', subject).not('released_at', 'is', null).is('superseded_by', null)
    .order('created_at', { ascending: false }).limit(40);
  const out: StudentTopicPaper[] = [];
  for (const row of (data ?? []) as { id: string; created_at: string; paper_name: string | null; total_awarded: number | null; total_max: number | null; result_json: unknown }[]) {
    if (/^practice again/i.test(row.paper_name ?? '')) continue;   // a returned sheet is not a paper
    const rj = asRecord(row.result_json) ?? {};
    const parsed = asRecord(asRecord(rj.paper_match)?.parsed);
    const isGce = parsed?.exam === 'GCE' && parsed.level === level && parsed.year && parsed.paper;
    const gceKey = isGce ? `gce ${parsed!.year} ${level.toLowerCase()} p${parsed!.paper}` : null;
    const bank = gceKey ? gce.get(gceKey) : undefined;
    const bankByQn = new Map<number, string[]>();
    if (bank) for (const q of bank.questions) { const n = qnInt(q.number); if (n != null) bankByQn.set(n, [...(bankByQn.get(n) ?? []), ...q.topics]); }
    const questions: ProfilePaper['questions'] = [];
    for (const raw of (Array.isArray(rj.results) ? rj.results : [])) {
      const r = asRecord(raw); const marking = asRecord(r?.marking); if (!r || !marking) continue;
      const max = Number(marking.total_max) || 0; const awarded = Number(marking.total_awarded) || 0;
      if (!(max > 0)) continue;
      const n = qnInt(r.question_number);
      let topics = n != null && bankByQn.has(n) ? [...new Set(bankByQn.get(n))] : [];
      if (!topics.length) {
        const detected = asRecord(asRecord(r.marking_output)?.meta)?.topic_detected;
        const c = canonicalTopic(typeof detected === 'string' ? detected : null, level);
        if (c) topics = [c];
      }
      let careless = 0;
      for (const p of (Array.isArray(marking.parts) ? marking.parts : [])) {
        const pr = asRecord(p); if (!pr) continue;
        if (/careless|arithmetic|slip/i.test(String(pr.error_kind ?? ''))) careless += Math.max(0, (Number(pr.max) || 0) - (Number(pr.awarded) || 0));
      }
      questions.push({ topics, awarded, max, carelessLost: careless });
    }
    out.push({ id: row.id, date: String(row.created_at).slice(0, 10), name: row.paper_name ?? '', questions, gceKey, actual: row.total_awarded, total: row.total_max });
  }
  return out;
}
