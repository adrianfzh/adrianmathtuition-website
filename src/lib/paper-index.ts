// The extracted-papers index (5 Oct 2026, Adrian: "organize pdfs that were
// extracted so we know what's being extracted at a glance … so we know what's
// extracted and what's not - keep a list or an index?").
//
// Pure, tested (paper-index.test.ts). Three inputs, one list of PAPERS:
//   • `paper_library` rows of kind 'source' — every file through the Extraction
//     Inbox, with its queue status (queued / claimed / done / skipped / flagged /
//     held / failed) and the workers' notes;
//   • `paper_library` rows of kind questions / solutions / combined — the
//     marker's library (older maths papers, files kept in the bucket);
//   • the banks, one row per paper (`library_bank_papers()` in the maths and the
//     science projects; humanities rides with maths).
// A paper the bank holds that never came through the inbox is listed too, as
// "Banked (older)", so the index is complete. Read by /admin/library and by
// scripts/library-index.ts (the same list for sessions and agents).

export type Family = 'maths' | 'science' | 'humanities';

export interface SourceRow {
  id: string;
  kind: string;
  status: string | null;
  storage_path: string | null;
  source_file: string | null;
  level: string | null;
  year: number | null;
  paper: string | null;
  school: string | null;
  exam_type: string | null;
  subject: string | null;
  notes: string | null;
  size_bytes: number | null;
  finished_at?: string | null;
}

export interface BankPaper {
  subject: string | null;
  level: string | null;
  school: string | null;
  year: number | null;
  exam_type: string | null;
  paper: string | null;
  n: number;
  n_scheme: number;
  n_from_answers: number;
  n_worked: number;
  n_none: number;
  figures_missing: number;
  last_added?: string | null;
}

export type StatusCode = 'banked' | 'older' | 'queue' | 'working' | 'decision' | 'hold' | 'skipped';

export const STATUS_LABEL: Record<StatusCode, string> = {
  banked: 'Banked',
  older: 'Banked (older)',
  queue: 'In the queue',
  working: 'Being extracted',
  decision: 'Needs a decision',
  hold: 'On hold',
  skipped: 'Skipped',
};

export const STATUS_ORDER: StatusCode[] = ['banked', 'older', 'queue', 'working', 'decision', 'hold', 'skipped'];

export interface FileRef { path: string; size: number | null; name: string | null }

export interface IndexLine {
  id: string;                 // stable: the identity key
  family: Family;
  subject: string;            // "E Math", "Physics"
  levelCode: string;          // "EM_NA"
  level: string;              // "Sec 4 N(A)"
  year: number | null;
  school: string;             // "Bedok South", "GCE"
  exam: string | null;        // "Prelim"
  paper: string | null;       // "1", "2", null = the whole file
  name: string;               // "Bedok South · Prelim · Paper 1"
  status: StatusCode;
  why: string | null;         // short reason for skipped / decision / hold
  questions: number;          // in the bank for this paper
  answersFrom: string | null; // "answers from the scheme" · "worked out from the answer key" · "worked out (no scheme)"
  figuresMissing: number;
  file: FileRef | null;       // the paper's own file in the bucket
  scheme: FileRef | null;     // its mark scheme, when one is kept
  sourceIds: string[];        // paper_library ids (notes are read by these)
  hasNotes: boolean;
  so: number;                 // subject order
  lo: number;                 // level order within the subject
}

// ── subjects and levels ──────────────────────────────────────────────────────

const MATHS_LEVELS: Record<string, [string, string, number]> = {
  // code: [subject, level label, order within the subject]
  EM: ['E Math', 'Sec 4 Express', 1], EM_NA: ['E Math', 'Sec 4/5 N(A)', 2],
  S3_EM: ['E Math', 'Sec 3 Express', 3], S3_EM_NA: ['E Math', 'Sec 3 N(A)', 4], S3_EM_NT: ['E Math', 'Sec 3 N(T)', 5],
  AM: ['A Math', 'Sec 4 Express', 1], AM_NA: ['A Math', 'Sec 4/5 N(A)', 2],
  S3_AM: ['A Math', 'Sec 3 Express', 3], S3_AM_NA: ['A Math', 'Sec 3 N(A)', 4],
  JC2: ['H2 Math', 'JC2', 1], JC1: ['H2 Math', 'JC1', 2],
  JC2_H1: ['H1 Math', 'JC2', 1],
  S2: ['Lower Sec Math', 'Sec 2 Express', 1], S2_NA: ['Lower Sec Math', 'Sec 2 N(A)', 2], S2_NT: ['Lower Sec Math', 'Sec 2 N(T)', 3],
  S1: ['Lower Sec Math', 'Sec 1 Express', 4], S1_NA: ['Lower Sec Math', 'Sec 1 N(A)', 5], S1_NT: ['Lower Sec Math', 'Sec 1 N(T)', 6],
};
const SCIENCE_LEVELS: Record<string, [string, string, number]> = {
  PHYS: ['Physics', 'Pure Physics', 1], CS_PHYS: ['Physics', 'Combined Science', 2], CS_PHYS_NA: ['Physics', 'Combined Science N(A)', 3], S3_PHYS: ['Physics', 'Sec 3', 4],
  CHEM: ['Chemistry', 'Pure Chemistry', 1], CS_CHEM: ['Chemistry', 'Combined Science', 2], CS_CHEM_NA: ['Chemistry', 'Combined Science N(A)', 3], S3_CHEM: ['Chemistry', 'Sec 3', 4],
  BIO: ['Biology', 'Pure Biology', 1], CS_BIO: ['Biology', 'Combined Science', 2], CS_BIO_NA: ['Biology', 'Combined Science N(A)', 3], S3_BIO: ['Biology', 'Sec 3', 4],
};
const SUBJECT_ORDER = ['E Math', 'A Math', 'H2 Math', 'H1 Math', 'Lower Sec Math', 'Physics', 'Chemistry', 'Biology', 'Lower Sec Science'];

function familyOf(subject: string | null | undefined, level: string | null | undefined): Family {
  const s = String(subject || '').toLowerCase();
  if (s === 'math' || s === 'maths' || s === '') return SCIENCE_LEVELS[String(level || '')] ? 'science' : 'maths';
  if (['physics', 'chemistry', 'biology', 'science'].includes(s)) return 'science';
  return 'humanities';
}

function titleWords(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Subject + level labels for a row, and sort orders. Never throws. */
export function subjectLevel(subject: string | null | undefined, level: string | null | undefined): {
  family: Family; subject: string; level: string; subjectOrder: number; levelOrder: number;
} {
  const lv = String(level || '').trim();
  const family = familyOf(subject, lv);
  let hit: [string, string, number] | undefined;
  if (family === 'maths') hit = MATHS_LEVELS[lv];
  else if (family === 'science') {
    hit = SCIENCE_LEVELS[lv];
    if (!hit && /^S[12]/.test(lv)) hit = ['Lower Sec Science', lv.replace(/^S(\d)/, 'Sec $1').replace(/_NA$/, ' N(A)').replace(/_NT$/, ' N(T)'), 1];
  }
  if (!hit) {
    const subj = family === 'humanities' ? titleWords(String(subject || 'Other')) : (family === 'maths' ? 'Other Math' : 'Other Science');
    hit = [subj, lv || 'No level', 99];
  }
  const so = SUBJECT_ORDER.indexOf(hit[0]);
  return { family, subject: hit[0], level: hit[1], subjectOrder: so === -1 ? 50 : so, levelOrder: hit[2] };
}

// ── names ────────────────────────────────────────────────────────────────────

export function normSchool(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** "p1" / "1" / "Paper 1" → "1"; "all" / "" → null. */
export function paperNo(p: string | null | undefined): string | null {
  const m = String(p || '').match(/(\d+)/);
  return m ? m[1] : null;
}

function normExam(e: string | null | undefined): string {
  return String(e || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function paperName(school: string, exam: string | null, paper: string | null): string {
  const parts = [school || 'Unknown school'];
  if (exam && normExam(exam) !== normSchool(school).replace(/ /g, '')) parts.push(exam);
  parts.push(paper ? `Paper ${paper}` : 'All papers');
  return parts.join(' · ');
}

// ── status and reasons ───────────────────────────────────────────────────────

/** A mark scheme kept for pairing — never a paper line of its own. */
export function isSchemeFile(row: Pick<SourceRow, 'source_file' | 'notes'>): boolean {
  if (/a mark scheme, not a paper/i.test(row.notes || '')) return true;
  const name = String(row.source_file || '').replace(/\.[a-z0-9]+$/i, '');
  return /\b(MS|marking scheme|mark scheme|solutions?|answers?|ans)\b/i.test(name) && !/\(questions\)/i.test(name);
}

/** A whole book the watcher cut into papers — its parts are lines of their own. */
export function isCutBook(row: Pick<SourceRow, 'status' | 'notes'>): boolean {
  return row.status === 'skipped' && /(split by the watcher|was cut at its covers into)/i.test(row.notes || '');
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** The short "why" for a skipped / held / flagged / failed paper, in plain words. */
export function shortReason(status: string | null, notes: string | null): string | null {
  const n = String(notes || '');
  if (status === 'held') {
    if (/outside the priority set/i.test(n)) return 'not in this round (only 2023–2025 A Math, E Math, H1 and sciences for now)';
    const m = n.match(/ON HOLD[^:]*:\s*([^|]+)/i);
    return m ? clip(m[1], 90) : null;
  }
  if (status === 'skipped') {
    if (/duplicate|already banked|already in the (science )?bank/i.test(n)) return 'already in the bank';
    if (/(pre-20\d\d|old|legacy) syllabus/i.test(n)) return 'old syllabus';
    if (/damaged|stripped|too sparse/i.test(n)) return 'file damaged or too thin to bank';
    if (/wrong file/i.test(n)) return 'the wrong file under this name';
    if (/not an exam paper|worksheet|notes only/i.test(n)) return 'not an exam paper';
    const closed = n.match(/flag closed as skipped\s*[—-]\s*([^|]+)/i);
    if (closed) return clip(closed[1], 90);
    const st = n.match(/Status:\s*SKIPPED\s*[-—(:]?\s*([^|)]+)/i);
    if (st) return clip(st[1], 90);
    return null;
  }
  if (status === 'flagged' || status === 'failed') {
    const segs = n.split(/\s+\|\s+/).map(s => s.trim()).filter(Boolean);
    const last = segs.length ? segs[segs.length - 1] : '';
    const prefix = status === 'failed' ? 'the worker failed' : '';
    const body = last ? clip(last.replace(/^\[[^\]]*\]\s*/, ''), 110) : '';
    return [prefix, body].filter(Boolean).join(': ') || null;
  }
  return null;
}

export function statusCode(status: string | null): StatusCode {
  switch (status) {
    case 'done': return 'banked';
    case 'queued': return 'queue';
    case 'claimed': return 'working';
    case 'flagged': case 'failed': return 'decision';
    case 'held': return 'hold';
    default: return 'skipped';
  }
}

// When one paper has several files (re-sent versions), the line shows the most
// advanced: banked, then being extracted, in the queue, needs a decision, on hold, skipped.
const RANK: Record<StatusCode, number> = { banked: 0, older: 1, working: 2, queue: 3, decision: 4, hold: 5, skipped: 6 };

function answersFrom(b: { n: number; n_scheme: number; n_from_answers: number; n_worked: number }): string | null {
  if (!b.n) return null;
  const top = Math.max(b.n_scheme, b.n_from_answers, b.n_worked);
  if (top === 0) return null;
  if (top === b.n_scheme) return 'answers from the scheme';
  if (top === b.n_from_answers) return 'worked out from the answer key';
  return 'worked out (no scheme)';
}

function fileRef(r: SourceRow | undefined | null): FileRef | null {
  if (!r?.storage_path) return null;
  return { path: r.storage_path, size: r.size_bytes ?? null, name: r.source_file ?? null };
}

// ── the index ────────────────────────────────────────────────────────────────

const baseKey = (family: Family, level: string | null, school: string | null, year: number | null) =>
  `${family}|${String(level || '')}|${normSchool(school)}|${year ?? ''}`;

function examsMatch(a: string | null, b: string | null): boolean {
  const x = normExam(a), y = normExam(b);
  return !x || !y || x === y;
}

/**
 * Build the index. `library` = the marker library rows (questions / solutions /
 * combined) — files for older maths papers. Every bank paper ends up on exactly
 * one line or more (an inbox file that covers it), never dropped.
 */
export function buildIndex(sources: SourceRow[], bank: BankPaper[], library: SourceRow[] = []): IndexLine[] {
  const lines = new Map<string, IndexLine & { _rank: number }>();
  const schemes: SourceRow[] = [];

  // 1. inbox files → paper lines (merging re-sent versions of one paper)
  for (const r of sources) {
    if (r.kind !== 'source') continue;
    if (isCutBook(r)) continue;
    if (isSchemeFile(r)) { schemes.push(r); continue; }
    const sl = subjectLevel(r.subject, r.level);
    const paper = paperNo(r.paper);
    const school = String(r.school || '').trim() || 'Unknown school';
    const id = `${baseKey(sl.family, r.level, school, r.year)}|${normExam(r.exam_type)}|${paper ?? 'all'}`;
    const status = statusCode(r.status);
    const prev = lines.get(id);
    if (prev) {
      prev.sourceIds.push(r.id);
      prev.hasNotes = prev.hasNotes || !!(r.notes && r.notes.trim());
      if (RANK[status] < prev._rank) {
        prev.status = status; prev._rank = RANK[status];
        prev.why = shortReason(r.status, r.notes);
        prev.file = fileRef(r) ?? prev.file;
      }
      continue;
    }
    lines.set(id, {
      id, family: sl.family, subject: sl.subject, levelCode: String(r.level || ''), level: sl.level,
      year: r.year ?? null, school, exam: r.exam_type ?? null, paper,
      name: paperName(school, r.exam_type ?? null, paper),
      status, why: shortReason(r.status, r.notes),
      questions: 0, answersFrom: null, figuresMissing: 0,
      file: fileRef(r), scheme: null, sourceIds: [r.id], hasNotes: !!(r.notes && r.notes.trim()),
      so: sl.subjectOrder, lo: sl.levelOrder, _rank: RANK[status],
    });
  }

  // 2. bank papers → onto the inbox line(s) that cover them, else a line of their own
  const byBase = new Map<string, Array<IndexLine & { _rank: number }>>();
  for (const l of lines.values()) {
    const k = baseKey(l.family, l.levelCode, l.school, l.year);
    (byBase.get(k) ?? byBase.set(k, []).get(k)!).push(l);
  }
  const sums = new Map<string, { n: number; n_scheme: number; n_from_answers: number; n_worked: number }>();
  const addTo = (l: IndexLine, b: BankPaper) => {
    l.questions += b.n; l.figuresMissing += b.figures_missing || 0;
    const s = sums.get(l.id) ?? { n: 0, n_scheme: 0, n_from_answers: 0, n_worked: 0 };
    s.n += b.n; s.n_scheme += b.n_scheme || 0; s.n_from_answers += b.n_from_answers || 0; s.n_worked += b.n_worked || 0;
    sums.set(l.id, s);
  };
  for (const b of bank) {
    const sl = subjectLevel(b.subject, b.level);
    const k = baseKey(sl.family, b.level, b.school, b.year);
    const p = paperNo(b.paper);
    const cands = (byBase.get(k) ?? []).filter(l => examsMatch(l.exam, b.exam_type) && (l.paper === null || l.paper === p));
    // an exact paper line wins over a whole-file line
    const exact = cands.filter(l => l.paper === p);
    const hits = exact.length ? exact : cands;
    if (hits.length) { for (const l of hits) addTo(l, b); continue; }
    const school = String(b.school || '').trim() || 'Unknown school';
    const id = `${k}|${normExam(b.exam_type)}|${p ?? 'all'}`;
    let l = lines.get(id);
    if (!l) {
      l = {
        id, family: sl.family, subject: sl.subject, levelCode: String(b.level || ''), level: sl.level,
        year: b.year ?? null, school, exam: b.exam_type ?? null, paper: p,
        name: paperName(school, b.exam_type ?? null, p),
        status: 'older', why: null, questions: 0, answersFrom: null, figuresMissing: 0,
        file: null, scheme: null, sourceIds: [], hasNotes: false, so: sl.subjectOrder, lo: sl.levelOrder, _rank: RANK.older,
      };
      lines.set(id, l);
      (byBase.get(k) ?? byBase.set(k, []).get(k)!).push(l);
    }
    addTo(l, b);
  }
  for (const l of lines.values()) {
    const s = sums.get(l.id);
    if (s) l.answersFrom = answersFrom(s);
  }

  // 3. files: schemes from the inbox, then the marker library (older papers' files)
  const attach = (r: SourceRow, what: 'file' | 'scheme') => {
    const sl = subjectLevel(r.subject, r.level);
    const p = paperNo(r.paper);
    for (const l of byBase.get(baseKey(sl.family, r.level, r.school, r.year)) ?? []) {
      if (!examsMatch(l.exam, r.exam_type)) continue;
      if (p !== null && l.paper !== null && l.paper !== p) continue;
      if (!l[what]) l[what] = fileRef(r);
    }
  };
  for (const r of schemes) attach(r, 'scheme');
  for (const r of library) {
    if (r.kind === 'questions' || r.kind === 'combined') attach(r, 'file');
    if (r.kind === 'solutions' || r.kind === 'combined') attach(r, 'scheme');
  }

  return [...lines.values()].map(({ _rank, ...l }) => { void _rank; return l; }).sort(compareLines);
}

export function compareLines(a: IndexLine, b: IndexLine): number {
  return a.so - b.so || a.subject.localeCompare(b.subject)
    || a.lo - b.lo || a.level.localeCompare(b.level)
    || (b.year ?? 0) - (a.year ?? 0)
    || a.school.localeCompare(b.school) || String(a.exam || '').localeCompare(String(b.exam || ''))
    || String(a.paper || '').localeCompare(String(b.paper || ''));
}

// ── counts, filters, groups ──────────────────────────────────────────────────

export type StatusCounts = Record<StatusCode, number>;
const zero = (): StatusCounts => ({ banked: 0, older: 0, queue: 0, working: 0, decision: 0, hold: 0, skipped: 0 });

export interface SubjectSummary { subject: string; counts: StatusCounts; papers: number; questions: number; bankedNoQuestions: number }

export function summarise(lines: IndexLine[]): SubjectSummary[] {
  const m = new Map<string, SubjectSummary>();
  for (const l of lines) {
    const s = m.get(l.subject) ?? { subject: l.subject, counts: zero(), papers: 0, questions: 0, bankedNoQuestions: 0 };
    s.counts[l.status]++; s.papers++; s.questions += l.questions;
    if (l.status === 'banked' && l.questions === 0) s.bankedNoQuestions++;
    m.set(l.subject, s);
  }
  return [...m.values()].sort((a, b) => {
    const x = SUBJECT_ORDER.indexOf(a.subject), y = SUBJECT_ORDER.indexOf(b.subject);
    return (x === -1 ? 50 : x) - (y === -1 ? 50 : y) || a.subject.localeCompare(b.subject);
  });
}

/** "E Math: 412 papers banked, 6 in the queue, 3 need a decision" */
export function summaryLine(s: SubjectSummary): string {
  const c = s.counts;
  const bits: string[] = [];
  const banked = c.banked + c.older;
  bits.push(`${banked} paper${banked === 1 ? '' : 's'} banked`);
  if (c.working) bits.push(`${c.working} being extracted`);
  if (c.queue) bits.push(`${c.queue} in the queue`);
  if (c.decision) bits.push(`${c.decision} need${c.decision === 1 ? 's' : ''} a decision`);
  if (c.hold) bits.push(`${c.hold} on hold`);
  if (c.skipped) bits.push(`${c.skipped} skipped`);
  return `${s.subject}: ${bits.join(', ')}`;
}

export interface IndexFilter { subject?: string; level?: string; yearFrom?: number | null; yearTo?: number | null; status?: StatusCode | 'banked-any' | ''; q?: string }

export function filterLines(lines: IndexLine[], f: IndexFilter): IndexLine[] {
  const words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return lines.filter(l => {
    if (f.subject && l.subject !== f.subject) return false;
    if (f.level && l.level !== f.level) return false;
    if (f.yearFrom && (l.year ?? 0) < f.yearFrom) return false;
    if (f.yearTo && (l.year ?? 9999) > f.yearTo) return false;
    if (f.status === 'banked-any') { if (l.status !== 'banked' && l.status !== 'older') return false; }
    else if (f.status && l.status !== f.status) return false;
    if (words.length) {
      const hay = `${l.subject} ${l.level} ${l.year ?? ''} ${l.school} ${l.exam ?? ''} ${l.paper ? `p${l.paper} paper ${l.paper}` : ''} ${STATUS_LABEL[l.status]} ${l.why ?? ''} ${l.file?.name ?? ''}`.toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
}

export interface YearGroup { year: number | null; lines: IndexLine[] }
export interface LevelGroup { level: string; years: YearGroup[]; count: number }
export interface SubjectGroup { subject: string; levels: LevelGroup[]; count: number }

/** Subject → Level → Year, in the index's order (lines must already be sorted). */
export function groupLines(lines: IndexLine[]): SubjectGroup[] {
  const out: SubjectGroup[] = [];
  for (const l of lines) {
    let s = out[out.length - 1];
    if (!s || s.subject !== l.subject) { s = { subject: l.subject, levels: [], count: 0 }; out.push(s); }
    let lv = s.levels[s.levels.length - 1];
    if (!lv || lv.level !== l.level) { lv = { level: l.level, years: [], count: 0 }; s.levels.push(lv); }
    let y = lv.years[lv.years.length - 1];
    if (!y || y.year !== l.year) { y = { year: l.year, lines: [] }; lv.years.push(y); }
    y.lines.push(l); lv.count++; s.count++;
  }
  return out;
}

/** The status in words for one line: "Skipped — old syllabus". */
export function statusText(l: Pick<IndexLine, 'status' | 'why' | 'file'>): string {
  const base = STATUS_LABEL[l.status];
  if (l.status === 'older') return l.file ? base : `${base}, no source file`;
  return l.why ? `${base} — ${l.why}` : base;
}

/** "38 questions · answers from the scheme · 2 figures missing" */
export function bankText(l: Pick<IndexLine, 'questions' | 'answersFrom' | 'figuresMissing' | 'status'>): string {
  if (!l.questions) return l.status === 'banked' ? 'no questions found in the bank under this name' : '';
  const bits = [`${l.questions} question${l.questions === 1 ? '' : 's'} in the bank`];
  if (l.answersFrom) bits.push(l.answersFrom);
  if (l.figuresMissing) bits.push(`${l.figuresMissing} figure${l.figuresMissing === 1 ? '' : 's'} missing`);
  return bits.join(' · ');
}

/** Notes split into short lines for the fold. */
export function noteLines(notes: string | null | undefined): string[] {
  return String(notes || '').split(/\s+\|\s+|\n+/).map(s => s.trim()).filter(Boolean);
}
