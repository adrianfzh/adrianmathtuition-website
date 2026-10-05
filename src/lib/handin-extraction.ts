// The extraction hand-off for papers students hand in — the pure half
// (SPEC-PAPER-MATCH.md §⑤, Phase 3; Adrian, 5 Oct 2026: "build that. and start to
// extract papers previously uploaded that we don't already have in the question
// bank too").
//
// When a marked hand-in is a paper the bank does not hold, the PRINTED question
// pages in it are a source the extraction queue can bank. The rules, in order:
//
//   1. PRIVACY FIRST. Only pages that are printed questions and nothing else go:
//      the page pre-pass called the page `question_paper` (printed, no student
//      writing) AND the page's own marking read agreed — it is in
//      `non_work_pages` as `question_paper` and no marked answer sits on it.
//      A `mixed` page (printed questions with the student's working on them), a
//      `working` page, a `cover` (it may carry a written name), an answer page
//      the student wrote — none of them ever leave the student's files.
//      A question paper PDF attached to the run (the "Question paper (PDF)" slot
//      on /admin/mark-paper) is printed by definition and goes whole.
//   2. ENOUGH OF THE PAPER. Students write on the paper, so most hand-ins carry
//      a page or two of clean print among twenty of working. A file of two pages
//      is not a paper. At least MIN_CLEAN_PAGES clean pages AND at least
//      MIN_CLEAN_SHARE of the printed pages, or nothing is sent.
//   3. A KNOWN PAPER. School (or GCE), year, level and paper number must all be
//      known, and the inbox's own filename reader must read the name back to the
//      same paper — never a guess. Our own sheets (practice sets, Practice Again,
//      bench and calibration scripts) are never sent.
//   4. NOT ALREADY HELD. The library index (banked, queued, held, being
//      extracted, skipped) decides; a paper another hand-in already sent is a
//      duplicate.
//
// The I/O (page download, PDF, bucket upload, the queue row, the run's stamp)
// is lib/handin-extraction-store.ts.

import { parseSourceFilename, libraryKindOf } from './extraction-inbox';
import { partFileName } from './paper-book-split';
import { normSchool, paperNo, type IndexLine } from './paper-index';

export const MIN_CLEAN_PAGES = 3;
export const MIN_CLEAN_SHARE = 0.5;

// ── the run, as far as this module reads it ─────────────────────────────────

export type HandinRun = {
  id: string;
  created_at?: string | null;
  paper_name: string | null;
  student_name?: string | null;
  paper_subject?: string | null;
  subject?: string | null;
  queue_status?: string | null;
  superseded_by?: string | null;
  result_json: unknown;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// ── 1. which pages may go ────────────────────────────────────────────────────

export type PagePick = {
  /** photo indices, in order, that may go */
  clean: number[];
  /** pages carrying printed questions (clean + with the student's working) */
  printed: number;
  /** pages the pre-pass called printed-only but the read found work on (kept back) */
  disputed: number[];
};

/**
 * The photo indices that are printed questions and nothing else. Both the page
 * pre-pass (`page_classification`) and the page's marking read
 * (`non_work_pages`, `results[].photo_index`) must agree. Pure.
 */
export function cleanPrintedPages(resultJson: unknown): PagePick {
  const rj = obj(resultJson);
  const pc = arr(rj.page_classification).map(obj);
  const nonWork = new Map<number, string>();
  for (const p of arr(rj.non_work_pages).map(obj)) {
    const i = Number(p.photo_index);
    if (Number.isInteger(i)) nonWork.set(i, String(p.kind || ''));
  }
  const marked = new Set<number>();
  for (const r of arr(rj.results).map(obj)) {
    const i = Number(r.photo_index);
    if (Number.isInteger(i)) marked.add(i);
  }
  const clean: number[] = [], disputed: number[] = [];
  let printed = 0;
  for (const p of pc) {
    const kind = String(p.kind || '');
    const i = Number(p.photo_index);
    if (!Number.isInteger(i)) continue;
    if (kind === 'question_paper' || kind === 'mixed') printed++;
    if (kind !== 'question_paper') continue;
    if (nonWork.get(i) === 'question_paper' && !marked.has(i)) clean.push(i);
    else disputed.push(i);
  }
  clean.sort((a, b) => a - b);
  return { clean, printed, disputed };
}

/** Enough of the paper to be worth extracting? Pure. */
export function enoughPages(pick: PagePick): { ok: true; partial: boolean } | { ok: false; reason: SkipReason; detail: string } {
  if (!pick.clean.length) {
    return { ok: false, reason: 'no-printed-pages', detail: pick.printed ? `all ${pick.printed} printed pages carry the student's working` : 'no printed question pages' };
  }
  const share = pick.printed ? pick.clean.length / pick.printed : 0;
  if (pick.clean.length < MIN_CLEAN_PAGES || share < MIN_CLEAN_SHARE) {
    return { ok: false, reason: 'too-few-printed-pages', detail: `${pick.clean.length} clean of ${pick.printed} printed pages — the rest carry the student's working` };
  }
  return { ok: true, partial: pick.clean.length < pick.printed };
}

// ── 2. which paper ───────────────────────────────────────────────────────────

export type PaperIdentity = {
  subject: 'math' | 'biology' | 'chemistry' | 'physics';
  /** the bank level code: AM, EM, JC2, JC2_H1, JC1, CHEM, CS_CHEM, S3_PHYS … */
  level: string;
  year: number;
  /** 'GCE' for a national paper, else the school as the bank spells it */
  school: string;
  /** the inbox's exam spellings: GCE, Prelim, Promo, MYE, SA1, SA2, Specimen */
  examType: string;
  paper: number;
};

export type SkipReason =
  | 'own-sheet' | 'unknown-paper' | 'no-printed-pages' | 'too-few-printed-pages'
  | 'in-bank' | 'already-queued' | 'duplicate-handin' | 'not-marked' | 'superseded';

/** Our own material — never a school paper to bank. */
const OWN_CONTENT = /practice\s*(?:again|set)|\bset\s*\d|\bsets?\b|worksheet|revision|\bnotes?\b|\bbench\b|calibration|adrianmath|\btwin|\btest\s+set|\bdrill/i;

// Bot lib/paper-key.js twins — the exam tokens and the level tokens.
const EXAM_TOKENS: Record<string, string> = {
  prelim: 'Prelim', prelims: 'Prelim', preliminary: 'Prelim',
  tys: 'GCE', gce: 'GCE', olevel: 'GCE', alevel: 'GCE',
  sa1: 'SA1', sa2: 'SA2', eoy: 'SA2', eye: 'SA2', mye: 'MYE', midyear: 'MYE',
  promo: 'Promo', promos: 'Promo', specimen: 'Specimen',
  // Named so they are recognised and refused: the inbox has no spelling for them.
  wa1: 'WA', wa2: 'WA', wa3: 'WA', ca1: 'CA', ca2: 'CA',
};
const BOT_EXAM: Record<string, string> = {
  PRELIM: 'Prelim', GCE: 'GCE', TYS: 'GCE', SA1: 'SA1', SA2: 'SA2', EOY: 'SA2', MYE: 'MYE',
  PROMO: 'Promo', SPECIMEN: 'Specimen', WA1: 'WA', WA2: 'WA', WA3: 'WA', CA1: 'CA', CA2: 'CA',
};
const BOT_LEVEL: Record<string, string> = { AM: 'AM', EM: 'EM', H2: 'JC2', H1: 'JC2_H1' };

/** The school table — a twin of the bot's lib/paper-key.js SCHOOL_ALIASES (the
 *  bank's exact `questions.school` spellings). An acronym missing here is NOT
 *  guessed: the paper is skipped as unknown and named in the report. */
export const SCHOOL_ALIASES: Record<string, string> = {
  'hua yi': 'Hua Yi', huayi: 'Hua Yi', hyss: 'Hua Yi',
  xinmin: 'Xinmin', xmss: 'Xinmin',
  'acs barker': 'Anglo Chinese School (Barker Road)', 'acs barker road': 'Anglo Chinese School (Barker Road)', acsbr: 'Anglo Chinese School (Barker Road)',
  'acs i': 'ACSI (IP)', acsi: 'ACSI (IP)', 'acs independent': 'ACSI (IP)',
  kranji: 'Kranji', 'ahmad ibrahim': 'Ahmad Ibrahim', beatty: 'Beatty',
  presbyterian: 'Presbyterian High', 'presbyterian high': 'Presbyterian High',
  'chung cheng yishun': 'Chung Cheng High (Yishun)', cchy: 'Chung Cheng High (Yishun)',
  'chung cheng main': 'Chung Cheng High (Main)', cchm: 'Chung Cheng High (Main)', cchms: 'Chung Cheng High (Main)',
  'tanjong katong': 'Tanjong Katong', tkss: 'Tanjong Katong',
  fairfield: 'Fairfield Methodist', 'fairfield methodist': 'Fairfield Methodist',
  'geylang methodist': 'Geylang Methodist', 'anglican high': 'Anglican High',
  crescent: 'Crescent Girls', 'crescent girls': 'Crescent Girls',
  'methodist girls': 'Methodist Girls', mgs: 'Methodist Girls',
  'nanyang girls': 'Nanyang Girls', nygh: 'Nanyang Girls',
  cedar: 'Cedar Girls', 'cedar girls': 'Cedar Girls',
  'catholic high': 'Catholic High', 'st gabriel': 'St Gabriel', 'saint gabriel': 'St Gabriel',
  'gan eng seng': 'Gan Eng Seng', 'ngee ann': 'Ngee Ann', 'bukit merah': 'Bukit Merah', 'bukit view': 'Bukit View',
  'bedok view': 'Bedok View', 'north vista': 'North Vista', 'ang mo kio': 'Ang Mo Kio', zhonghua: 'Zhonghua',
  peicai: 'Peicai', 'nan chiau': 'Nan Chiau', 'chij katong': 'CHIJ Katong Convent', 'katong convent': 'CHIJ Katong Convent',
  'raffles girls': 'Raffles Girls', rgs: 'Raffles Girls', queenstown: 'Queenstown',
  ri: 'RI', rjc: 'RI', hci: 'HCI', njc: 'NJC', nyjc: 'NYJC', tjc: 'TJC', vjc: 'VJC', acjc: 'ACJC',
  cjc: 'CJC', sajc: 'SAJC', ejc: 'EJC', ajc: 'AJC', mjc: 'MJC', pjc: 'PJC', yjc: 'YJC', jjc: 'JJC',
  srjc: 'SRJC', tmjc: 'TMJC', yijc: 'YIJC', asrjc: 'ASRJC', rvhs: 'RVHS', dhs: 'DHS',
};

const NOISE = new Set([
  'paper', 'papers', 'pp', 'math', 'maths', 'mathematics', 'exam', 'exams', 'test', 'marked', 'scan', 'scanned', 'pdf',
  'copy', 'final', 'sec', 'secondary', 'school', 'year', 'yr', 'the', 'and', 'of', 'for', 'with', 'level', 'o', 'a',
  'am', 'em', 'amath', 'emath', 'h1', 'h2', 'jc1', 'jc2', 's3', 's4', 'sec4', 'sec3', 'express', 'question', 'questions',
  'chem', 'chemistry', 'phy', 'phys', 'physics', 'bio', 'biology', 'science', 'sci', 'pure', 'combined', 'cs',
  'additional', 'elementary', 'ten', 'series', 'sch',
]);

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A leftover school name, or null when it cannot be named without guessing. */
function schoolFrom(tokens: string[]): string | null {
  // The WHOLE leftover must be a known alias: "tanjong katong girls" is not
  // Tanjong Katong (the bot's alias-inside-the-name rule says it is — 5 Oct 2026).
  // Only the alias table names a school from typed words: an unknown acronym (ges,
  // plmgs, scss, sjc) is never guessed, and a leftover that is really the student's
  // own name can never become a file name. A school missing here is named in the
  // report — add it to the table.
  const left = tokens.join(' ').trim();
  return (left && SCHOOL_ALIASES[left]) || null;
}

/** Science level from the run's subject + name. */
function scienceLevel(subject: string, name: string, rj: Obj): string | null {
  const base = subject === 'chemistry' ? 'CHEM' : subject === 'physics' ? 'PHYS' : subject === 'biology' ? 'BIO' : null;
  if (!base) return null;
  const n = norm(name);
  if (/\b(s3|sec 3|sec3)\b/.test(n)) return `S3_${base}`;
  const combined = rj.science_track === 'combined' || /\b(combined|cs|sci)\b/.test(n);
  return combined ? `CS_${base}` : base;
}

type Fields = { level: string | null; year: number | null; paper: number | null; exam: string | null; school: string | null; schoolGuess?: boolean };

/** Read the typed paper name (student's name stripped). Never guesses a school from an unknown acronym. */
function fieldsFromName(name: string, studentName: string | null | undefined, mathLevel: string | null): Fields {
  const drop = new Set(norm(studentName).split(' ').filter(t => t.length >= 2));
  const tokens = norm(name).split(' ').filter(Boolean).filter(t => !drop.has(t));
  const joined = tokens.join(' ');
  const yearTok = tokens.find(t => /^(19|20)\d\d$/.test(t));
  const pm = joined.match(/\b(?:p|pp|paper)\s*([1-6])\b/);
  let exam: string | null = null;
  for (const t of tokens) if (EXAM_TOKENS[t]) { exam = EXAM_TOKENS[t]; break; }
  if (!exam && /\b(?:[oa] ?level|[oa] ?lvl|olvl)\b/.test(joined)) exam = 'GCE';
  let level = mathLevel;
  if (level === undefined || level === null) {
    for (const t of tokens) { const l = ({ am: 'AM', amath: 'AM', em: 'EM', emath: 'EM', h2: 'JC2', jc2: 'JC2', h1: 'JC2_H1' } as Record<string, string>)[t]; if (l) { level = l; break; } }
    if (!level && /\ba math\b/.test(joined)) level = 'AM';
    if (!level && /\be math\b/.test(joined)) level = 'EM';
  }
  const left = tokens.filter(t => !EXAM_TOKENS[t] && !NOISE.has(t) && !/^\d+$/.test(t) && !/^p{1,2}[1-6]$/.test(t)
    && !['olvl', 'lvl', 'tys', 'jc', 'jc1'].includes(t) && t.length >= 2);
  const school = exam === 'GCE' || exam === 'Specimen' ? 'GCE' : schoolFrom(left);
  return { level, year: yearTok ? Number(yearTok) : null, paper: pm ? Number(pm[1]) : null, exam, school };
}

const LEVEL_FROM_SUBJECT: Record<string, string> = { 'A Math': 'AM', 'E Math': 'EM', 'H2 Math': 'JC2', 'H1 Math': 'JC2_H1' };

function finish(subject: PaperIdentity['subject'], f: Fields, name: string): { ok: true; id: PaperIdentity } | { ok: false; reason: SkipReason; detail: string } {
  const missing = [!f.level && 'level', !f.year && 'year', !f.paper && 'paper number', !f.exam && 'exam type (prelim, SA2, TYS …)', !f.school && 'school'].filter(Boolean);
  if (missing.length) return { ok: false, reason: 'unknown-paper', detail: `"${name}" names no ${missing.join(', ')}` };
  if (f.exam === 'WA' || f.exam === 'CA') return { ok: false, reason: 'unknown-paper', detail: 'a WA / class test — the inbox files prelims, SA1/SA2, promos and GCE papers' };
  // A JC promo is the JC1 paper.
  const level = f.exam === 'Promo' && f.level === 'JC2' ? 'JC1' : f.level!;
  return { ok: true, id: { subject, level, year: f.year!, school: f.school!, examType: f.exam!, paper: f.paper! } };
}

/**
 * Which paper a run is, or the reason it cannot be named. Maths reads the bot's
 * `paper_match.parsed` (the student's name already stripped there, a printed
 * SEAB code already read) and fills a gap from the typed name or the run's
 * `paper_subject`; science — which carries no paper_match — reads the typed
 * name. Pure.
 */
export function paperIdentity(run: HandinRun & { paper_subject?: string | null }): { ok: true; id: PaperIdentity } | { ok: false; reason: SkipReason; detail: string } {
  const name = String(run.paper_name || '');
  if (OWN_CONTENT.test(name)) return { ok: false, reason: 'own-sheet', detail: 'our own sheet, not a school paper' };
  const rj = obj(run.result_json);
  const subject = String(run.subject || rj.subject || 'math');
  if (/cambridge/i.test(name)) return { ok: false, reason: 'unknown-paper', detail: 'a Cambridge paper, not a SEAB or school paper' };

  if (subject === 'math') {
    const pm = obj(rj.paper_match);
    const p = obj(pm.parsed);
    const fromName = fieldsFromName(name, run.student_name, LEVEL_FROM_SUBJECT[String(run.paper_subject || '')] ?? null);
    const exam = BOT_EXAM[String(p.exam || '').toUpperCase()] || null;
    let school: string | null = exam === 'GCE' || exam === 'Specimen' ? 'GCE' : (p.school ? String(p.school) : null);
    // The bot Title-Cases a leftover it does not know; an acronym that way is a guess.
    const reasons = arr(pm.reasons).map(String);
    if (school && school !== 'GCE' && (reasons.includes('school-unverified') || reasons.includes('school-from-token'))) {
      // The bot Title-Cased a leftover it did not know, or found an alias INSIDE a longer
      // name — only an exact alias of the whole typed leftover may name it here.
      school = fromName.school;
    }
    const f: Fields = {
      level: BOT_LEVEL[String(p.level || '')] || fromName.level,
      year: Number(p.year) || fromName.year,
      paper: Number(p.paper) || fromName.paper,
      exam: exam || fromName.exam,
      school: school || ((exam || fromName.exam) === 'GCE' ? 'GCE' : fromName.school),
    };
    return finish('math', f, name);
  }

  if (subject !== 'chemistry' && subject !== 'physics' && subject !== 'biology') {
    return { ok: false, reason: 'unknown-paper', detail: `subject "${subject}" has no extraction lane here` };
  }
  return finish(subject, fieldsFromName(name, run.student_name, scienceLevel(subject, name, rj)), name);
}

// ── 3. the file name ─────────────────────────────────────────────────────────

/**
 * The inbox name for a paper — `CHEM PRELIM 2025 Queenstown Paper 2.pdf`,
 * `AM GCE 2024 Paper 1.pdf` — built by the book splitter's own `partFileName`
 * and READ BACK by the inbox's `parseSourceFilename`: a name that does not read
 * back to the same level, year, paper and school is refused (null), never sent
 * under a name the fleet would file somewhere else. Never the student's name. Pure.
 */
export function handoffFileName(id: PaperIdentity): string | null {
  const name = partFileName({ level: id.level, year: id.year, school: id.school, examType: id.examType }, { paper: id.paper, year: id.year });
  const back = parseSourceFilename(name);
  if (!back.ok) return null;
  if (back.level !== id.level || back.year !== id.year || paperNo(back.paper) !== String(id.paper)) return null;
  // A specimen would come back as the live GCE paper — refused, never mis-filed.
  if (String(back.examType || '') !== id.examType) return null;
  if (normSchool(back.school) !== normSchool(id.school)) return null;
  if (libraryKindOf(name) !== 'questions') return null;
  return name;
}

/** Belt and braces: does a file name carry any word of the student's name? Pure. */
export function namesStudent(file: string, studentName: string | null | undefined): boolean {
  const words = new Set(norm(file).split(' '));
  return norm(studentName).split(' ').some(t => t.length >= 3 && words.has(t));
}

/** The scheme's name beside it: `… Paper 2 MS.pdf` — the inbox's own scheme rule. Pure. */
export function schemeFileName(paperFile: string): string {
  return paperFile.replace(/\.pdf$/i, ' MS.pdf');
}

// ── 4. already held? ─────────────────────────────────────────────────────────

const GENERIC = /\b(secondary|school|sec|ss|the|junior|college|jc)\b/g;
const schoolCore = (s: string) => normSchool(s).replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();

/** The same school, allowing for "Queenstown" vs "Queenstown Secondary". Pure. */
export function sameSchool(a: string, b: string): boolean {
  const x = schoolCore(a), y = schoolCore(b);
  return !!x && x === y;
}

/** The index line that already holds this paper (banked, queued, held, …), if any. Pure. */
export function heldLine(id: PaperIdentity, lines: Pick<IndexLine, 'levelCode' | 'year' | 'school' | 'paper' | 'status' | 'name'>[]): Pick<IndexLine, 'levelCode' | 'year' | 'school' | 'paper' | 'status' | 'name'> | null {
  const hits = lines.filter(l => l.levelCode === id.level && l.year === id.year && sameSchool(l.school, id.school)
    && (l.paper === null || l.paper === String(id.paper)));
  if (!hits.length) return null;
  const rank = (s: string) => (s === 'banked' || s === 'older' ? 0 : 1);
  return hits.sort((a, b) => rank(a.status) - rank(b.status))[0];
}

/** One identity string for de-duplicating hand-ins of the same paper. Pure. */
export function identityKey(id: PaperIdentity): string {
  return `${id.level}|${id.year}|${schoolCore(id.school)}|${id.paper}`;
}

// ── the decision ─────────────────────────────────────────────────────────────

export type HandoffSource =
  | { kind: 'pages'; pages: number[]; partial: boolean; printed: number }
  | { kind: 'attached-pdf'; url: string };

export type HandoffDecision =
  | { action: 'queue'; id: PaperIdentity; file: string; source: HandoffSource; scheme: SchemeSource | null; key: string }
  | { action: 'skip'; reason: SkipReason; detail: string; id?: PaperIdentity; file?: string };

export type SchemeSource = { kind: 'pdf'; url: string } | { kind: 'photos'; urls: string[] };

/** Where a run's photos are: `result_json.source.photos[].original_url` by photo index. Pure. */
export function photoUrls(resultJson: unknown): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of arr(obj(obj(resultJson).source).photos).map(obj)) {
    const i = Number(p.photo_index);
    const u = String(p.original_url || p.url || '');
    if (Number.isInteger(i) && u) out.set(i, u);
  }
  return out;
}

/** Our file URL that is NOT already in the paper library or one of our own sheets. */
function outsideUrl(u: unknown, isOurs: (u: string) => boolean): string | null {
  const s = String(u || '');
  if (!s || /\/paper-library\//.test(s) || /\/assignments\//.test(s) || /practice-again/.test(s)) return null;
  return isOurs(s) ? s : null;
}

/** The question paper PDF attached to the run (printed by definition), if it is not already ours. */
export function attachedPaperPdf(resultJson: unknown, isOurs: (u: string) => boolean): string | null {
  return outsideUrl(obj(obj(resultJson).source).paper_pdf_url, isOurs);
}

/** A scheme the student (or Adrian) attached — a PDF, or photos of a printed scheme. */
export function attachedScheme(resultJson: unknown, isOurs: (u: string) => boolean): SchemeSource | null {
  const s = obj(obj(obj(resultJson).source).scheme_source);
  const pdf = outsideUrl(s.pdf_url, isOurs);
  if (pdf) return { kind: 'pdf', url: pdf };
  const urls = arr(s.pages).map(p => outsideUrl(obj(p).url, isOurs)).filter((u): u is string => !!u);
  return urls.length ? { kind: 'photos', urls } : null;
}

/**
 * What to do with one run. `lines` = the library index; `seen` = identity keys
 * already sent by this sweep (or by an earlier hand-in's stamp). Pure.
 */
export function decideHandoff(
  run: HandinRun,
  ctx: { lines: Pick<IndexLine, 'levelCode' | 'year' | 'school' | 'paper' | 'status' | 'name'>[]; seen: Set<string>; isOurs: (u: string) => boolean },
): HandoffDecision {
  if (run.superseded_by) return { action: 'skip', reason: 'superseded', detail: 'a later marking of the same hand-in exists' };
  const rj = obj(run.result_json);
  if (run.queue_status === 'queued' || run.queue_status === 'claimed' || !arr(rj.results).length) {
    return { action: 'skip', reason: 'not-marked', detail: 'not marked yet' };
  }
  const who = paperIdentity(run);
  if (!who.ok) return { action: 'skip', reason: who.reason, detail: who.detail };
  const id = who.id;
  const file = handoffFileName(id);
  if (!file) return { action: 'skip', reason: 'unknown-paper', detail: 'the inbox could not read the paper\'s name back', id };
  if (namesStudent(file, run.student_name)) return { action: 'skip', reason: 'unknown-paper', detail: 'the paper\'s name would carry the student\'s name', id };
  const held = heldLine(id, ctx.lines);
  if (held) {
    const inBank = held.status === 'banked' || held.status === 'older';
    return { action: 'skip', reason: inBank ? 'in-bank' : 'already-queued', detail: `${held.name} — ${held.status}`, id, file };
  }
  const key = identityKey(id);
  if (ctx.seen.has(key)) return { action: 'skip', reason: 'duplicate-handin', detail: 'another hand-in of this paper was sent', id, file };

  const scheme = attachedScheme(rj, ctx.isOurs);
  const paperPdf = attachedPaperPdf(rj, ctx.isOurs);
  if (paperPdf) return { action: 'queue', id, file, source: { kind: 'attached-pdf', url: paperPdf }, scheme, key };

  const pick = cleanPrintedPages(rj);
  const enough = enoughPages(pick);
  if (!enough.ok) return { action: 'skip', reason: enough.reason, detail: enough.detail, id, file };
  const photos = photoUrls(rj);
  const pages = pick.clean.filter(i => photos.has(i));
  if (pages.length < MIN_CLEAN_PAGES) return { action: 'skip', reason: 'too-few-printed-pages', detail: 'the clean pages\' photos are not stored', id, file };
  return { action: 'queue', id, file, source: { kind: 'pages', pages, partial: enough.partial, printed: pick.printed }, scheme, key };
}

/** The queue row's note — run id and page numbers, never a name. Pure. */
export function handoffNote(runId: string, source: HandoffSource, today: string): string {
  if (source.kind === 'attached-pdf') return `from a student hand-in, the question paper PDF attached to the run (printed only), run ${runId}, ${today}`;
  const pages = source.pages.map(i => i + 1).join(', ');
  const partial = source.partial ? ` PARTIAL: ${source.pages.length} of ${source.printed} printed pages — the others carry the student's working and were left out; bank what is here.` : '';
  return `from a student hand-in, printed pages only (photos ${pages}), run ${runId}, ${today}.${partial}`;
}

/** Priority for the backfill: science Sec 4 first, then the levels handed in most, newest first. Pure. */
export function backfillOrder<T extends { run: HandinRun; level: string | null }>(items: T[], levelCounts: Map<string, number>): T[] {
  const sci4 = (l: string | null) => (l && /^(CHEM|PHYS|BIO|CS_)/.test(l) ? 0 : 1);
  return [...items].sort((a, b) => sci4(a.level) - sci4(b.level)
    || (levelCounts.get(b.level || '') ?? 0) - (levelCounts.get(a.level || '') ?? 0)
    || String(b.run.created_at || '').localeCompare(String(a.run.created_at || '')));
}

/** "2 queued · 40 in the bank · …" for the tick and the report. Pure. */
export function handoffSummary(counts: Partial<Record<SkipReason | 'queued', number>>): string {
  const label: Record<string, string> = {
    queued: 'queued', 'in-bank': 'already in the bank', 'already-queued': 'already in the queue',
    'duplicate-handin': 'duplicate of another hand-in', 'no-printed-pages': 'no clean printed pages',
    'too-few-printed-pages': 'too few clean printed pages', 'unknown-paper': 'paper not known',
    'own-sheet': 'our own sheet', 'not-marked': 'not marked yet', superseded: 'superseded',
  };
  const parts = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${label[k] ?? k}`);
  return parts.length ? parts.join(' · ') : 'nothing to hand off';
}
