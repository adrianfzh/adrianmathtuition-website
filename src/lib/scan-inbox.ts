// The ScanSnap watcher's pure pieces (Adrian, 7 Sep 2026: "I'm currently
// scanning the papers and they appear in the ScanSnap folder in Dropbox. Able
// to automate: once scanned, put into the marking queue, then the process
// follows from there? Give a suitable name for the PDF by reading the cover
// page. For exam papers follow the naming convention; tag the student. For
// non-exam papers leave it alone.")
//
// The I/O lives in /api/cron/scan-inbox: list the scan folder, read the cover,
// name, tag, queue. Everything that decides is here and tested:
//   - `parseScanFilename`: a scan Adrian already named by hand ("joey am tys 2021
//     p2.pdf") is taken at its word — no cover read.
//   - `buildScanPaperName`: the convention from a cover reading —
//     "<first name> <am|em|h2|h1> <exam> [<school>] <year> p<n>", the way every
//     run so far is named ("rainie am tys 2022 p1", "eva em prelim sjc 2025 p1").
//   - `matchStudent`: the roster row for a name read off a cover.
//   - `isSettled`: a file still being written by the scanner is left for the
//     next tick.

export interface ScanEntry { name: string; path: string; size?: number | null; modified?: string | null }

/** What the cover-page reader returns (lib/scan-reader.ts asks for exactly this JSON). */
export interface CoverReading {
  /** A student's answered exam/practice script (handwriting on printed questions). */
  is_exam_script: boolean;
  /** Free text — why it is / is not one. */
  reason?: string | null;
  student_name?: string | null;
  /** The name the student goes by — "Tze Hin", "Kassandra" — the way Adrian names papers ("tze hin em tys 2022 p2"). */
  given_name?: string | null;
  subject?: 'A Math' | 'E Math' | 'H2 Math' | 'H1 Math' | 'Other' | null;
  /** tys = GCE past-year paper; prelim; practice set; test set; mye; eoy; wa; other */
  exam?: string | null;
  school?: string | null;
  year?: number | null;
  paper?: number | null;
  /** 0–1 */
  confidence?: number | null;
}

export interface RosterStudent { id: string; name: string; level?: string | null }

export type ScanDecision =
  | { kind: 'other'; reason: string }
  | { kind: 'exam'; paperName: string; student: RosterStudent | null; readName: string | null };

/** ScanSnap writes a file in chunks; only act once it has sat unchanged for a while. */
export function isSettled(entry: ScanEntry, now: Date, minAgeMs = 90_000): boolean {
  const t = Date.parse(String(entry.modified || ''));
  if (Number.isNaN(t)) return false;
  return now.getTime() - t >= minAgeMs;
}

export function isPdf(name: string): boolean {
  return /\.pdf$/i.test(name);
}

const SUBJECT_CODES: Record<string, string> = { 'a math': 'am', 'e math': 'em', 'h2 math': 'h2', 'h1 math': 'h1' };
const EXAM_WORDS: Array<[RegExp, string]> = [
  [/\b(tys|gce|o ?level|a ?level|past ?year)\b/i, 'tys'],
  [/\bprelim/i, 'prelim'],
  [/\bpractice set\b/i, 'practice set'],
  [/\btest set\b/i, 'test set'],
  [/\b(mye|mid[- ]year|sa1)\b/i, 'mye'],
  [/\b(eoy|end[- ]of[- ]year|sa2)\b/i, 'eoy'],
  [/\bwa\s?(\d)\b/i, 'wa'],
  [/\bpromo/i, 'promo'],
  [/\bmock\b/i, 'mock'],
];

function firstName(full: string | null | undefined): string {
  const t = String(full || '').trim().toLowerCase().replace(/[^a-z' -]/g, ' ').split(/\s+/).filter(Boolean);
  return t[0] || '';
}

/** "Tze Hin" → "tze hin"; a given name keeps all its words, a full name falls back to its first. */
function callName(reading: CoverReading, override?: string | null): string {
  const given = String(override || reading.given_name || '').trim().toLowerCase().replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim();
  if (given && given.split(' ').length <= 2) return given;
  return firstName(override || reading.given_name || reading.student_name);
}

function schoolCode(school: string | null | undefined): string {
  const s = String(school || '').trim().toLowerCase();
  if (!s) return '';
  // "St. Joseph's Institution" → "sji", "Nanyang Girls' High School" → "nygh":
  // an already-short code stays as it is; a long name becomes its initials.
  const words = s.replace(/['’]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !['the', 'of', 'and'].includes(w));
  if (words.length === 1 && words[0].length <= 6) return words[0];
  if (words.length <= 2 && words.join(' ').length <= 12) return words.join(' ');
  return words.map(w => w[0]).join('');
}

/**
 * The convention name, or null when the reading is too thin to name a paper
 * (no subject, or no year and no exam word) — the run is still queued, under
 * the scan's own name, and Adrian renames it on the desk.
 */
export function buildScanPaperName(reading: CoverReading, givenNameOverride?: string | null): string | null {
  const first = callName(reading, givenNameOverride);
  const subj = reading.subject ? SUBJECT_CODES[reading.subject.toLowerCase()] : undefined;
  if (!first || !subj) return null;
  const examRaw = String(reading.exam || '').trim();
  const exam = EXAM_WORDS.find(([re]) => re.test(examRaw))?.[1] ?? (examRaw ? examRaw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const year = reading.year && reading.year >= 2000 && reading.year <= 2100 ? String(reading.year) : '';
  const paper = reading.paper && reading.paper >= 1 && reading.paper <= 4 ? `p${reading.paper}` : '';
  if (!exam && !year) return null;
  const school = exam === 'prelim' || exam === 'mye' || exam === 'eoy' || exam === 'wa' || exam === 'promo' ? schoolCode(reading.school) : '';
  // "WA3" keeps its number glued ("wa3"); "Practice Set 3" keeps it as a word ("practice set 3").
  const waNo = exam === 'wa' ? (examRaw.match(/\bwa\s?(\d)\b/i)?.[1] ?? '') : '';
  const setNo = exam === 'practice set' || exam === 'test set' ? (examRaw.match(/set\s*(\d+)\b/i)?.[1] ?? '') : '';
  return [first, subj, exam + waNo, setNo, school, year, paper].filter(Boolean).join(' ');
}

/**
 * A file Adrian named himself: "<first> <am|em|h2|h1> …" with a paper token
 * somewhere ("p1", "paper 2") or a year. Returned lower-cased without the
 * extension; anything else (the scanner's "06092026.pdf") is null.
 */
export function parseScanFilename(name: string): { paperName: string; firstName: string; name: string } | null {
  const stem = String(name || '').replace(/\.pdf$/i, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const m = stem.match(/^([a-z][a-z' -]{1,30}?)\s+(am|em|h2|h1|jc1|jc2)\b/);
  if (!m) return null;
  if (!/\b(p[1-4]|paper ?[1-4]|20\d\d)\b/.test(stem)) return null;
  // `name` is the whole phrase before the subject code ("gavin woon") — two
  // words settle a first name two students share (lib/auto-tag.ts).
  const phrase = m[1].trim();
  return { paperName: stem, firstName: phrase.split(' ')[0], name: phrase };
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The roster student a read name belongs to: the whole name, else all of the
 * read tokens inside one roster name, else a first name that is unique on the
 * roster. Two plausible students → null (the desk's "Needs a student" lane is
 * the safe place for a guess).
 */
export function matchStudent(readName: string | null | undefined, roster: RosterStudent[]): RosterStudent | null {
  const q = norm(readName || '');
  if (!q) return null;
  const rows = roster.map(r => ({ r, n: norm(r.name) }));
  const exact = rows.filter(x => x.n === q);
  if (exact.length === 1) return exact[0].r;
  const qTokens = q.split(' ').filter(t => t.length >= 2);
  if (!qTokens.length) return null;
  const contains = rows.filter(x => qTokens.every(t => x.n.split(' ').includes(t)));
  if (contains.length === 1) return contains[0].r;
  // A single read name ("Rainie", "Sijia") counts only when it appears in
  // exactly ONE roster name anywhere — roster names sometimes lead with the
  // surname ("Tan Sijia"), and "Isabelle" must not pick Isabelle Toh while an
  // Eva Isabelle Wong is also on the roster.
  const anyToken = rows.filter(x => x.n.split(' ').includes(qTokens[0]));
  if (anyToken.length === 1) return anyToken[0].r;
  return null;
}

/** The Telegram line for a processed scan. */
export function scanLine(d: { paperName: string | null; fileName: string; student: RosterStudent | null; readName: string | null; pages: number; queued: boolean; etaMinutes?: number | null }): string {
  const name = d.paperName || d.fileName.replace(/\.pdf$/i, '');
  const who = d.student ? d.student.name : d.readName ? `couldn't tell whose — cover reads "${d.readName}"` : 'no student name found';
  const tail = d.queued ? `queued for marking${d.etaMinutes ? ` (~${d.etaMinutes} min)` : ''}` : 'NOT queued';
  return `📠 Scan: ${name} — ${who} · ${d.pages} page${d.pages === 1 ? '' : 's'} · ${tail}${d.student ? '' : ' · tag the student on the desk'}`;
}
