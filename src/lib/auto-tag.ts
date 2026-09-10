// Auto-tagging a marked paper to its student — the pure half.
//
// Adrian, 7 Sep 2026, looking at "+ tag · denise am tys 2021 p2" on the
// mark-paper list: "can these pdfs be auto-tagged? from their names in the pdf?
// … if there are two students with the same name, why not just read the pdf
// first page for the name?"
//
// So: a run with no student is tagged from the NAME Adrian typed ("denise am
// tys 2021 p2" → the one Denise on the roster). When that name fits two
// students (three Lucases, two Gavins) or nobody, the paper's FIRST PAGE is
// read once (lib/scan-reader.ts, the same cover reader the ScanSnap watcher
// uses) and the name on it decides — within the students the typed name
// already pointed at, so the cover can only ever pick one of "the Lucases",
// never contradict the title. Anything still unsure stays for Adrian's own tap
// (the desk's Needs-a-student lane). Never a guess.
//
// The I/O — listing runs, fetching the page, calling the model, writing the
// tag — is lib/auto-tag-sweep.ts, run from the 5-minute /api/cron/scan-inbox.
// Everything that DECIDES is here, and tested.
import { matchStudent, parseScanFilename, type CoverReading, type RosterStudent } from './scan-inbox';

/** Only recent papers: an old untagged run is one Adrian chose to leave. */
export const AUTO_TAG_WINDOW_DAYS = 14;
/** Cover reads per tick — each is one vision call; the rest wait for the next tick. */
export const COVER_READS_PER_TICK = 3;

/** The run columns the decision reads (result_json pieces pre-picked by the sweep's select). */
export type AutoTagRun = {
  id: string;
  paper_name: string | null;
  student_id: string | null;
  released_at: string | null;
  archived_at: string | null;
  created_at: string;
  /** result_json.source — the pages the student handed in. */
  source?: { photos?: Array<{ photo_index?: number; original_url?: string }> } | null;
  /** result_json.auto_tag — what an earlier tick already tried. */
  auto_tag?: AutoTagStamp | null;
  /** result_json.portal_submission / .telegram_handin — hand-ins arrive tagged; never ours. */
  portal_submission?: unknown;
  telegram_handin?: unknown;
};

/** Written onto result_json.auto_tag so nothing is tried twice and the desk can say how a tag happened. */
export type AutoTagStamp = {
  at: string;
  by?: 'name' | 'cover';
  /** The name the cover reader saw, when it was consulted. */
  read_name?: string | null;
  /** The reader was consulted (tagged or not) — never consulted twice for one run. */
  cover_tried?: boolean;
  /** Why no tag, when none. */
  reason?: string | null;
};

export type NameDecision =
  | { kind: 'tag'; student: RosterStudent; by: 'name' }
  /** The title points at these students (≥2) or at nobody (candidates = whole roster). */
  | { kind: 'cover'; candidates: RosterStudent[]; reason: 'ambiguous' | 'unknown'; typed: string }
  | { kind: 'skip'; reason: 'no-name' };

export type CoverDecision =
  | { kind: 'tag'; student: RosterStudent; by: 'cover'; readName: string }
  | { kind: 'skip'; reason: 'cover-unreadable' | 'cover-no-match' | 'cover-ambiguous'; readName: string | null };

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Is this run one the sweep may touch at all? */
export function eligibleForAutoTag(run: AutoTagRun, now: Date, windowDays = AUTO_TAG_WINDOW_DAYS): boolean {
  if (run.student_id || run.released_at || run.archived_at) return false;
  if (run.portal_submission || run.telegram_handin) return false;
  const age = now.getTime() - Date.parse(run.created_at);
  if (!Number.isFinite(age) || age < 0 || age > windowDays * 86_400_000) return false;
  return true;
}

/** The name phrase Adrian typed in front of the subject code ("gavin woon am tys 2024 p1" → "gavin woon"), or null. */
export function typedName(paperName: string | null | undefined): string | null {
  const parsed = parseScanFilename(`${String(paperName || '').trim()}.pdf`);
  return parsed?.name ?? looseTypedName(paperName);
}

// A title with NO subject code — "nicole GCE 2024 Paper 1" (11 Sep 2026: Nicole
// sat untagged through her whole marking, Adrian: "the name should be pretty
// easy to tag"). The strict convention parser needs am/em/h2 after the name;
// this fallback takes the words in front of the first exam word, paper word or
// year instead — one to three plain name tokens, or nothing. "CALIBRATION ·
// Cambridge 5054 …" and "GCE 2024 Paper 1" give nothing, as they should.
const LOOSE_CUT = /^(gce|tys|prelim|prelims|wa[1-4]?|eoy|mye|ca[12]?|sa[12]?|promo|promos|mock|mocks|practice|set|sets|paper|p[12]|jc[12]|j[12]|sec[1-5]|s[1-5]|\d{4})$/i;
export function looseTypedName(paperName: string | null | undefined): string | null {
  const tokens = String(paperName || '').trim().split(/\s+/).filter(Boolean);
  const cut = tokens.findIndex(t => LOOSE_CUT.test(t.replace(/[^A-Za-z0-9]/g, '')));
  if (cut <= 0 || cut > 3) return null;
  const name = tokens.slice(0, cut);
  if (!name.every(t => /^[A-Za-z][A-Za-z'\-]*$/.test(t))) return null;
  return norm(name.join(' '));
}

/** Roster rows a typed name could mean: every token of it inside the roster name, else its first token alone. */
export function nameCandidates(typed: string, roster: RosterStudent[]): RosterStudent[] {
  const tokens = norm(typed).split(' ').filter(t => t.length >= 2);
  if (!tokens.length) return [];
  const rows = roster.map(r => ({ r, t: norm(r.name).split(' ') }));
  const all = rows.filter(x => tokens.every(t => x.t.includes(t)));
  if (all.length) return all.map(x => x.r);
  return rows.filter(x => x.t.includes(tokens[0])).map(x => x.r);
}

/**
 * Step 1 — the title. One roster student → tag. Several → the cover decides
 * among THEM. None (a nickname, a typo) → the cover decides from the whole
 * roster. No name in the title at all → nothing to go on.
 */
export function decideByName(paperName: string | null | undefined, roster: RosterStudent[]): NameDecision {
  const typed = typedName(paperName);
  if (!typed) return { kind: 'skip', reason: 'no-name' };
  const student = matchStudent(typed, roster);
  if (student) return { kind: 'tag', student, by: 'name' };
  const candidates = nameCandidates(typed, roster);
  if (candidates.length >= 2) return { kind: 'cover', candidates, reason: 'ambiguous', typed };
  return { kind: 'cover', candidates: roster, reason: 'unknown', typed };
}

/**
 * Step 2 — the cover. The reader's full name first, then the given name,
 * matched inside the candidate set only: a title that said "lucas" can end up
 * on any Lucas, never on a Gavin. The whole roster is the candidate set only
 * when the title named nobody.
 */
export function decideByCover(reading: CoverReading | null, candidates: RosterStudent[]): CoverDecision {
  const readName = reading?.student_name || reading?.given_name || null;
  if (!reading || !readName) return { kind: 'skip', reason: 'cover-unreadable', readName: null };
  const student = matchStudent(reading.student_name, candidates) || matchStudent(reading.given_name, candidates);
  if (student) return { kind: 'tag', student, by: 'cover', readName };
  // Distinguish "nobody" from "still two": the desk line reads differently.
  const still = nameCandidates(readName, candidates);
  return { kind: 'skip', reason: still.length >= 2 ? 'cover-ambiguous' : 'cover-no-match', readName };
}

/** The first page or two the student handed in, oldest photo first. */
export function firstPageUrls(run: AutoTagRun, max = 2): string[] {
  const photos = Array.isArray(run.source?.photos) ? run.source!.photos! : [];
  return photos
    .filter(p => p && typeof p.original_url === 'string' && p.original_url)
    .sort((a, b) => (a.photo_index ?? 0) - (b.photo_index ?? 0))
    .slice(0, max)
    .map(p => p.original_url as string);
}

/** Has an earlier tick already spent this run's one cover read? */
export function coverAlreadyTried(run: AutoTagRun): boolean {
  return !!run.auto_tag?.cover_tried;
}

/** The Telegram line — one per tag, and one per paper the cover could not settle. */
export function autoTagLine(d: { paperName: string | null; student: RosterStudent | null; by?: 'name' | 'cover'; readName?: string | null; reason?: string | null; candidates?: number }): string {
  const name = d.paperName || 'untitled paper';
  if (d.student) {
    const how = d.by === 'cover' ? `cover reads "${d.readName || ''}"` : 'from the name';
    return `🏷 Tagged ${name} → ${d.student.name} (${how})`;
  }
  const why = d.reason === 'cover-ambiguous' ? `cover reads "${d.readName || ''}" — still ${d.candidates ?? 'several'} possible`
    : d.reason === 'cover-no-match' ? `cover reads "${d.readName || ''}" — nobody on the roster`
    : d.reason === 'cover-unreadable' ? 'no name on the first page'
    : 'could not tell';
  return `🏷 Couldn't tag ${name} — ${why} · tag the student on the desk`;
}
