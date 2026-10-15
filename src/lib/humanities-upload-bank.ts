// School questions students send through "Check my answer", kept for marking only (15 Oct 2026, Adrian: "yes" to
// "should we extract the questions uploaded for our own bank?"). Why: the same school question is marked the same
// way for every student who sends it — the type it was read as, and for a Geography short question the list of
// creditable points. What is kept: the question, its sources or figures, its marks and how it is marked. NO student
// details — no name, no answer, no photo, no link back to the run. Grounding only: never served to a student
// (docs/CONTENT-POLICY.md — a school's paper is the school's). Copied nightly by /api/cron/humanities-upload-bank;
// read at hand-in by /api/portal/humanities/own.
import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabase';
import { HUMANITIES_PREVIEW_IDENTITIES } from './portal-beta';
import type { OwnQuestion } from './humanities-own';

/** The same question however it was photographed: no number in front, no marks, no case, no spacing or punctuation. */
export function normaliseQuestion(text: string): string {
  return String(text ?? '').toLowerCase()
    .replace(/\[\s*\d{1,2}\s*(marks?|m)?\s*\]|\(\s*\d{1,2}\s*marks?\s*\)/g, ' ')
    .replace(/^\s*(q(uestion)?\s*)?\d{1,2}\s*[a-z]?[.)]?\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** One key per school question: its subject, its words, and the start of its sources (two papers can share a question line). */
export function questionFingerprint(subject: string, question: string, material: string): string {
  const src = normaliseQuestion(material).split(' ').slice(0, 40).join(' ');
  return createHash('sha256').update(`${subject}|${normaliseQuestion(question)}|${src}`).digest('hex').slice(0, 32);
}

export interface BankedQuestion { skill: string; marks: number | null; points: OwnQuestion['points'] | null; command: string | null; develop: boolean | null; rules: string[] | null }

/** The banked school question this upload is, if any. */
export async function findUploaded(subject: string, question: string, material: string): Promise<BankedQuestion | null> {
  const { data } = await getSupabaseAdmin().from('humanities_uploaded_questions')
    .select('skill, marks, points, command, develop, rules').eq('fingerprint', questionFingerprint(subject, question, material)).maybeSingle();
  return (data as BankedQuestion | null) ?? null;
}

/** Copy every marked upload not yet banked. → how many runs were looked at, and how many questions were new. */
export async function bankUploads(limit = 200): Promise<{ looked: number; added: number }> {
  const sb = getSupabaseAdmin();
  const { data: runs } = await sb.from('humanities_runs')
    .select('id, airtable_student_id, own_question, created_at')
    .not('own_question', 'is', null).is('banked_at', null).in('status', ['marked', 'held'])
    .order('created_at', { ascending: true }).limit(limit);
  let added = 0;
  for (const r of runs ?? []) {
    const o = r.own_question as OwnQuestion;
    // The demo and preview accounts' test questions stay out of the bank (SELFCHECK_INCLUDE_PREVIEW=1 for a test run).
    const preview = HUMANITIES_PREVIEW_IDENTITIES.includes(String(r.airtable_student_id)) && process.env.SELFCHECK_INCLUDE_PREVIEW !== '1';
    if (!preview && o?.question) {
      const fingerprint = questionFingerprint(o.subject, o.question, o.sources ?? '');
      const { data: have } = await sb.from('humanities_uploaded_questions').select('id, times_seen').eq('fingerprint', fingerprint).maybeSingle();
      if (have) {
        await sb.from('humanities_uploaded_questions').update({ times_seen: have.times_seen + 1, last_seen: r.created_at }).eq('id', have.id);
      } else {
        const { error } = await sb.from('humanities_uploaded_questions').insert({
          fingerprint, subject: o.subject, skill: o.skill, question: o.question, material: o.sources ?? '', marks: o.marks ?? null,
          points: o.points ?? null, command: o.command ?? null, develop: o.develop ?? null, rules: o.rules ?? null,
          first_seen: r.created_at, last_seen: r.created_at,
        });
        if (!error) added++;
      }
    }
    await sb.from('humanities_runs').update({ banked_at: new Date().toISOString() }).eq('id', r.id);
  }
  return { looked: runs?.length ?? 0, added };
}
