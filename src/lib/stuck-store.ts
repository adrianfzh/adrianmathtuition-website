// Loads the events the weekly stuck picture reads (lib/stuck-picture.ts).
// Server-only: Airtable (Students, Questions) + Supabase (ask_skills,
// subgroups, notebook_mistakes). Read-only. Every source is fail-soft to an
// empty list with a note, so one source down still gives a (smaller) picture
// and the route can say which source was missing.

import type { SupabaseClient } from '@supabase/supabase-js';
import { airtableRequestAll } from '@/lib/airtable';
import { A_MATH_EXAM_TOPICS, E_MATH_EXAM_TOPICS, JC_TOPICS } from '@/lib/canonical-topics';
import { isMath, isScience, parseAskTopic, subjectKey, type MathSubject, type StuckSubject } from '@/lib/stuck-topics';
import { BASELINE_WEEKS, WEEK_DAYS, type AskEvent, type LossEvent, type StuckStudent } from '@/lib/stuck-picture';

const DAY = 86_400_000;
const AM_SET = new Set(A_MATH_EXAM_TOPICS.flatMap((c) => c.topics));
const EM_SET = new Set(E_MATH_EXAM_TOPICS.flatMap((c) => c.topics));
const H2_SET = new Set(JC_TOPICS.flatMap((c) => c.topics));

export interface StuckInput {
  students: StuckStudent[];
  asks: AskEvent[];
  losses: LossEvent[];
  notes: string[];
}

/**
 * Adrian's own student record (he asks the bot and hands in papers to test them):
 * never a stuck student, never sent a sheet. Found in the first run, 5 Oct 2026.
 */
export function isOwnAccount(name: string): boolean {
  return /^adrian\s+fong$/i.test(name.trim());
}

/** Airtable `Subjects` (multi-select) → subject keys. 'Math' / 'IP Math' at Sec 1–2 are the E Math family. Maths only — the field has no sciences. */
export function studentSubjects(subjects: unknown, level: string | null): MathSubject[] {
  const out = new Set<MathSubject>();
  for (const s of Array.isArray(subjects) ? subjects : []) {
    const k = subjectKey(String(s));
    if (isMath(k)) out.add(k);
  }
  if (!out.size && level && /^JC/.test(level)) out.add('H2');
  return [...out];
}

/**
 * Which subject an unprefixed Airtable topic belongs to: the canonical list it
 * is in, narrowed by what the student takes. null = cannot tell (dropped and
 * counted, never guessed).
 */
export function askSubjectFor(topic: string, student: StuckStudent | undefined): StuckSubject | null {
  const takes = student?.subjects ?? [];
  const inList: StuckSubject[] = [];
  if (AM_SET.has(topic)) inList.push('AM');
  if (EM_SET.has(topic)) inList.push('EM');
  if (H2_SET.has(topic)) inList.push('H2');
  const both = inList.filter((s) => takes.includes(s));
  if (both.length === 1) return both[0];
  if (inList.length === 1) return inList[0];
  return null;
}

/** "Q11(a), Q20" → ["Q11(a)", "Q20"]; null → [""]. One lost question each. */
export function splitLabel(label: string | null | undefined): string[] {
  const parts = String(label ?? '').split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [''];
}

// the sciences since 5 Oct 2026 — a science paper's lost marks file here too
const MISTAKE_SUBJECTS = ['A Math', 'E Math', 'H2 Math', 'Physics', 'Chemistry', 'Biology'];

export async function loadStuckInput(sb: SupabaseClient, now: Date, windowDays = WEEK_DAYS): Promise<StuckInput> {
  const since = new Date(now.getTime() - (windowDays * (BASELINE_WEEKS + 1) + 1) * DAY).toISOString();
  const notes: string[] = [];

  // ── students ──
  let students: StuckStudent[] = [];
  try {
    const q = '?' + ['Student Name', 'Level', 'Subjects', 'Status'].map((f, i) => `fields%5B${i}%5D=${encodeURIComponent(f)}`).join('&');
    const { records } = await airtableRequestAll('Students', q);
    students = records.map((r: { id: string; fields: Record<string, unknown> }) => {
      const level = typeof r.fields['Level'] === 'string' ? (r.fields['Level'] as string) : null;
      const status = String(r.fields['Status'] ?? '');
      return {
        id: r.id,
        name: String(r.fields['Student Name'] ?? '').trim() || r.id,
        level,
        subjects: studentSubjects(r.fields['Subjects'], level),
        active: status === 'Active' || status === 'Trial',
      };
    }).filter((st: StuckStudent) => !isOwnAccount(st.name));
  } catch (e) {
    notes.push(`students: ${(e as Error).message.slice(0, 120)}`);
  }
  const byId = new Map(students.map((s) => [s.id, s]));

  // ── asks the bot filed under a sub-skill ──
  const asks: AskEvent[] = [];
  const filedQuestionIds = new Set<string>();
  try {
    const { data, error } = await sb
      .from('ask_skills')
      .select('question_airtable_id, airtable_student_id, subject, topic, skill, subgroup_id, bank, asked_at')
      .gte('asked_at', since)
      .not('airtable_student_id', 'is', null)
      .order('asked_at', { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    // ask_skills has no foreign key to subgroups, so the level is a second read.
    // A science row (bank='science', 5 Oct 2026) points into the SCIENCE
    // project's tree — its subject is on the row, never looked up here.
    const isMathRow = (r: Record<string, unknown>) => (r.bank ?? 'math') === 'math';
    const sgIds = [...new Set(rows.filter(isMathRow).map((r) => r.subgroup_id).filter((x): x is number => typeof x === 'number'))];
    const sgLevel = new Map<number, string>();
    if (sgIds.length) {
      const { data: sgs } = await sb.from('subgroups').select('id, level').in('id', sgIds);
      for (const g of (sgs ?? []) as Array<{ id: number; level: string }>) sgLevel.set(g.id, g.level);
    }
    for (const r of rows) {
      if (r.question_airtable_id) filedQuestionIds.add(String(r.question_airtable_id));
      const lv = isMathRow(r) && typeof r.subgroup_id === 'number' ? sgLevel.get(r.subgroup_id) : undefined;
      const subject = subjectKey(r.subject as string) ?? subjectKey(lv) ?? null;
      const topic = typeof r.topic === 'string' ? r.topic : '';
      if (!subject || !topic) continue;
      asks.push({
        studentId: String(r.airtable_student_id),
        at: String(r.asked_at),
        subject, topic,
        skill: (r.skill as string) || null,
        subgroupId: typeof r.subgroup_id === 'number' ? r.subgroup_id : null,
      });
    }
  } catch (e) {
    notes.push(`ask_skills: ${(e as Error).message.slice(0, 120)}`);
  }

  // ── asks the bot logged but did not file (topic only) ──
  try {
    // science rows carry "CHEM: Electrolysis" since 5 Oct 2026 (bot lib/ask-science-topic.js)
    const formula = `AND(IS_AFTER({Timestamp}, '${since}'), {Topic}!='', OR({Subject}='Math', {Subject}='Physics', {Subject}='Chemistry', {Subject}='Biology'))`;
    const q = `?filterByFormula=${encodeURIComponent(formula)}&` + ['Student', 'Topic', 'Timestamp', 'Subject'].map((f, i) => `fields%5B${i}%5D=${encodeURIComponent(f)}`).join('&');
    const { records } = await airtableRequestAll('Questions', q);
    let unsure = 0;
    for (const r of records as Array<{ id: string; fields: Record<string, unknown> }>) {
      if (filedQuestionIds.has(r.id)) continue;
      const sid = Array.isArray(r.fields['Student']) ? String((r.fields['Student'] as string[])[0] ?? '') : '';
      if (!sid || !byId.has(sid)) continue;
      const parsed = parseAskTopic(r.fields['Topic'] as string);
      if (!parsed) continue;
      const rowSubject = subjectKey(r.fields['Subject'] as string);
      const science = !!rowSubject && isScience(rowSubject);
      // a science row counts only with a science prefix of its own subject; a maths row never takes one
      if (science ? parsed.subject !== rowSubject : (parsed.subject && isScience(parsed.subject))) continue;
      const subject = parsed.subject ?? askSubjectFor(parsed.topic, byId.get(sid));
      if (!subject) { unsure++; continue; }
      asks.push({ studentId: sid, at: String(r.fields['Timestamp'] ?? ''), subject, topic: parsed.topic, skill: null, subgroupId: null });
    }
    if (unsure) notes.push(`${unsure} asks with a topic in more than one subject were left out`);
  } catch (e) {
    notes.push(`Questions: ${(e as Error).message.slice(0, 120)}`);
  }

  // ── marks lost (paper + practice), one event per lost question ──
  const losses: LossEvent[] = [];
  try {
    const PAGE = 1000;
    for (let from = 0; from < 20_000; from += PAGE) {
      const { data, error } = await sb
        .from('notebook_mistakes')
        .select('airtable_student_id, subject, topic, evidence')
        .in('subject', MISTAKE_SUBJECTS)
        .gte('last_seen_at', since)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as Array<{ airtable_student_id: string; subject: string; topic: string | null; evidence: unknown }>) {
        const subject = subjectKey(r.subject);
        if (!subject || !r.topic) continue;
        for (const ev of Array.isArray(r.evidence) ? r.evidence : []) {
          const e = ev as { kind?: string; ref?: string; label?: string | null; paper?: string | null; date?: string; clean?: boolean };
          if (e.clean !== false || !e.date || e.date < since) continue;
          for (const q of splitLabel(e.label)) {
            losses.push({
              studentId: r.airtable_student_id,
              at: e.date,
              subject,
              text: r.topic,
              // a re-mark of the same paper is the same lost question
              key: `${r.airtable_student_id}|${(e.paper || e.ref || '').toLowerCase()}|${q || r.topic}`,
            });
          }
        }
      }
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    notes.push(`notebook_mistakes: ${(e as Error).message.slice(0, 120)}`);
  }

  return { students, asks, losses, notes };
}
