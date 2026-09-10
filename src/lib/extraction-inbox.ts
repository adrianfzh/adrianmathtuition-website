// The extraction inbox's pure pieces (Adrian, 8 Sep 2026: "go ahead, build the
// watcher and queue").
//
// Until now the extraction fleet read source papers from the iCloud folder
// ~/Desktop/AdrianMath/papers/ and claimed one by RENAMING it — which is not a
// lock, so a quarter of the fleet law grew into stale-claim heuristics, liveness
// checks, marker files and a "resurrection" pre-check for files iCloud re-creates.
// The replacement: a paper dropped into the Dropbox inbox folder is uploaded to
// the private `paper-library` bucket and enqueued as a `paper_library` row
// (kind 'source', status 'queued'); a worker claims a ROW (claim_extraction_paper,
// FOR UPDATE SKIP LOCKED, 3-hour lease) and downloads the file by storage path.
//
// The I/O lives in /api/cron/extraction-inbox (the watcher) and
// /api/admin/extraction-queue (the door workers claim through). Everything that
// DECIDES is here and tested:
//   - `parseSourceFilename`: the fleet law's own filename conventions —
//     "AM PRELIM 2025 Bedok South.pdf", "JC2 MY 2012 SAJC.docx",
//     "EM S4 PRELIM (NA) 2024 Pierce.pdf" — into level / year / school / exam /
//     paper, with the law's level precedence and its "store the school EXACTLY
//     as the filename spells it" rule (RI stays RI).
//   - `sourceKey` / `sourceStoragePath`: where a source lands in the bucket and
//     how its library row is keyed, so a re-supplied paper with the same name
//     but different bytes is a new version, not an overwrite.
//   - `decideInboxFile`: what one tick does with one file, given what the
//     ledger already knows (idempotent — a crash between upload, insert and the
//     Dropbox move is repaired by the next tick, never repeated).

export interface InboxEntry { name: string; path: string; size?: number | null; modified?: string | null }

export type ParsedSourceName =
  | { ok: true; level: string; year: number; school: string; examType: string | null; paper: string; ext: 'docx' | 'pdf'; stem: string }
  | { ok: false; reason: string; stem: string; ext: 'docx' | 'pdf' | null };

/** The inbox takes Word and PDF only; anything else is left where it is. */
export function isSourceFile(name: string): boolean {
  return /\.(docx|pdf)$/i.test(name) && !/^~\$/.test(name) && !/^\./.test(name);
}

/** Dropbox writes a file in chunks; only act once it has sat unchanged for a while. */
export function isSettled(entry: InboxEntry, now: Date, minAgeMs = 90_000): boolean {
  const t = Date.parse(String(entry.modified || ''));
  if (Number.isNaN(t)) return false;
  return now.getTime() - t >= minAgeMs;
}

// The fleet law's level order, first match wins: S3+(NT)/4046 → S3_EM_NT (tested
// first of all); S3+(NA) → S3_EM_NA; AM+(NA) → AM_NA; bare (NA)/4045 → EM_NA;
// S1; S2; S3+AM → S3_AM; S3 (+EM) → S3_EM; JC1; JC2; AM; EM. Never bare 'JC'.
const LEVEL_RULES: Array<[RegExp, string]> = [
  [/\bS3\b[\s\S]*(\(NT\)|\b4046\b)|(\(NT\)|\b4046\b)[\s\S]*\bS3\b/i, 'S3_EM_NT'],
  [/\bS3\b[\s\S]*\(NA\)|\(NA\)[\s\S]*\bS3\b/i, 'S3_EM_NA'],
  [/\bAM\b[\s\S]*\(NA\)|\(NA\)[\s\S]*\bAM\b/i, 'AM_NA'],
  [/\(NA\)|\b4045\b/i, 'EM_NA'],
  [/\bS1\b/i, 'S1'],
  [/\bS2\b/i, 'S2'],
  [/\bS3\b[\s\S]*\bAM\b|\bAM\b[\s\S]*\bS3\b/i, 'S3_AM'],
  [/\bS3\b/i, 'S3_EM'],
  [/\bJC1\b/i, 'JC1'],
  [/\bJC2\b/i, 'JC2'],
  // The A-Level TYS names its subject, not a JC year: "A Level H2 Math TYS 2025"
  // is the JC2 national paper (bot lib/paper-key BANK_LEVEL: H2 → JC2, H1 → JC2_H1).
  [/\bH2\b/i, 'JC2'],
  [/\bH1\b/i, 'JC2_H1'],
  [/\bAM\b/i, 'AM'],
  [/\bEM\b/i, 'EM'],
];

// Exam tokens → the bank's exam_type spellings. Specimen is tested before GCE:
// "AM GCE 2021 Specimen P1" is the SEAB specimen paper, never the live GCE one.
const EXAM_RULES: Array<[RegExp, string]> = [
  [/\bSPECIMEN\b/i, 'Specimen'],
  [/\bGCE\b/i, 'GCE'],
  [/\bPRELIMS?\b/i, 'Prelim'],
  [/\bPROMO(TIONAL)?\b/i, 'Promo'],
  [/\bMYE\b/i, 'MYE'],
  [/\bMY\b/i, 'MY'],
  [/\bSA1\b/i, 'SA1'],
  [/\bSA2\b/i, 'SA2'],
  [/\bEOY\b/i, 'SA2'],
];

// A national paper is filed under school 'GCE' in the bank, whatever the file
// calls it — "TYS", "O Level", "A Level" and the SEAB specimen papers all name
// the same thing (bot lib/paper-key.js: "TYS 2021 IS the 2021 national paper").
// Read by the parser (exam + school) and by the marker's school rule alike.
const NATIONAL = /\b(gce|tys|ten[\s-]?year|[oa][\s-]?levels?)\b/i;

function detectLevel(stem: string): string | null {
  for (const [re, level] of LEVEL_RULES) if (re.test(stem)) return level;
  return null;
}

function detectExam(stem: string): { examType: string | null; token: RegExp | null } {
  for (const [re, examType] of EXAM_RULES) if (re.test(stem)) return { examType, token: re };
  return { examType: null, token: null };
}

/**
 * "AM PRELIM 2025 Bedok South.pdf" → { level:'AM', year:2025, school:'Bedok South',
 * examType:'Prelim', paper:'all' }. The school is whatever the name still says once
 * the level, exam, year and paper tokens are removed — spelled EXACTLY as staged.
 * A name the fleet law itself could not file (no level, no year, no school left)
 * comes back ok:false with the reason, and the watcher flags the row for a human
 * to rename rather than guessing.
 */
export function parseSourceFilename(name: string): ParsedSourceName {
  const extMatch = String(name).match(/\.(docx|pdf)$/i);
  const ext = extMatch ? (extMatch[1].toLowerCase() as 'docx' | 'pdf') : null;
  const stem = String(name).replace(/\.(docx|pdf)$/i, '').replace(/\s+/g, ' ').trim();
  if (!ext) return { ok: false, reason: 'not a .docx or .pdf', stem, ext: null };

  const level = detectLevel(stem);
  if (!level) return { ok: false, reason: 'no level token (AM/EM/S1–S3/JC1/JC2)', stem, ext };
  const yearMatch = stem.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return { ok: false, reason: 'no 4-digit year', stem, ext };
  const year = Number(yearMatch[0]);
  let { examType } = detectExam(stem);
  const { token } = detectExam(stem);
  const paperMatch = stem.match(/\bP(?:aper)?\s?([1-4])\b/i);
  const paper = paperMatch ? `p${paperMatch[1]}` : 'all';

  let school = stem
    .replace(yearMatch[0], ' ')
    .replace(/\b(S[1-4]|JC[12]|H[12]|AM|EM|Sec\s?[1-4])\b/gi, ' ')
    .replace(/\((NA|NT)\)|\b(4045|4046|4047|4048|9758)\b/gi, ' ')
    .replace(/\bP(?:aper)?\s?[1-4]\b/gi, ' ')
    .replace(/\bPaper\b/gi, ' ');
  if (token) school = school.replace(new RegExp(token.source, 'gi'), ' ');
  school = school.replace(/\s+/g, ' ').replace(/^[\s\-–_,.]+|[\s\-–_,.]+$/g, '').trim();
  // "EM GCE 2004 GCE P2": the exam token IS the school once the exam token is stripped.
  if (!school && examType === 'GCE') school = 'GCE';
  // "O Level AM TYS 2025 (Questions)", "A Level H2 Math TYS 2025": a Ten-Year-Series
  // or O/A-Level name IS the national paper — exam GCE, school GCE, the way the
  // bank files it — unless the name already says Specimen (10 Sep 2026; until
  // then such a book was queued as school "O Level TYS (Questions)", exam null,
  // and the fleet would have staged it as a PRELIM).
  if (examType === null && NATIONAL.test(stem)) examType = 'GCE';
  if (examType === 'GCE' && NATIONAL.test(school)) school = 'GCE';
  if (!school) return { ok: false, reason: 'no school left in the name once level/exam/year/paper are removed', stem, ext };

  return { ok: true, level, year, school, examType, paper, ext, stem };
}

/** `paper_library.key` for a source: the normalised filename stem, so the same
 *  file staged twice dedups by name; a different file under the same name gets
 *  `-<sha8>` appended by the watcher so it is kept as a new version. */
export function sourceKey(name: string, sha8?: string): string {
  const stem = String(name).replace(/\.(docx|pdf)$/i, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return sha8 ? `src ${stem} ${sha8}` : `src ${stem}`;
}

const safe = (s: string) => String(s).replace(/[^\w.() \-]+/g, '_').replace(/\s+/g, ' ').trim();

/** Where the bytes live in the private bucket. The original filename is kept as
 *  the object name so provenance is legible in the bucket listing; an unparsed
 *  file goes under sources/_unfiled/ so nothing dropped in the inbox is lost. */
export function sourceStoragePath(parsed: ParsedSourceName, name: string): string {
  const file = safe(name);
  if (!parsed.ok) return `sources/_unfiled/${file}`;
  return `sources/${safe(parsed.level)}/${parsed.year}/${safe(parsed.school).replace(/ /g, '_')}/${file}`;
}

export interface KnownSource { id: string; key: string; sha256: string | null; status: string; inbox_path: string | null; source_file: string }

export type InboxDecision =
  | { kind: 'wait' }
  | { kind: 'ignore'; reason: string }
  /** Already in the ledger with these bytes and this inbox path — an earlier tick uploaded+inserted but died before the move. Finish the move only. */
  | { kind: 'move-only'; row: KnownSource; to: 'queued' }
  /** These exact bytes are already known under another file — do not enqueue twice. */
  | { kind: 'duplicate'; of: KnownSource; to: 'rejected' }
  | { kind: 'enqueue'; parsed: ParsedSourceName & { ok: true }; key: string; storagePath: string; to: 'queued' }
  | { kind: 'flag'; parsed: ParsedSourceName & { ok: false }; key: string; storagePath: string; to: 'rejected' };

/**
 * One file, one decision. `known` is every kind='source' row the ledger holds,
 * plus any library row whose sha256 matches (a PDF already indexed for the
 * marker was extracted long ago — re-dropping it is a duplicate, not a job).
 */
export function decideInboxFile(
  entry: InboxEntry, sha256: string, known: KnownSource[], now: Date,
): InboxDecision {
  if (!isSourceFile(entry.name)) return { kind: 'ignore', reason: 'not a .docx/.pdf' };
  if (!isSettled(entry, now)) return { kind: 'wait' };
  const sameBytes = known.find(k => k.sha256 === sha256);
  if (sameBytes) {
    const ours = sameBytes.inbox_path && sameBytes.inbox_path.toLowerCase() === entry.path.toLowerCase();
    return ours ? { kind: 'move-only', row: sameBytes, to: 'queued' } : { kind: 'duplicate', of: sameBytes, to: 'rejected' };
  }
  const parsed = parseSourceFilename(entry.name);
  const sha8 = sha256.slice(0, 8);
  const plainKey = sourceKey(entry.name);
  // Same name already on a different file → keep both, the newer one versioned by sha.
  const nameClash = known.some(k => k.key === plainKey);
  const key = nameClash ? sourceKey(entry.name, sha8) : plainKey;
  const storagePath = sourceStoragePath(parsed, nameClash ? entry.name.replace(/(\.(docx|pdf))$/i, `-${sha8}$1`) : entry.name);
  if (!parsed.ok) return { kind: 'flag', parsed, key, storagePath, to: 'rejected' };
  return { kind: 'enqueue', parsed, key, storagePath, to: 'queued' };
}

// ── The inbox also fills the MARKER's library (10 Sep 2026) ──────────────────
//
// Adrian, on Isabelle's AM TYS 2025 P2 and Joey's EM TYS 2025 P1: "what does the
// system do if there are no questions or mark scheme available? — we should have
// a robust solution."
//
// Both papers were marked blind because the 2025 GCE papers were not in
// `paper_library` — the marker's exam library, which lib/paper-library.js on the
// bot side attaches from at enqueue time. The inbox already had the bytes: the
// PDFs had been dropped in for the extraction fleet and filed as kind='source'.
// Nothing ever promoted them to the row the MARKER reads, so filing the four
// 2025 papers had to be done by hand.
//
// From here a dropped PDF does BOTH jobs in one tick: the extraction queue's
// `source` row as before, and — when the name says which single paper it is —
// the marker's `questions` (or `solutions`) row over the very same object. The
// route then re-marks every recent run that was marked without this paper.

/**
 * questions | solutions, from the filename alone.
 *
 * THE SAME RULE the exam-library indexer uses (scripts/paper-library/index.mjs
 * `kindOf`) — a name saying solution / answer / marking scheme / MS / ANS is the
 * scheme, everything else is the paper. Kept in two places because that script
 * is a standalone .mjs with top-level I/O; the shared examples are pinned in
 * extraction-inbox.test.ts. Pure.
 */
export function libraryKindOf(name: string): 'questions' | 'solutions' {
  const n = String(name).toLowerCase();
  return /solution|answer|marking scheme|mark scheme|\bms\b|\bans\b/.test(n) ? 'solutions' : 'questions';
}

/**
 * `paper_library.key` for a MARKER row: `<level> <year> p<n> <school>`, exactly
 * the way lib/paper-key `bankFilterFor` names a paper on the bot side (and the
 * indexer's `keyOf`). Lower case, single-spaced. Pure.
 */
export function libraryKeyOf(p: { level: string; year: number; paper: string; school: string }): string {
  return `${p.level} ${p.year} ${p.paper} ${p.school}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

export type LibraryRow = {
  key: string; kind: 'questions' | 'solutions';
  level: string; year: number; paper: string; school: string;
  examType: string | null;
};

/**
 * The marker library row a dropped file should ALSO become, or the reason it
 * cannot be one.
 *
 * The marker looks a paper up by (school, year, level, paper), so a file that
 * does not name ONE paper cannot be filed for it: a combined Ten-Year-Series
 * book ("O Level AM TYS 2025 (Questions).pdf", paper 'all') is a perfectly good
 * extraction source and a useless mark-scheme lookup. It stays queued for the
 * fleet — never rejected, the bytes are wanted — and the reason says what to do
 * about it. Pure.
 */
export function libraryRowFor(parsed: ParsedSourceName, name: string): { row: LibraryRow } | { skip: string } {
  if (!parsed.ok) return { skip: 'the name could not be filed at all' };
  if (parsed.paper === 'all') {
    return { skip: 'the name says no paper number and no cover page said either, so the marker cannot look it up — split the book into one file per paper, named like `AM GCE 2025 Paper 1.pdf`' };
  }
  const school = markerSchool(parsed, name);
  if (!school) return { skip: 'no school left in the name once the level, exam, year, paper and "(Solutions)" are removed' };
  const row: LibraryRow = {
    key: libraryKeyOf({ level: parsed.level, year: parsed.year, paper: parsed.paper, school }),
    kind: libraryKindOf(name),
    level: parsed.level, year: parsed.year, paper: parsed.paper, school,
    examType: parsed.examType,
  };
  return { row };
}

// …and the KIND words are never part of a school: the fleet's parser leaves
// "(Solutions)" behind as the school on "AM GCE 2025 Paper 2 (Solutions).pdf",
// which would file the scheme under the key "am 2025 p2 (solutions)" — a key
// nothing looks up. Its own convention is fine for the extraction queue (the
// fleet reads whole names); only the marker's key needs them gone.
//
// PARENTHESES ARE NOT NOISE. Real schools carry them — "Chung Cheng High
// (Yishun)", "Anglo Chinese School (Barker Road)" — and the bank spells them
// that way, so only a bracket whose whole content is a kind word comes off.
const KIND_PARENS = /\(\s*(?:solutions?|answers?|ans|marking\s*schemes?|mark\s*schemes?|ms|questions?|qns?|qp)\s*\)/gi;
const KIND_WORDS = /\b(?:solutions?|answers?|ans|marking\s*schemes?|mark\s*schemes?|questions?|qns?|qp)\b/gi;

/** The `questions.school` value this file belongs under, or ''. Pure. */
function markerSchool(parsed: ParsedSourceName & { ok: true }, name: string): string {
  if (parsed.examType === 'GCE' || parsed.examType === 'Specimen' || NATIONAL.test(name)) return 'GCE';
  return String(parsed.school || '')
    .replace(KIND_PARENS, ' ').replace(KIND_WORDS, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s\-–_,.]+|[\s\-–_,.]+$/g, '').trim();
}

/** "GCE 2025 AM P2" / "Bedok South 2025 EM P1" — how a filed paper is named in a
 *  Telegram line. Pure. */
export function libraryLabel(row: Pick<LibraryRow, 'school' | 'year' | 'level' | 'paper'>): string {
  const head = row.school.toUpperCase() === 'GCE' ? `GCE ${row.year}` : `${row.school} ${row.year}`;
  return `${head} ${row.level} ${row.paper.toUpperCase()}`;
}

// ── Closing the loop: re-mark what was marked without this paper ─────────────

export type RegroundRun = {
  id: string;
  paper_name: string | null;
  student_name: string | null;
  created_at: string;
  result_json: unknown;
};

type PaperFields = { school: string; year: number; level: string; paper: string };

type RegroundJson = {
  paper_match?: {
    key?: unknown;
    parsed?: { exam?: unknown; level?: unknown; year?: unknown; paper?: unknown; school?: unknown } | null;
    ungrounded?: { key?: unknown; filter?: unknown } | null;
    regrounded_at?: unknown; regrounded_key?: unknown;
  } | null;
  grounding?: { source?: unknown } | null;
  results?: unknown;
  source?: { photos?: unknown } | null;
  queue?: unknown;
};

// The bot's syllabus levels → the bank's `questions.level` (bot lib/paper-key.js
// BANK_LEVEL). A run stamped H2 is the library's JC2.
const BANK_LEVEL: Record<string, string> = { AM: 'AM', EM: 'EM', H2: 'JC2', H1: 'JC2_H1' };

/** school|year|level|paper, comparable across the two naming conventions. Pure. */
function fieldsId(f: PaperFields | null): string | null {
  if (!f || !f.school || !f.year || !f.level || !f.paper) return null;
  const paper = String(f.paper).replace(/^p/i, '');
  return `${String(f.school).toLowerCase()}|${f.year}|${String(f.level).toLowerCase()}|p${paper}`;
}

/**
 * Which paper a run was marked as, in the LIBRARY's terms — or null.
 *
 * The two sides spell the same paper differently: the marker's key is
 * "gce 2025 am p2" (exam first) and the library's is "am 2025 p2 gce" (level
 * first), so the strings can never be compared. The four fields can. The bot's
 * stamp carries them outright (`paper_match.ungrounded.filter`, from
 * bankFilterFor); an older run is read off `paper_match.parsed`, where a GCE
 * paper has school null and the school IS 'GCE'. Pure.
 */
export function runPaperFields(pm: RegroundJson['paper_match']): PaperFields | null {
  const f = pm?.ungrounded?.filter as Partial<PaperFields> | undefined;
  if (f && f.school && f.year && f.level && f.paper) {
    return { school: String(f.school), year: Number(f.year), level: String(f.level), paper: String(f.paper) };
  }
  const p = pm?.parsed;
  if (!p || !p.year || !p.level || !p.paper) return null;
  const school = p.exam === 'GCE' ? 'GCE' : (p.school ? String(p.school) : '');
  if (!school) return null;
  return { school, year: Number(p.year), level: BANK_LEVEL[String(p.level)] || String(p.level), paper: String(p.paper) };
}

/**
 * Which recent runs were marked WITHOUT the paper that has just arrived.
 *
 * A run qualifies when it names THIS paper (matched on the four fields — see
 * `runPaperFields`) and was marked with nothing to check it against. It says the
 * second part in one of two ways, because the stamp is new and yesterday's runs
 * do not carry it:
 *   1. `paper_match.ungrounded` — the bot's own stamp (lib/ungrounded-paper.js),
 *      written at enqueue and again by the marker;
 *   2. `grounding.source` null AND at least one question the marker never found
 *      printed anywhere — the shape Isabelle's run has (16 of 16 reads with
 *      `question_found:false`, 8 Sep 2026).
 *
 * And three refusals, all of them about not wasting a marking:
 *   - already re-marked against this very paper (`paper_match.regrounded_key`);
 *   - no stored photos, so there is nothing to re-mark from;
 *   - still sitting in the queue unmarked — it will pick the paper up on its way
 *     through (the queue attaches from the library again just before marking).
 *
 * Pure; the caller supplies the window and the cap.
 */
export function runsToReground(runs: RegroundRun[], target: PaperFields & { key: string }): RegroundRun[] {
  const wanted = fieldsId(target);
  if (!wanted) return [];
  const key = String(target.key || '').toLowerCase();
  return (runs || []).filter(r => {
    const rj = (r && r.result_json && typeof r.result_json === 'object' ? r.result_json : {}) as RegroundJson;
    const pm = rj.paper_match || {};
    if (fieldsId(runPaperFields(pm)) !== wanted) return false;
    const stamped = !!pm.ungrounded;
    const blind = Array.isArray(rj.results)
      && (rj.results as Array<{ question_found?: unknown }>).some(x => x && x.question_found === false);
    if (!stamped && !(blind && !rj.grounding?.source)) return false;
    if (typeof pm.regrounded_key === 'string' && pm.regrounded_key.toLowerCase() === key) return false;
    const photos = rj.source?.photos;
    if (!Array.isArray(photos) || !photos.length) return false;
    const marked = Array.isArray(rj.results) && rj.results.length > 0;
    if (rj.queue && !marked) return false;
    return true;
  });
}

/** The one line Adrian gets per re-marked paper. Pure. */
export function regroundNotice(label: string, run: Pick<RegroundRun, 'student_name' | 'paper_name'>): string {
  const who = (run.student_name || '').trim();
  const whose = who ? `${who.split(' ')[0]}’s paper` : `“${run.paper_name || 'a paper'}”`;
  return `📥 ${label} is in — re-marking ${whose} against it; the changed parts will be purple.`;
}

/** The one-line summary the job log and the tick response carry. */
export function inboxSummary(counts: { queued: number; flagged: number; duplicate: number; moved: number; waiting: number; failed: number; filed?: number; remarked?: number; split?: number }): string {
  const parts = [`${counts.queued} queued`];
  if (counts.split) parts.push(`${counts.split} book${counts.split === 1 ? '' : 's'} cut at the covers`);
  if (counts.filed) parts.push(`${counts.filed} filed for the marker`);
  if (counts.remarked) parts.push(`${counts.remarked} re-marked against it`);
  if (counts.flagged) parts.push(`${counts.flagged} flagged (bad name)`);
  if (counts.duplicate) parts.push(`${counts.duplicate} duplicate`);
  if (counts.moved) parts.push(`${counts.moved} re-moved`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (counts.waiting) parts.push(`${counts.waiting} still settling`);
  return parts.join(', ');
}
