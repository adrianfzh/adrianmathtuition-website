// 📝 School exam tracker — the reads and writes (SPEC-EXAM-TRACKER.md). Server only.
// Pure parts live in lib/school-exam (tested). Two model calls per exam, both admin-only:
//   readSchoolExam  — the school's marks per part + topic + what went wrong (never re-marks)
//   writeExamReport — after Adrian checks the table: next lessons + the parent note draft
// Nothing here sends anything to anyone: Adrian copies the note and sends it himself.

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { getSupabaseAdmin } from './supabase';
import { fetchOurFile } from './student-files';
import { anthropicText } from './claude-models';
import { getExamTopicsForSubject } from './canonical-topics';
import { ERROR_KINDS } from './error-kinds';
import {
  lossByTopic, parseExamRead, parseReport, totals,
  type Comparison, type ExamPart, type ExamRead, type ExamReport, type TopicLoss,
} from './school-exam';

/** Reading handwriting marks and judging the working is judgement work → Opus. */
export const SCHOOL_EXAM_MODEL = process.env.SCHOOL_EXAM_MODEL || 'claude-opus-5-5';

export type ScanStatus = 'reading' | 'check' | 'done' | 'failed';
export type ScanReport = {
  loss_by_topic: TopicLoss[];
  comparison: Comparison | null;
  prev_id: string | null;
  prev_label: string | null;
} & Partial<ExamReport>;

export type ScanRow = {
  id: string; student_id: string; airtable_exam_id: string | null; exam_type: string;
  subject: string | null; exam_date: string | null; files: string[]; status: ScanStatus;
  error: string | null; read: ExamRead | null; total_got: number | null; total_max: number | null;
  report: ScanReport | null; created_at: string; checked_at: string | null;
};

const T = 'school_exam_scans';
const db = () => getSupabaseAdmin();

export async function listScans(studentId: string): Promise<ScanRow[]> {
  const { data, error } = await db().from(T).select('*').eq('student_id', studentId)
    .order('exam_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ScanRow[];
}

export async function getScan(id: string): Promise<ScanRow | null> {
  const { data, error } = await db().from(T).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScanRow) ?? null;
}

export async function insertScan(row: Pick<ScanRow, 'student_id' | 'airtable_exam_id' | 'exam_type' | 'subject' | 'exam_date' | 'files'>): Promise<ScanRow> {
  const { data, error } = await db().from(T).insert({ ...row, status: 'reading' }).select('*').single();
  if (error) throw new Error(error.message);
  return data as ScanRow;
}

export async function updateScan(id: string, patch: Partial<ScanRow>): Promise<ScanRow> {
  const { data, error } = await db().from(T).update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as ScanRow;
}

export async function deleteScan(id: string): Promise<void> {
  const { error } = await db().from(T).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** The topic list the reader must choose from, for the student's level and this paper's subject. */
export function topicsFor(level: string, subject: string | null): string[] {
  return [...new Set(getExamTopicsForSubject(level || '', subject || '').flatMap(c => c.topics))];
}

// ── the read ─────────────────────────────────────────────────────────────────

/** Pages as model content: photos shrunk to a readable size, a PDF sent whole. */
async function pagesContent(files: readonly string[]): Promise<Anthropic.ContentBlockParam[]> {
  const out: Anthropic.ContentBlockParam[] = [];
  for (const url of files) {
    const res = await fetchOurFile(url).catch(() => null);
    if (!res || !res.ok) throw new Error('a page could not be opened');
    const buf = Buffer.from(await res.arrayBuffer());
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
      out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } });
      continue;
    }
    const jpg = await sharp(buf).rotate().resize({ width: 1700, height: 1700, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    out.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpg.toString('base64') } });
  }
  return out;
}

function readPrompt(topics: readonly string[], subject: string | null, level: string): string {
  return `These are the pages of a student's school maths exam (${[level, subject].filter(Boolean).join(', ')}). The SCHOOL HAS ALREADY MARKED IT in pen: ticks, crosses, marks written beside each part, and usually a total.

Your job is to READ the school's marks — never mark the paper yourself, never change a mark you disagree with.

For EVERY question part on the paper (including parts with full marks):
- "q": the question number as printed ("7"), "part": the part label as printed ("a", "b(ii)") or "" when the question has no parts.
- "max": the marks the part is worth (printed in brackets, e.g. [3]).
- "got": the marks the school gave, as written in the margin. If only ticks are shown and no number, count the ticks. If you cannot read it with confidence, give your best read and set "unsure": true.
- "topic": exactly one from this list: ${topics.join(' | ')}. If none fits, "Other".
- When got < max only: "why" — ONE plain line (max 15 words) on what went wrong, from the student's own working, in words a parent understands (e.g. "used the wrong ratio for the point dividing AB"; "did not attempt"); and "error_kind" — one of ${ERROR_KINDS.join(', ')}.

Also give "written_total": the total the school wrote on the paper {"got": n, "max": n}, null fields if none is written.

Answer with ONE JSON object and nothing else:
{"parts":[{"q":"1","part":"a","max":3,"got":2,"topic":"…","why":"…","error_kind":"…","unsure":false}, …],"written_total":{"got":52,"max":80}}`;
}

export async function readSchoolExam(files: readonly string[], level: string, subject: string | null, client = new Anthropic()): Promise<ExamRead> {
  const topics = topicsFor(level, subject);
  const content = await pagesContent(files);
  content.push({ type: 'text', text: readPrompt(topics, subject, level) });
  const res = await client.messages.create({ model: SCHOOL_EXAM_MODEL, max_tokens: 16000, messages: [{ role: 'user', content }] });
  const read = parseExamRead(anthropicText(res), topics);
  if (!read) throw new Error('the marks could not be read from these pages');
  return read;
}

/** Read one scan and store the result for Adrian's check. Never throws: a failure is stored on the row. */
export async function runRead(id: string, level: string): Promise<void> {
  const row = await getScan(id);
  if (!row) return;
  try {
    const read = await readSchoolExam(row.files, level, row.subject);
    const t = totals(read.parts);
    await updateScan(id, { status: 'check', read, total_got: t.got, total_max: t.max, error: null });
  } catch (e) {
    await updateScan(id, { status: 'failed', error: String((e as Error).message || e).slice(0, 300) }).catch(() => {});
  }
}

// ── the report ───────────────────────────────────────────────────────────────

/** The last checked exam in the same subject before this one (by exam date, else by upload time). */
export async function previousScan(row: ScanRow): Promise<ScanRow | null> {
  const all = await listScans(row.student_id);
  const key = (r: ScanRow) => `${r.exam_date || ''}|${r.created_at}`;
  const prev = all
    .filter(r => r.id !== row.id && r.status === 'done' && (r.subject || '') === (row.subject || '') && r.read?.parts?.length)
    .filter(r => key(r) < key(row))
    .sort((a, b) => (key(a) < key(b) ? 1 : -1));
  return prev[0] ?? null;
}

export async function writeExamReport(o: {
  firstName: string; label: string; parts: readonly ExamPart[]; comparison: Comparison | null; prevLabel: string | null;
}, client = new Anthropic()): Promise<ExamReport | null> {
  const t = totals(o.parts);
  const losses = lossByTopic(o.parts).filter(x => x.lost > 0)
    .map(x => `${x.topic}: lost ${x.lost} of ${x.max}`).join('\n');
  const whys = o.parts.filter(p => p.got < p.max && p.why).map(p => `Q${p.q}${p.part ? `(${p.part})` : ''} ${p.topic}: ${p.why}`).join('\n');
  const cmp = o.comparison && o.prevLabel
    ? `Compared with ${o.prevLabel}: change ${o.comparison.change ?? '?'} percentage points.
Better: ${o.comparison.better.map(b => `${b.topic} (lost ${b.before} → ${b.now})`).join(', ') || 'none'}
Still weak: ${o.comparison.stillWeak.map(b => `${b.topic} (lost ${b.before} → ${b.now})`).join(', ') || 'none'}
New: ${o.comparison.newWeak.map(b => `${b.topic} (lost ${b.now})`).join(', ') || 'none'}`
    : 'This is the first exam on record, so there is nothing to compare with yet.';
  const prompt = `You help a Singapore maths tutor after a student's school exam. Exam: ${o.label}. Student: ${o.firstName}. Score ${t.got}/${t.max}.

Marks lost by topic:
${losses || 'none'}

What went wrong, per part:
${whys || 'nothing'}

${cmp}

Write:
1. "next_steps": at most THREE lines for the tutor's next lessons, biggest gain first. Each {"topic": "...", "action": "..."}; the action is one short plain sentence naming the exact skill and what to do (e.g. "Ratio theorem: two worked examples, then four practice questions"). Careless slips get one line about checking, not a topic re-teach.
2. "parent_note": a short WhatsApp message from the tutor to the parent, 3–5 sentences, warm and plain. Say the score (and the change since last time if there is one), what went well, what we are working on next, and that we'll update them after the next exam. Start "Hi," (the tutor adds the name). First person as the tutor. Never write he/she/his/her for the student — you do not know which is right; use the name again or "they". No bullet points, no marks codes, no mention of apps, tools, computers, scans or AI. At most one emoji. Never invent a fact not given above.

Answer with ONE JSON object and nothing else: {"next_steps":[{"topic":"…","action":"…"}],"parent_note":"…"}`;
  const res = await client.messages.create({ model: SCHOOL_EXAM_MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] });
  return parseReport(anthropicText(res));
}
