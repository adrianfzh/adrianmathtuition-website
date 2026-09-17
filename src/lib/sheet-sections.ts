// The section bank — pure half (17 Sep 2026, Adrian: "yes, we can just let the
// bank accumulate, instead of writing everything from scratch … go, build the
// bank"). One row per TAUGHT section of a filed Practice Again sheet, keyed by
// the missed step (title + gap), so the next sheet on the same missed step
// reuses the vetted section instead of authoring it again. Nothing is curated
// up front: the bank is every section ever written, with Adrian's Word edits
// living in the docx the row points at, a vetted stamp and a retire switch.
//
// Filed by /api/admin/sheet-jobs {action:'done'} (lib/sheet-sections-store.ts),
// searched by GET /api/admin/sheet-sections?q=<missed step>, vetted / retired by
// PATCH there. SPEC-SECTION-BANK.md is the spec.
import type { DiagnosisSkill } from './sheet-diagnosis';

export type SectionRow = {
  job_id: string;
  run_id: string | null;
  student_name: string | null;
  paper_name: string | null;
  subject: string | null;
  level: string | null;
  section_index: number;
  title: string;
  gap: string | null;
  questions: string[];
  marks: number | null;
  tier: string;
  why: string | null;
  docx_path: string | null;
  pdf_path: string | null;
  practice_question_ids: string[];
  authored_practice: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The level a sheet teaches at, read off the paper's typed name. AM before EM
 *  because "a math" / "amath" carry the letter; H2/H1 for JC; null when unsure
 *  (a caller may pass the run's own level instead). */
export function levelFromPaperName(name: string | null | undefined): 'AM' | 'EM' | 'H2' | 'H1' | null {
  const s = String(name || '').toLowerCase();
  if (/\b(h2|jc2?|j2)\b/.test(s)) return 'H2';
  if (/\bh1\b/.test(s)) return 'H1';
  if (/\b(am|amath|a\s*math|additional\s*math(ematics)?)\b/.test(s)) return 'AM';
  if (/\b(em|emath|e\s*math|elementary\s*math(ematics)?|mathematics)\b/.test(s)) return 'EM';
  return null;
}

export type CompletionForBank = {
  jobId: string;
  runId: string | null;
  studentName?: string | null;
  paperName?: string | null;
  subject?: string | null;
  level?: string | null;
  /** The sheet's diagnosis skills in SHEET order (lib/sheet-diagnosis.ts). */
  skills: DiagnosisSkill[];
  /** The worker's completion payload (docx_path, pdf_path, questions[]). */
  result: { docx_path?: string | null; pdf_path?: string | null; questions?: unknown } | null | undefined;
};

/** The practice items of the completion grouped by their 1-based section
 *  number: bank question ids, and how many were authored (no questionId). */
function practiceBySection(questions: unknown): Map<number, { ids: string[]; authored: number }> {
  const out = new Map<number, { ids: string[]; authored: number }>();
  if (!Array.isArray(questions)) return out;
  for (const q of questions as Array<Record<string, unknown>>) {
    if (!q || typeof q !== 'object') continue;
    const sec = Number.parseInt(String(q.section ?? ''), 10);
    if (!Number.isFinite(sec) || sec < 1) continue;
    const slot = out.get(sec) ?? { ids: [], authored: 0 };
    const id = typeof q.questionId === 'string' ? q.questionId : typeof q.question_id === 'string' ? q.question_id : null;
    if (id && UUID_RE.test(id)) { if (!slot.ids.includes(id)) slot.ids.push(id); }
    else slot.authored += 1;
    out.set(sec, slot);
  }
  return out;
}

/** The rows a finished sheet files into the bank: one per TAUGHT skill (tier
 *  'teach' — the ② "show" lines and the optional tail have no worked example to
 *  reuse), numbered the way the sheet numbers its Practice sets, so the
 *  completion's `questions[].section` lines up with `section_index`. A skill with
 *  no title files nothing; nothing here throws on a malformed payload. */
export function sectionsFromCompletion(c: CompletionForBank): SectionRow[] {
  const practice = practiceBySection(c.result?.questions);
  const level = c.level || levelFromPaperName(c.paperName);
  const rows: SectionRow[] = [];
  let index = 0;
  for (const s of Array.isArray(c.skills) ? c.skills : []) {
    if (!s || s.tier !== 'teach') continue;
    const title = String(s.title || '').trim();
    if (!title) continue;
    index += 1;
    const p = practice.get(index) ?? { ids: [], authored: 0 };
    rows.push({
      job_id: c.jobId,
      run_id: c.runId,
      student_name: c.studentName ?? null,
      paper_name: c.paperName ?? null,
      subject: c.subject ?? null,
      level,
      section_index: index,
      title: title.slice(0, 200),
      gap: s.gap ? String(s.gap).trim().slice(0, 300) || null : null,
      questions: Array.isArray(s.questions) ? s.questions.map(q => String(q)).slice(0, 12) : [],
      marks: Number.isFinite(s.marks) ? Number(s.marks) : null,
      tier: s.tier,
      why: s.why ? String(s.why).trim().slice(0, 600) || null : null,
      docx_path: c.result?.docx_path ?? null,
      pdf_path: c.result?.pdf_path ?? null,
      practice_question_ids: p.ids,
      authored_practice: p.authored,
    });
  }
  return rows;
}

/** The words a worker searches the bank with: the missed step, not the topic.
 *  Strips TeX and punctuation so "Choosing Between Angle At The Centre …" and
 *  "uses same-segment theorem when one angle is at the centre" meet on their
 *  content words. Returns '' when nothing survives. */
export function searchTerms(...parts: Array<string | null | undefined>): string {
  const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'at', 'for', 'with', 'is', 'are', 'when', 'before', 'after', 'into', 'from', 'by', 'not', 'it', 'its', 'as', 'that', 'this', 'than', 'then', 'how', 'what', 'which', 'your', 'you', 'their', 'they', 'she', 'he', 'her', 'his', 'question', 'asks', 'asked']);
  const words = parts
    .map(p => String(p || '').replace(/\$[^$]*\$/g, ' ').replace(/\\[a-zA-Z]+/g, ' ').toLowerCase())
    .join(' ')
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, 12).join(' ');
}

export type BankHit = {
  id: string;
  title: string;
  gap: string | null;
  level: string | null;
  subject: string | null;
  student_name: string | null;
  paper_name: string | null;
  questions: string[];
  docx_path: string | null;
  section_index: number;
  created_at: string;
  last_vetted_at: string | null;
  practice_question_ids: string[];
  rank?: number;
};

/** One line per hit for the worker's eyes (and the Telegram "reused" line). */
export function describeHit(h: BankHit): string {
  const who = h.student_name ? `${h.student_name}'s` : 'a';
  const when = h.created_at ? h.created_at.slice(0, 10) : '';
  const vet = h.last_vetted_at ? ' · vetted' : '';
  return `${h.title}${h.gap ? ` — gap: ${h.gap}` : ''} (${who} ${h.paper_name || 'sheet'} ${when}, Practice ${h.section_index}${vet})`;
}
