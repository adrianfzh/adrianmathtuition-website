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
  const { examType, token } = detectExam(stem);
  const paperMatch = stem.match(/\bP(?:aper)?\s?([1-4])\b/i);
  const paper = paperMatch ? `p${paperMatch[1]}` : 'all';

  let school = stem
    .replace(yearMatch[0], ' ')
    .replace(/\b(S[1-4]|JC[12]|AM|EM|Sec\s?[1-4])\b/gi, ' ')
    .replace(/\((NA|NT)\)|\b(4045|4046|4047|4048|9758)\b/gi, ' ')
    .replace(/\bP(?:aper)?\s?[1-4]\b/gi, ' ')
    .replace(/\bPaper\b/gi, ' ');
  if (token) school = school.replace(new RegExp(token.source, 'gi'), ' ');
  school = school.replace(/\s+/g, ' ').replace(/^[\s\-–_,.]+|[\s\-–_,.]+$/g, '').trim();
  // "EM GCE 2004 GCE P2": the exam token IS the school once the exam token is stripped.
  if (!school && examType === 'GCE') school = 'GCE';
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

/** The one-line summary the job log and the tick response carry. */
export function inboxSummary(counts: { queued: number; flagged: number; duplicate: number; moved: number; waiting: number; failed: number }): string {
  const parts = [`${counts.queued} queued`];
  if (counts.flagged) parts.push(`${counts.flagged} flagged (bad name)`);
  if (counts.duplicate) parts.push(`${counts.duplicate} duplicate`);
  if (counts.moved) parts.push(`${counts.moved} re-moved`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (counts.waiting) parts.push(`${counts.waiting} still settling`);
  return parts.join(', ');
}
