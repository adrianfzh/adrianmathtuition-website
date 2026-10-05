// The extraction hand-off for papers students hand in — the pure half
// (SPEC-PAPER-MATCH.md §⑤, Phase 3; Adrian, 5 Oct 2026: "build that. and start to
// extract papers previously uploaded that we don't already have in the question
// bank too", then "do the safer middle way").
//
// When a marked hand-in is a paper the bank does not hold, its PRINTED question
// pages are a source the extraction queue can bank. The rules, in order:
//
//   1. WHICH PAGES. Clean printed pages first: the page pre-pass called the page
//      `question_paper` AND the page's own marking read agreed (`non_work_pages`,
//      no marked answer on it). When too few are clean — students write on the
//      paper — the "safer middle way": every printed question page (`question_paper`
//      + `mixed`, the student's working included) goes as a PRIVATE source, flagged
//      `contains_student_work`. The law then transcribes only the print, never crops
//      a figure from it, and the source is deleted once the paper is finished. A
//      cover never goes (a written name), nor a page of plain working. A question
//      paper PDF attached to the run is printed by definition and goes whole.
//   2. WHICH PAPER. School (or GCE), year, level, paper number and exam type, all
//      known, never guessed. Order of trust: what is PRINTED on the pages (a reading
//      of the cover / footers, when the typed name lacks something) beats the typed
//      name, which fills gaps. A school is named by the alias table, the families of
//      spellings, or — for an unknown short form — the ONE bank school whose initials
//      fit; two or none fit → Adrian is asked (one batched line). A school is never
//      Title-Cased from typed words, so a student's name can never become a file name.
//      Our own sheets (practice sets, Practice Again, bench, calibration) never go.
//   3. NOT ALREADY HELD. The library index (banked, queued, held, being extracted,
//      skipped) decides, plus the marking's own match of the printed questions
//      against the bank; a paper another hand-in already sent is a duplicate.
//
// The I/O (page reading, PDF, bucket upload, the queue row, the run's stamp, the
// deletion of finished student-work sources) is lib/handin-extraction-store.ts.

import { parseSourceFilename, libraryKindOf } from './extraction-inbox';
import { partFileName } from './paper-book-split';
import { normSchool, paperNo, type IndexLine } from './paper-index';

export const MIN_CLEAN_PAGES = 3;
export const MIN_CLEAN_SHARE = 0.5;
/** A private (student-work) source needs at least this many printed pages. */
export const MIN_PRINTED_PAGES = 3;
/** The note tag every student-work source row carries (the law keys on it too). */
export const STUDENT_WORK_TAG = 'CONTAINS STUDENT WORK';

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
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ── 1. which pages may go ────────────────────────────────────────────────────

export type PagePick = {
  /** photo indices, in order, that are printed and carry nothing of the student's */
  clean: number[];
  /** pages carrying printed questions (clean + with the student's working) */
  printed: number;
  /** pages the pre-pass called printed-only but the read found work on (kept back) */
  disputed: number[];
  /** every printed question page in order — clean AND with working (never a cover) */
  printedPages: number[];
};

/**
 * The page picture: which photos are printed questions and nothing else (both the
 * pre-pass `page_classification` and the page's read — `non_work_pages`,
 * `results[].photo_index` — must agree), and which are printed questions at all.
 * A page either signal calls a cover is never in either list. Pure.
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
  const clean: number[] = [], disputed: number[] = [], printedPages: number[] = [];
  for (const p of pc) {
    const kind = String(p.kind || '');
    const i = Number(p.photo_index);
    if (!Number.isInteger(i) || nonWork.get(i) === 'cover') continue;
    if (kind === 'question_paper' || kind === 'mixed') printedPages.push(i);
    if (kind !== 'question_paper') continue;
    if (nonWork.get(i) === 'question_paper' && !marked.has(i)) clean.push(i);
    else disputed.push(i);
  }
  const byNum = (a: number, b: number) => a - b;
  return { clean: clean.sort(byNum), printed: printedPages.length, disputed, printedPages: printedPages.sort(byNum) };
}

/** Enough clean pages to send without any student work? Pure. */
export function enoughPages(pick: Pick<PagePick, 'clean' | 'printed'>): { ok: true; partial: boolean } | { ok: false; reason: SkipReason; detail: string } {
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

/** What a reading of the printed pages (cover, headers, footers) says — lib/handin-extraction-store asks for exactly this. */
export type PaperReading = {
  subject?: string | null;      // "A Math" | "E Math" | "H2 Math" | "H1 Math" | "Physics" | "Chemistry" | "Biology" | "Combined Science" | "Other"
  syllabus_code?: string | null; // "4049/01", "6092/02", "5076/03"
  exam?: string | null;          // "GCE" | "Prelim" | "SA2" | "MYE" | "Promo" | "WA" | "Specimen" | …
  school?: string | null;        // as printed
  year?: number | null;
  paper?: number | null;
  confidence?: number | null;
  /** For a run marked before the page pre-pass existed (no page_classification): what each
   *  photo is, read from ALL its photos — "cover" | "question_paper" | "mixed" | "working" | "other". */
  pages?: Array<{ photo: number; kind: string }> | null;
};

/** A run with no page pre-pass on record (marked before late August 2026). Pure. */
export function lacksPageClassification(resultJson: unknown): boolean {
  return !arr(obj(resultJson).page_classification).length;
}

/** Our own material — never a school paper to bank. */
const OWN_CONTENT = /\bo rev\b|practice\s*(?:again|set)|\bset\s*\d|\bsets?\b|worksheet|revision|\bnotes?\b|\bbench\b|calibration|adrianmath|\btwin|\btest\s+set|\bdrill/i;

// Bot lib/paper-key.js twins — the exam tokens and the level tokens.
const EXAM_TOKENS: Record<string, string> = {
  prelim: 'Prelim', prelims: 'Prelim', preliminary: 'Prelim',
  tys: 'GCE', gce: 'GCE', olevel: 'GCE', alevel: 'GCE',
  sa1: 'SA1', sa2: 'SA2', eoy: 'SA2', eye: 'SA2', mye: 'MYE', midyear: 'MYE',
  promo: 'Promo', promos: 'Promo', promotional: 'Promo', specimen: 'Specimen',
  // Named so they are recognised and refused: the inbox has no spelling for them.
  wa: 'WA', wa1: 'WA', wa2: 'WA', wa3: 'WA', ca1: 'CA', ca2: 'CA',
};
const BOT_EXAM: Record<string, string> = {
  PRELIM: 'Prelim', GCE: 'GCE', TYS: 'GCE', SA1: 'SA1', SA2: 'SA2', EOY: 'SA2', MYE: 'MYE',
  PROMO: 'Promo', SPECIMEN: 'Specimen', WA1: 'WA', WA2: 'WA', WA3: 'WA', CA1: 'CA', CA2: 'CA',
};
const BOT_LEVEL: Record<string, string> = { AM: 'AM', EM: 'EM', H2: 'JC2', H1: 'JC2_H1' };
const LEVEL_FROM_SUBJECT: Record<string, string> = { 'A Math': 'AM', 'E Math': 'EM', 'H2 Math': 'JC2', 'H1 Math': 'JC2_H1' };

/** The school table — a twin of the bot's lib/paper-key.js SCHOOL_ALIASES (the
 *  maths bank's `questions.school` spellings). Science spellings come from the
 *  families below. Adrian's short forms of 5 Oct 2026 are in it. */
export const SCHOOL_ALIASES: Record<string, string> = {
  'hua yi': 'Hua Yi', huayi: 'Hua Yi', hyss: 'Hua Yi',
  xinmin: 'Xinmin', xmss: 'Xinmin', xms: 'Xinmin',
  'acs barker': 'Anglo Chinese School (Barker Road)', 'acs barker road': 'Anglo Chinese School (Barker Road)', acsbr: 'Anglo Chinese School (Barker Road)',
  'acs i': 'ACSI (IP)', acsi: 'ACSI (IP)', 'acs independent': 'ACSI (IP)',
  kranji: 'Kranji', 'ahmad ibrahim': 'Ahmad Ibrahim', beatty: 'Beatty',
  presbyterian: 'Presbyterian High', 'presbyterian high': 'Presbyterian High',
  'chung cheng yishun': 'Chung Cheng High (Yishun)', cchy: 'Chung Cheng High (Yishun)',
  'chung cheng main': 'Chung Cheng High (Main)', cchm: 'Chung Cheng High (Main)', cchms: 'Chung Cheng High (Main)',
  'tanjong katong': 'Tanjong Katong', tkss: 'Tanjong Katong',
  'tanjong katong girls': 'Tanjong Katong Girls', tkgs: 'Tanjong Katong Girls',
  fairfield: 'Fairfield Methodist', 'fairfield methodist': 'Fairfield Methodist',
  'geylang methodist': 'Geylang Methodist', 'anglican high': 'Anglican High',
  crescent: 'Crescent Girls', 'crescent girls': 'Crescent Girls',
  'methodist girls': 'Methodist Girls', mgs: 'Methodist Girls',
  'nanyang girls': 'Nanyang Girls', nygh: 'Nanyang Girls',
  cedar: 'Cedar Girls', 'cedar girls': 'Cedar Girls',
  'catholic high': 'Catholic High', 'st gabriel': 'St Gabriel', 'saint gabriel': 'St Gabriel',
  'gan eng seng': 'Gan Eng Seng', ges: 'Gan Eng Seng',
  'ngee ann': 'Ngee Ann', 'bukit merah': 'Bukit Merah', 'bukit view': 'Bukit View',
  'bedok view': 'Bedok View', 'north vista': 'North Vista', 'ang mo kio': 'Ang Mo Kio', zhonghua: 'Zhonghua',
  peicai: 'Peicai', 'nan chiau': 'Nan Chiau', 'chij katong': 'CHIJ Katong Convent', 'katong convent': 'CHIJ Katong Convent',
  'raffles girls': 'Raffles Girls', rgs: 'Raffles Girls', queenstown: 'Queenstown',
  nvss: 'North Vista',   // NVSS: Adrian's answer to the 🏫 question, 5 Oct 2026 10:06 SGT
  // The rest of the bot's table (lib/paper-key.js), so the two never disagree.
  'anglo chinese school barker road': 'Anglo Chinese School (Barker Road)', kss: 'Kranji', aiss: 'Ahmad Ibrahim', bsss: 'Beatty',
  phss: 'Presbyterian High', 'chung cheng high main': 'Chung Cheng High (Main)', 'chung cheng high school main': 'Chung Cheng High (Main)',
  fmss: 'Fairfield Methodist', gmss: 'Geylang Methodist', ahss: 'Anglican High', cgss: 'Crescent Girls', chss: 'Catholic High',
  gess: 'Gan Eng Seng', nass: 'Ngee Ann', bmss: 'Bukit Merah', bvss: 'Bukit View', amkss: 'Ang Mo Kio', zhss: 'Zhonghua',
  pcss: 'Peicai', nchs: 'Nan Chiau', mi: 'MI',
  // Adrian, 5 Oct 2026: the short forms his students type.
  sjc: 'CHIJ St Joseph', 'chij sjc': 'CHIJ St Joseph', 'chij st joseph': 'CHIJ St Joseph', 'chij st josephs': 'CHIJ St Joseph',
  sji: 'St Josephs Institution', 'st josephs institution': 'St Josephs Institution', 'st joseph institution': 'St Josephs Institution',
  plmgs: 'Paya Lebar Methodist Girls', 'paya lebar methodist girls': 'Paya Lebar Methodist Girls', 'paya lebar mgs': 'Paya Lebar Methodist Girls',
  scss: 'Singapore Chinese Girls School', scgs: 'Singapore Chinese Girls School', 'singapore chinese girls': 'Singapore Chinese Girls School',
  ri: 'RI', rjc: 'RI', hci: 'HCI', njc: 'NJC', nyjc: 'NYJC', tjc: 'TJC', vjc: 'VJC', acjc: 'ACJC',
  cjc: 'CJC', sajc: 'SAJC', ejc: 'EJC', ajc: 'AJC', mjc: 'MJC', pjc: 'PJC', yjc: 'YJC', jjc: 'JJC',
  srjc: 'SRJC', tmjc: 'TMJC', yijc: 'YIJC', asrjc: 'ASRJC', rvhs: 'RVHS', dhs: 'DHS',
};

/** One school, every spelling the two banks use, and the spelling each bank files new
 *  papers under (checked against `questions.school` in both projects, 5 Oct 2026). */
const FAMILIES: Array<{ math: string; science: string; also: string[] }> = [
  { math: 'CHIJ St Joseph', science: 'CHIJ St Josephs Convent', also: ['CHIJ St Joseph Convent', "CHIJ St Joseph's Convent"] },
  { math: 'St Josephs Institution', science: "St Joseph's Institution", also: ['St Joseph Institute', "Saint Joseph's Institution"] },
  { math: 'Tanjong Katong Girls', science: 'Tanjong Katong Girls', also: ['Tanjong Katong Girls School', "Tanjong Katong Girls' School"] },
  { math: 'Tanjong Katong', science: 'Tanjong Katong', also: ['Tanjong Katong Secondary'] },
  { math: 'Xinmin', science: 'Xinmin', also: ['Xinmin Secondary School', 'Xinmin Secondary'] },
  { math: 'Gan Eng Seng', science: 'Gan Eng Seng', also: ['Gan Eng Seng School'] },
  { math: 'Paya Lebar Methodist Girls', science: 'Paya Lebar Methodist Girls', also: ['Paya Lebar Methodist Girls School', "Paya Lebar Methodist Girls' School (Secondary)", 'Paya Lebar MGS'] },
  { math: 'Singapore Chinese Girls School', science: 'Singapore Chinese Girls School', also: ["Singapore Chinese Girls' School", 'SCGS (IP)'] },
  { math: 'Queenstown', science: 'Queenstown', also: ['Queenstown Secondary School', 'Queenstown Secondary'] },
];
const squash = (s: string) => norm(s).replace(/\s+/g, '');
const FAMILY_OF = new Map<string, number>();
FAMILIES.forEach((f, i) => { for (const s of [f.math, f.science, ...f.also]) FAMILY_OF.set(squash(s), i); });

// Spellings Adrian (or the extraction learner) taught since the code was written: the
// active `extraction_rules` alias rows, set by the store before each sweep. Each is a
// list of names for ONE school ("NVSS" = "North Vista Secondary School").
let LEARNED = new Map<string, string[]>();
/** Load the learned families (the store calls this; tests may too). */
export function setLearnedFamilies(families: string[][]): void {
  LEARNED = new Map();
  for (const f of families) for (const n of f) if (n) LEARNED.set(squash(n), f);
}
/** The names in an alias row's law text: every "quoted" name. Pure. */
export function namesInAliasRow(lawText: string | null | undefined): string[] {
  return [...String(lawText || '').matchAll(/"([^"]{2,80})"/g)].map(m => m[1].trim());
}

const GENERIC = /\b(secondary|school|sec|ss|the|junior|college|jc)\b/g;
// A trailing s comes off every longer word, so "St Theresa's" / "St Theresas" / "St Theresa"
// and "Girls'" / "Girls" compare equal.
const schoolCore = (s: string) => norm(s).replace(GENERIC, ' ').split(/\s+/).filter(Boolean)
  .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)).join(' ');

/** The identity of a school across spellings: its family, else its core words. Pure. */
export function schoolKey(s: string): string {
  const f = FAMILY_OF.get(squash(s));
  if (f !== undefined) return `family:${f}`;
  const l = LEARNED.get(squash(s));
  // A learned family keys on its longest member's core, so its spellings compare equal.
  return l ? schoolCore([...l].sort((a, b) => b.length - a.length)[0]) : schoolCore(s);
}

/** The spelling a subject's bank files a school under. Pure. */
export function spellingFor(school: string, subject: PaperIdentity['subject']): string {
  const f = FAMILY_OF.get(squash(school));
  if (f === undefined) return school;
  return subject === 'math' ? FAMILIES[f].math : FAMILIES[f].science;
}

/** The letters a school's short form is made of: "Gan Eng Seng School" → "ges". Pure. */
export function schoolInitials(s: string): string {
  return norm(String(s).replace(/\(.*?\)/g, ' ')).split(' ')
    .filter(w => w && !['of', 'the', 'and', 'school', 'secondary', 's'].includes(w))
    .map(w => w[0]).join('');
}

/**
 * Adrian, 5 Oct 2026: "aren't you able to guess from the abbreviations?" — a short
 * form is matched to a bank school whose initials fit (exactly, or with the
 * trailing S / SS of "School" / "Secondary School"), ONLY when exactly one school
 * fits. Spellings of one school count once. Pure.
 */
export function guessSchool(short: string, schools: string[]): string | null {
  const a = norm(short).replace(/\s+/g, '');
  if (a.length < 2 || a.length > 6) return null;
  const fits = new Map<string, string>();
  for (const s of schools) {
    if (!s || s.toUpperCase() === 'GCE') continue;
    const i = schoolInitials(s);
    if (i.length < 2) continue;
    if (a === i || a === `${i}s` || a === `${i}ss`) {
      const k = schoolKey(s);
      if (!fits.has(k)) fits.set(k, s);
    }
  }
  return fits.size === 1 ? [...fits.values()][0] : null;
}

const NOISE = new Set([
  'paper', 'papers', 'pp', 'math', 'maths', 'mathematics', 'exam', 'exams', 'test', 'marked', 'scan', 'scanned', 'pdf',
  'copy', 'final', 'sec', 'secondary', 'school', 'year', 'yr', 'the', 'and', 'of', 'for', 'with', 'level', 'o', 'a',
  'am', 'em', 'amath', 'emath', 'h1', 'h2', 'jc1', 'jc2', 's3', 's4', 'sec4', 'sec3', 'express', 'question', 'questions',
  'chem', 'chemistry', 'phy', 'phys', 'physics', 'bio', 'biology', 'science', 'sci', 'pure', 'combined', 'cs',
  'additional', 'elementary', 'ten', 'series', 'sch', 'gcse', 'olvl', 'lvl', 'tys', 'jc', 'jc1', 'add', 'on', 'to',
  'this', 'previous', 'submitted', 'i', 'did', 'very', 'long', 'time', 'ago', 'page',
]);

type SchoolResult = { school: string | null; short?: string };

/** A word that looks like a school's short form (SJC, TKGS, GES), not a name. */
const shortish = (t: string) => t.length >= 3 && t.length <= 5 && (t.match(/[aeiou]/g) ?? []).length <= 1;

/**
 * Name a school from words — typed (`printed=false`) or read off the page
 * (`printed=true`). Typed words: the alias table, the families, or the ONE bank
 * school whose initials fit a short form — never Title-Cased, so a student's name
 * can never become a school. Printed words may also name a school the bank has
 * not seen (it is the school's own print, not a name typed by the student). Pure.
 */
export function resolveSchool(words: string, schools: string[], printed = false): SchoolResult {
  const left = norm(words).split(' ').filter(t => t && !NOISE.has(t) && !/^\d+$/.test(t));
  const text = left.join(' ');
  if (!text) return { school: null };
  if (SCHOOL_ALIASES[text]) return { school: SCHOOL_ALIASES[text] };
  const fam = FAMILY_OF.get(squash(text));
  if (fam !== undefined) return { school: FAMILIES[fam].math };
  const learned = LEARNED.get(squash(text)) ?? LEARNED.get(squash(left.join('')));
  if (learned) {
    // The spelling the bank already uses for this school, else the fullest name taught.
    const inBank = schools.find(s => learned.some(n => schoolCore(n) === schoolCore(s)));
    return { school: inBank ?? [...learned].sort((a, b) => b.length - a.length)[0].replace(/\b(secondary\s+school|secondary|school)\b/gi, ' ').replace(/\s+/g, ' ').trim() };
  }
  const core = schoolCore(text);
  const bank = schools.find(s => s && schoolCore(s) === core);
  if (bank) return { school: bank };
  // A known name inside longer typed words ("rainie sjc", "xinmin sec") — the LONGEST
  // alias span wins, and never when a word that changes the school sits next to it
  // ("tanjong katong" + "girls" is another school).
  const CHANGES = new Set(['girls', 'boys', 'high', 'convent', 'institution', 'methodist', 'primary']);
  for (let n = Math.min(4, left.length); n >= 1; n--) {
    for (let i = 0; i + n <= left.length; i++) {
      const span = left.slice(i, i + n).join(' ');
      const hit = SCHOOL_ALIASES[span];
      if (!hit || span.replace(/ /g, '').length < 3) continue;
      if (CHANGES.has(left[i + n] ?? '') || CHANGES.has(left[i - 1] ?? '')) continue;
      return { school: hit };
    }
  }
  for (const t of left) {
    const l = LEARNED.get(squash(t));
    if (l && t.length >= 3) return resolveSchool(t, schools, printed);
  }
  // A short form: the ONE bank school whose initials fit.
  const guesses = new Set<string>();
  let unplaced: string | undefined;
  for (const t of left.filter(shortish)) {
    const g = guessSchool(t, schools);
    if (g) guesses.add(g); else unplaced ??= t;
  }
  if (guesses.size === 1) return { school: [...guesses][0] };
  // The school's own print may name a school the banks have not seen yet — but a bare
  // printed short form ("SGSS") is not a name: it is asked about, and the typed name fills.
  if (!printed || left.length > 6 || (left.length === 1 && shortish(left[0]))) return { school: null, short: unplaced?.toUpperCase() };
  const raw = String(words).replace(/\b(secondary\s+school|secondary|school)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const titled = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\bChij\b/g, 'CHIJ') : raw;
  return { school: titled || null };
}

/** Science level from the run's subject, the typed name and a printed syllabus code. */
function scienceLevel(subject: string, name: string, rj: Obj, code?: string | null): string | null {
  const base = subject === 'chemistry' ? 'CHEM' : subject === 'physics' ? 'PHYS' : subject === 'biology' ? 'BIO' : null;
  if (!base) return null;
  const n = norm(name);
  if (/\b(s3|sec 3|sec3)\b/.test(n)) return `S3_${base}`;
  const combinedCode = /\b50(7[678]|8[678])\b|\b510[567]\b/.test(String(code || ''));
  const combined = combinedCode || rj.science_track === 'combined' || /\b(combined|cs|sci)\b/.test(n);
  return combined ? `CS_${base}` : base;
}

type Fields = { level: string | null; year: number | null; paper: number | null; exam: string | null; school: string | null; short?: string };

/** Read the typed paper name (student's name stripped). */
function fieldsFromName(name: string, studentName: string | null | undefined, presetLevel: string | null, schools: string[]): Fields {
  const drop = new Set(norm(studentName).split(' ').filter(t => t.length >= 2));
  const tokens = norm(name).split(' ').filter(Boolean).filter(t => !drop.has(t));
  const joined = tokens.join(' ');
  const yearTok = tokens.find(t => /^(19|20)\d\d$/.test(t));
  const pm = joined.match(/\b(?:p|pp|paper)\s*([1-6])\b/);
  let exam: string | null = null;
  for (const t of tokens) if (EXAM_TOKENS[t]) { exam = EXAM_TOKENS[t]; break; }
  if (!exam && /\b(?:[oa] ?level|[oa] ?lvl|olvl)\b/.test(joined)) exam = 'GCE';
  let level = presetLevel;
  if (!level) {
    for (const t of tokens) { const l = ({ am: 'AM', amath: 'AM', em: 'EM', emath: 'EM', h2: 'JC2', jc2: 'JC2', h1: 'JC2_H1' } as Record<string, string>)[t]; if (l) { level = l; break; } }
    if (!level && /\ba math\b/.test(joined)) level = 'AM';
    if (!level && /\be math\b/.test(joined)) level = 'EM';
  }
  const left = tokens.filter(t => !EXAM_TOKENS[t] && !/^p{1,2}[1-6]$/.test(t) && t.length >= 2).join(' ');
  const sr: SchoolResult = exam === 'GCE' || exam === 'Specimen' ? { school: 'GCE' } : resolveSchool(left, schools);
  return { level, year: yearTok ? Number(yearTok) : null, paper: pm ? Number(pm[1]) : null, exam, school: sr.school, short: sr.short };
}

/** What a printed-page reading contributes. */
function fieldsFromReading(r: PaperReading, subject: string, name: string, rj: Obj, schools: string[]): Fields {
  const code = String(r.syllabus_code || '');
  let level: string | null = null;
  if (subject === 'math') {
    level = LEVEL_FROM_SUBJECT[String(r.subject || '')] ?? null;
    const c = code.match(/\b(\d{4})\b/)?.[1];
    if (c) level = ({ 4038: 'AM', 4047: 'AM', 4049: 'AM', 4016: 'EM', 4048: 'EM', 4052: 'EM', 9740: 'JC2', 9758: 'JC2', 8864: 'JC2_H1', 8865: 'JC2_H1' } as Record<string, string>)[c] ?? level;
    // A Normal (Academic) paper: "4NA", "N4NA", "(NA)", 4045 on the cover.
    if ((level === 'EM' || level === 'AM') && /N4\s?NA|\b4\s?NA\b|\(NA\)|\bN\(A\)|\b4045\b/i.test(`${code} ${r.subject ?? ''} ${r.exam ?? ''}`)) level = `${level}_NA`;
  } else {
    level = scienceLevel(subject, name, rj, code);
  }
  let exam: string | null = null;
  for (const t of norm(r.exam).split(' ')) if (EXAM_TOKENS[t]) { exam = EXAM_TOKENS[t]; break; }
  if (!exam && /\b(o|a) ?level|cambridge|seab|gce\b/i.test(String(r.exam || ''))) exam = 'GCE';
  // A cover that prints only a short form ("SGSS") does not name the school — the typed
  // name does; anything fuller printed on the page beats what was typed.
  const printedWords = norm(r.school).split(' ').filter(w => w && !NOISE.has(w));
  const bareShort = printedWords.length === 1 && shortish(printedWords[0]) && !SCHOOL_ALIASES[printedWords[0]];
  const sr: SchoolResult = exam === 'GCE' || exam === 'Specimen' ? { school: 'GCE' }
    : bareShort ? { school: null, short: printedWords[0].toUpperCase() }
    : resolveSchool(String(r.school || ''), schools, true);
  const paper = Number(r.paper) || Number(code.match(/\/0?([1-6])\b/)?.[1]) || null;
  return { level, year: Number(r.year) || null, paper, exam, school: sr.school, short: sr.short };
}

export type IdentityResult =
  | { ok: true; id: PaperIdentity; from: 'name' | 'print' }
  | { ok: false; reason: SkipReason; detail: string; missing?: string[]; short?: string; readable?: boolean };

/**
 * Which paper a run is, or the reason it cannot be named. The typed side: maths
 * reads the bot's `paper_match.parsed` (student's name stripped, a printed SEAB
 * code already read), gaps from the typed name or `paper_subject`; science reads
 * the typed name. With `reading` (what the printed pages say), print beats a
 * clashing typed value and the typed name fills gaps. `schools` = the banks'
 * school names, for the short-form guesser. Pure.
 */
export type SchoolList = string[] | ((family: 'maths' | 'science') => string[]);

export function paperIdentity(run: HandinRun, ctx: { schools?: SchoolList; reading?: PaperReading | null } = {}): IdentityResult {
  const name = String(run.paper_name || '');
  if (OWN_CONTENT.test(name)) return { ok: false, reason: 'own-sheet', detail: 'our own sheet, not a school paper' };
  const rj = obj(run.result_json);
  const subject = String(run.subject || rj.subject || 'math');
  const schools = typeof ctx.schools === 'function' ? ctx.schools(subject === 'math' ? 'maths' : 'science') : (ctx.schools ?? []);
  if (/cambridge/i.test(name)) return { ok: false, reason: 'unknown-paper', detail: 'a Cambridge paper, not a SEAB or school paper' };
  if (subject !== 'math' && subject !== 'chemistry' && subject !== 'physics' && subject !== 'biology') {
    return { ok: false, reason: 'unknown-paper', detail: `subject "${subject}" has no extraction lane here` };
  }

  let typed: Fields;
  if (subject === 'math') {
    const pm = obj(rj.paper_match);
    const p = obj(pm.parsed);
    const fromName = fieldsFromName(name, run.student_name, LEVEL_FROM_SUBJECT[String(run.paper_subject || '')] ?? null, schools);
    const exam = BOT_EXAM[String(p.exam || '').toUpperCase()] || null;
    let school: string | null = exam === 'GCE' || exam === 'Specimen' ? 'GCE' : (p.school ? String(p.school) : null);
    const reasons = arr(pm.reasons).map(String);
    if (school && school !== 'GCE' && (reasons.includes('school-unverified') || reasons.includes('school-from-token'))) {
      // The bot Title-Cased a leftover it did not know, or found an alias INSIDE a
      // longer name ("tanjong katong girls" → Tanjong Katong) — only the typed name's
      // own resolution may name it here.
      school = fromName.school;
    } else if (school && school !== 'GCE') {
      school = SCHOOL_ALIASES[norm(school)] ?? school;
    }
    typed = {
      level: BOT_LEVEL[String(p.level || '')] || fromName.level,
      year: Number(p.year) || fromName.year,
      paper: Number(p.paper) || fromName.paper,
      exam: exam || fromName.exam,
      school: school || ((exam || fromName.exam) === 'GCE' ? 'GCE' : fromName.school),
      short: fromName.short,
    };
  } else {
    typed = fieldsFromName(name, run.student_name, scienceLevel(subject, name, rj), schools);
  }

  let f = typed;
  let from: 'name' | 'print' = 'name';
  const r = ctx.reading;
  if (r && (r.confidence ?? 1) >= 0.6) {
    const printed = fieldsFromReading(r, subject, name, rj, schools);
    const pick = <K extends keyof Fields>(k: K) => (printed[k] ?? typed[k]) as Fields[K];
    // Print beats a clashing typed value — the school too, unless the cover printed
    // only a short form ("SGSS"), which then names nothing and the typed name stands.
    const school = printed.school ?? typed.school;
    f = { level: pick('level'), year: pick('year'), paper: pick('paper'), exam: pick('exam'), school, short: school ? undefined : (printed.short ?? typed.short) };
    if (printed.year || printed.exam || printed.school || printed.paper) from = 'print';
  }
  if (f.exam === 'GCE' || f.exam === 'Specimen') f = { ...f, school: 'GCE', short: undefined };

  const missing = [!f.level && 'level', !f.year && 'year', !f.paper && 'paper number', !f.exam && 'exam type', !f.school && 'school'].filter(Boolean) as string[];
  if (missing.length) {
    const why = f.short && !f.school ? `the short form "${f.short}" fits no single school` : `"${name}" names no ${missing.join(', ')}`;
    return { ok: false, reason: 'unknown-paper', detail: r ? `${why} (printed pages read too)` : why, missing, short: f.school ? undefined : f.short, readable: !r };
  }
  if (f.exam === 'WA' || f.exam === 'CA') return { ok: false, reason: 'unknown-paper', detail: 'a WA / class test — the inbox files prelims, SA1/SA2, promos and GCE papers' };
  // A JC promo is the JC1 paper.
  const level = f.exam === 'Promo' && f.level === 'JC2' ? 'JC1' : f.level!;
  const school = f.school === 'GCE' ? 'GCE' : spellingFor(f.school!, subject as PaperIdentity['subject']);
  return { ok: true, id: { subject: subject as PaperIdentity['subject'], level, year: f.year!, school, examType: f.exam!, paper: f.paper! }, from };
}

/**
 * Did the MARKING already find these printed questions in the bank? (The bot's
 * fingerprint match: a trusted bank/library paper match or a bank allocation for
 * maths; a bank grounding for science.) Then the paper is held, whatever its name. Pure.
 */
export function matchedBankAtMarking(resultJson: unknown): boolean {
  const rj = obj(resultJson);
  const pm = obj(rj.paper_match);
  if (pm.trusted === true && ['bank', 'library'].includes(String(pm.source))) return true;
  if (obj(rj.bank_allocation).key) return true;
  const subject = String(rj.subject || '');
  if (subject && subject !== 'math' && obj(rj.grounding).source === 'bank') return true;
  return false;
}

// ── 3. the file name ─────────────────────────────────────────────────────────

/**
 * The inbox name for a paper — `CHEM PRELIM 2025 Queenstown Paper 2.pdf`,
 * `AM GCE 2024 Paper 1.pdf` — built by the book splitter's own `partFileName`
 * and READ BACK by the inbox's `parseSourceFilename`: a name that does not read
 * back to the same level, year, paper, exam and school is refused (null), never
 * sent under a name the fleet would file somewhere else. Never the student's name. Pure.
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

/** The same school across spellings ("Queenstown" / "Queenstown Secondary School",
 *  "Tanjong Katong Girls" / "Tanjong Katong Girls' School"). Pure. */
export function sameSchool(a: string, b: string): boolean {
  const x = schoolKey(a), y = schoolKey(b);
  return !!x && x === y;
}

type LineLike = Pick<IndexLine, 'levelCode' | 'year' | 'school' | 'paper' | 'status' | 'name'> & { questions?: number };

/** The index line that already holds this paper (banked, queued, held, …), if any. Pure. */
export function heldLine(id: PaperIdentity, lines: LineLike[]): LineLike | null {
  const hits = lines.filter(l => l.levelCode === id.level && l.year === id.year && sameSchool(l.school, id.school)
    && (l.paper === null || l.paper === String(id.paper)));
  if (!hits.length) return null;
  const rank = (l: LineLike) => (isBanked(l) ? 0 : 1);
  return hits.sort((a, b) => rank(a) - rank(b))[0];
}

/** Banked = the line says so, or the bank holds questions for it (a line can read
 *  "Skipped" when a re-sent copy was skipped as a duplicate of the banked paper). Pure. */
export function isBanked(l: LineLike): boolean {
  return l.status === 'banked' || l.status === 'older' || (l.questions ?? 0) > 0;
}

/** One identity string for de-duplicating hand-ins of the same paper. Pure. */
export function identityKey(id: Pick<PaperIdentity, 'level' | 'year' | 'school' | 'paper'>): string {
  return `${id.level}|${id.year}|${schoolKey(id.school)}|${id.paper}`;
}

// ── the decision ─────────────────────────────────────────────────────────────

export type HandoffSource =
  | { kind: 'pages'; pages: number[]; partial: boolean; printed: number; studentWork: boolean }
  | { kind: 'attached-pdf'; url: string };

export type SchemeSource = { kind: 'pdf'; url: string } | { kind: 'photos'; urls: string[] };

export type HandoffDecision =
  | { action: 'queue'; id: PaperIdentity; file: string; source: HandoffSource; scheme: SchemeSource | null; key: string; from: 'name' | 'print' }
  | { action: 'skip'; reason: SkipReason; detail: string; id?: PaperIdentity; file?: string; short?: string; readable?: boolean };

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

/** The photos a printed-page reading looks at: the covers first, then the first printed pages (≤ 3). Pure. */
export function readingPages(resultJson: unknown, max = 3): number[] {
  const rj = obj(resultJson);
  const pc = arr(rj.page_classification).map(obj);
  const covers = pc.filter(p => p.kind === 'cover').map(p => Number(p.photo_index));
  const printed = pc.filter(p => p.kind === 'question_paper' || p.kind === 'mixed').map(p => Number(p.photo_index));
  const photos = photoUrls(rj);
  const order = [...covers, ...printed].filter(i => Number.isInteger(i) && photos.has(i));
  const fallback = [...photos.keys()].sort((a, b) => a - b);
  return [...new Set(order.length ? order : fallback)].slice(0, max);
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
 * Which pages go: the clean printed pages when there are enough of them;
 * otherwise every printed question page as a PRIVATE student-work source;
 * otherwise nothing. Pure.
 */
export function chooseSource(resultJson: unknown, reading?: PaperReading | null): { ok: true; source: HandoffSource & { kind: 'pages' } } | { ok: false; reason: SkipReason; detail: string } {
  const photos = photoUrls(resultJson);
  // No page pre-pass on record: the reading of all the photos says which are printed
  // question pages. Unverified by a marking read, so always a private student-work source.
  if (lacksPageClassification(resultJson) && reading?.pages?.length) {
    const printed = reading.pages.filter(p => (p.kind === 'question_paper' || p.kind === 'mixed') && photos.has(p.photo))
      .map(p => p.photo).sort((a, b) => a - b);
    if (printed.length >= MIN_PRINTED_PAGES) return { ok: true, source: { kind: 'pages', pages: [...new Set(printed)], partial: false, printed: printed.length, studentWork: true } };
    return { ok: false, reason: printed.length ? 'too-few-printed-pages' : 'no-printed-pages', detail: `the photos read show ${printed.length} printed question page(s)` };
  }
  const pick = cleanPrintedPages(resultJson);
  const clean = pick.clean.filter(i => photos.has(i));
  const enough = enoughPages({ clean, printed: pick.printed });
  if (enough.ok) return { ok: true, source: { kind: 'pages', pages: clean, partial: enough.partial, printed: pick.printed, studentWork: false } };
  const printed = pick.printedPages.filter(i => photos.has(i));
  if (printed.length >= MIN_PRINTED_PAGES) {
    return { ok: true, source: { kind: 'pages', pages: printed, partial: printed.length < pick.printed, printed: pick.printed, studentWork: clean.length < printed.length } };
  }
  return { ok: false, reason: printed.length ? 'too-few-printed-pages' : 'no-printed-pages', detail: printed.length ? `only ${printed.length} printed page(s) photographed` : 'no printed question pages' };
}

/**
 * What to do with one run. `lines` = the library index; `seen` = identity keys
 * already sent; `schools` = the banks' school names; `reading` = what the printed
 * pages say, when the store has read them. Pure.
 */
export function decideHandoff(
  run: HandinRun,
  ctx: { lines: LineLike[]; seen: Set<string>; isOurs: (u: string) => boolean; schools?: SchoolList; reading?: PaperReading | null },
): HandoffDecision {
  if (run.superseded_by) return { action: 'skip', reason: 'superseded', detail: 'a later marking of the same hand-in exists' };
  const rj = obj(run.result_json);
  if (run.queue_status === 'queued' || run.queue_status === 'claimed' || !arr(rj.results).length) {
    return { action: 'skip', reason: 'not-marked', detail: 'not marked yet' };
  }
  const who = paperIdentity(run, { schools: ctx.schools, reading: ctx.reading });
  if (!who.ok) {
    if (who.reason === 'unknown-paper' && matchedBankAtMarking(rj)) return { action: 'skip', reason: 'in-bank', detail: 'the marking matched its printed questions to the bank' };
    return { action: 'skip', reason: who.reason, detail: who.detail, short: who.short, readable: who.readable };
  }
  const id = who.id;
  const file = handoffFileName(id);
  if (!file) return { action: 'skip', reason: 'unknown-paper', detail: 'the inbox could not read the paper\'s name back', id };
  if (namesStudent(file, run.student_name)) return { action: 'skip', reason: 'unknown-paper', detail: 'the paper\'s name would carry the student\'s name', id };
  const held = heldLine(id, ctx.lines);
  if (held) {
    const inBank = isBanked(held);
    return { action: 'skip', reason: inBank ? 'in-bank' : 'already-queued', detail: `${held.name} — ${inBank ? `${held.questions ?? ''} questions in the bank`.trim() : held.status}`, id, file };
  }
  if (matchedBankAtMarking(rj)) return { action: 'skip', reason: 'in-bank', detail: 'the marking matched its printed questions to the bank (filed under another spelling)', id, file };
  const key = identityKey(id);
  if (ctx.seen.has(key)) return { action: 'skip', reason: 'duplicate-handin', detail: 'another hand-in of this paper was sent', id, file };

  const scheme = attachedScheme(rj, ctx.isOurs);
  const paperPdf = attachedPaperPdf(rj, ctx.isOurs);
  if (paperPdf) return { action: 'queue', id, file, source: { kind: 'attached-pdf', url: paperPdf }, scheme, key, from: who.from };
  const src = chooseSource(rj, ctx.reading);
  if (!src.ok) return { action: 'skip', reason: src.reason, detail: src.detail, id, file };
  return { action: 'queue', id, file, source: src.source, scheme, key, from: who.from };
}

/** The queue row's note — run id and page numbers, never a name. Pure. */
export function handoffNote(runId: string, source: HandoffSource, today: string): string {
  if (source.kind === 'attached-pdf') return `from a student hand-in, the question paper PDF attached to the run (printed only), run ${runId}, ${today}`;
  const pages = source.pages.map(i => i + 1).join(', ');
  if (source.studentWork) {
    return `${STUDENT_WORK_TAG}: from a student hand-in, the printed question pages WITH the student's working on them (photos ${pages}), run ${runId}, ${today}. `
      + 'Transcribe ONLY the printed question text — ignore all handwriting. Never crop a figure from these pages: redraw it, or bank the question without it, flagged. '
      + 'Store no page image. The source is deleted when this paper is finished.'
      + (source.partial ? ` PARTIAL: ${source.pages.length} of ${source.printed} printed pages were photographed.` : '');
  }
  const partial = source.partial ? ` PARTIAL: ${source.pages.length} of ${source.printed} printed pages — the others carry the student's working and were left out; bank what is here.` : '';
  return `from a student hand-in, printed pages only (photos ${pages}), run ${runId}, ${today}.${partial}`;
}

/** Adrian's one line about short forms nobody could place. Pure. */
export function unknownSchoolsLine(shorts: Array<{ short: string; paper: string | null }>): string | null {
  const by = new Map<string, string[]>();
  for (const s of shorts) {
    const k = s.short.toUpperCase();
    if (!by.has(k)) by.set(k, []);
    if (s.paper && by.get(k)!.length < 2) by.get(k)!.push(`"${s.paper}"`);
  }
  if (!by.size) return null;
  const list = [...by.entries()].map(([k, ps]) => `${k}${ps.length ? ` (${ps.join(', ')})` : ''}`).join('; ');
  return `🏫 Which schools are these? Students typed: ${list}. Reply with the full names and I'll add them, so these papers can be banked.`;
}

/** Priority for the backfill: science Sec 4 first, then the levels handed in most, newest first. Pure. */
export function backfillOrder<T extends { run: HandinRun; level: string | null }>(items: T[], levelCounts: Map<string, number>): T[] {
  const sci4 = (l: string | null) => (l && /^(CHEM|PHYS|BIO|CS_)/.test(l) ? 0 : 1);
  return [...items].sort((a, b) => sci4(a.level) - sci4(b.level)
    || (levelCounts.get(b.level || '') ?? 0) - (levelCounts.get(a.level || '') ?? 0)
    || String(b.run.created_at || '').localeCompare(String(a.run.created_at || '')));
}

/** "2 queued · 40 in the bank · …" for the tick and the report. Pure. */
export function handoffSummary(counts: Partial<Record<string, number>>): string {
  const label: Record<string, string> = {
    queued: 'queued', 'in-bank': 'already in the bank', 'already-queued': 'already in the queue',
    'duplicate-handin': 'duplicate of another hand-in', 'no-printed-pages': 'no printed pages',
    'too-few-printed-pages': 'too few printed pages', 'unknown-paper': 'paper not known',
    'own-sheet': 'our own sheet', 'not-marked': 'not marked yet', superseded: 'superseded', failed: 'failed',
  };
  const parts = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${label[k] ?? k}`);
  return parts.length ? parts.join(' · ') : 'nothing to hand off';
}
