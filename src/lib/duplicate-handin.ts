// 🔁 The same paper handed in twice — the pure half (5 Oct 2026, Adrian: "do the self fixes").
//
// Rainie Cheng, 4 Oct 2026: "Queenstown Secondary Chemistry Paper 2" at 12:25 and
// "Queenstown Paper 2" at 22:28 — the same 24 photos, byte for byte. The first sat ten
// hours in the queue (every login was full), so she sent it again, and the paper was
// marked twice. Two ways to know it is the same paper:
//
//   1. THE PHOTOS. Every upload keeps the storage's content fingerprint (the eTag, an MD5
//      of the bytes). The phone re-encodes the same picture to the same bytes, so the same
//      photos sent twice carry the same fingerprints. Half the new pages (or three) already
//      in an earlier hand-in = the same paper. Then nothing is asked: the new pages that
//      are NOT in the earlier one are added to it, and it is marked once.
//   2. THE NAME. Same school words, same paper number, no clash of year or exam. A name
//      can be a different paper ("Queenstown P2" from another year), so the student is
//      ASKED — "Send anyway" goes through as before.
//      Since 10 Oct 2026 (Adrian: "yes") this also asks when the earlier one is ALREADY
//      MARKED, and for a name with no school in it when the year, the paper number and
//      A Math / E Math all agree. Denise Chan scanned "tys 2023 amath paper 1" again four
//      days after it was marked: new photo files, so the fingerprints did not match, and
//      the same script was marked twice (77, then 75). A real second attempt taps Send anyway.
//
// Only the student's own hand-ins in the last thirty days, in the same family (a physics
// paper never matches a maths one). Three days until 10 Oct 2026 (Adrian: "YES" to thirty —
// the same photos re-sent a week later were marked again).
// Nothing is deleted: a matched hand-in's photos stay in storage and are listed on the
// earlier run (result_json.duplicate_handins). The I/O is in the submit route.

export const DUPLICATE_WINDOW_DAYS = 30;

export interface EarlierHandin {
  id: string;
  created_at: string;
  paper_name: string | null;
  /** The marking lane: 'math', 'physics', 'chemistry', 'biology' (null = math). */
  subject: string | null;
  released_at?: string | null;
  queue_status?: string | null;
  archived_at?: string | null;
  superseded_by?: string | null;
  /** Each page's content fingerprint, in page order (null when storage did not say). */
  fingerprints: (string | null)[];
}

export interface NewHandin {
  paperName: string;
  subject: string | null;
  /** The new pages' fingerprints, in the order the student sent them. */
  fingerprints: (string | null)[];
}

export type DuplicateMatch =
  | { kind: 'photos'; run: EarlierHandin; shared: number; newPageIndexes: number[] }
  | { kind: 'name'; run: EarlierHandin };

const SCIENCE = new Set(['physics', 'chemistry', 'biology']);
const lane = (s: string | null | undefined) => (s && SCIENCE.has(s) ? s : 'math');

// Words that say nothing about WHICH paper: the subject, the level, filler.
const FILLER = new Set([
  'secondary', 'sec', 'school', 'sch', 'sss', 'high', 'paper', 'the', 'and', 'of', 'my', 'for', 'exam', 'test',
  'chemistry', 'chem', 'physics', 'phy', 'phys', 'biology', 'bio', 'science', 'pure', 'combined', 'sci',
  'math', 'maths', 'mathematics', 'amath', 'emath', 'additional', 'elementary', 'a', 'e', 'am', 'em',
  'olevel', 'o', 'level', 'lvl', 'na', 'nt', 'express', 's1', 's2', 's3', 's4', 'sec1', 'sec2', 'sec3', 'sec4',
  'question', 'questions', 'answers', 'answer', 'qns', 'qn',
]);
const EXAMS: Record<string, string> = {
  prelim: 'prelim', prelims: 'prelim', preliminary: 'prelim', eoy: 'eoy', eya: 'eoy', sa2: 'eoy', final: 'eoy', finals: 'eoy',
  mye: 'mye', mya: 'mye', sa1: 'mye', midyear: 'mye', ca1: 'ca1', ca2: 'ca2', wa1: 'wa1', wa2: 'wa2', wa3: 'wa3',
  tys: 'tys', gce: 'gce', mock: 'mock', promo: 'promo', promos: 'promo', specimen: 'specimen',
};

export interface NameParts { paper: string | null; year: string | null; exam: string | null; kind: 'am' | 'em' | null; words: string[] }

const KINDS: Record<string, 'am' | 'em'> = { amath: 'am', am: 'am', additional: 'am', emath: 'em', em: 'em', elementary: 'em' };

/** "Queenstown Secondary Chemistry Paper 2" → { paper: '2', year: null, exam: null, words: ['queenstown'] }. */
export function nameParts(name: string | null | undefined): NameParts {
  let s = String(name || '').toLowerCase().replace(/[’']/g, '').replace(/o[\s-]?level/g, 'olevel').replace(/mid[\s-]?year/g, 'midyear')
    .replace(/\b(a|add|additional)[\s.-]*maths?\b/g, ' amath ').replace(/\b(e|elem|elementary)[\s.-]*maths?\b/g, ' emath ');
  let paper: string | null = null;
  const pm = s.match(/\b(?:paper|p)\s*([1-6])\b/);
  if (pm) { paper = pm[1]; s = s.replace(pm[0], ' '); }
  let year: string | null = null;
  const ym = s.match(/\b(19|20)\d{2}\b/);
  if (ym) { year = ym[0]; s = s.replace(ym[0], ' '); }
  let exam: string | null = null;
  let kind: 'am' | 'em' | null = null;
  const words: string[] = [];
  for (const w of s.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (KINDS[w]) kind = kind ?? KINDS[w];
    if (EXAMS[w]) { exam = exam ?? EXAMS[w]; continue; }
    if (FILLER.has(w) || /^\d+$/.test(w)) continue;
    words.push(w);
  }
  return { paper, year, exam, kind, words: [...new Set(words)] };
}

/**
 * Do two typed names describe the same paper? Every detail both name must agree; the school
 * words of one must sit inside the other's. A name with no school in it ("tys 2023 amath
 * paper 1") matches only another such name with the same year, paper number and A/E Math.
 */
export function sameNameish(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = nameParts(a), y = nameParts(b);
  if (x.paper && y.paper && x.paper !== y.paper) return false;
  if (x.year && y.year && x.year !== y.year) return false;
  if (x.exam && y.exam && x.exam !== y.exam) return false;
  if (x.kind && y.kind && x.kind !== y.kind) return false;
  if (!x.words.length && !y.words.length) return !!x.year && !!y.year && !!x.paper && !!y.paper && x.kind === y.kind;
  if (!x.words.length || !y.words.length) return false;
  // a paper number on one side only: the words must then agree exactly (no guessing which paper)
  const sub = (p: string[], q: string[]) => p.every((w) => q.includes(w));
  if ((x.paper == null) !== (y.paper == null)) return sub(x.words, y.words) && sub(y.words, x.words);
  return sub(x.words, y.words) || sub(y.words, x.words);
}

const isMarked = (r: EarlierHandin) => !!r.released_at || r.queue_status === 'done';

/**
 * The earlier hand-in this one repeats, or null. Photos first, then the name (either in
 * any state of the earlier one — marked or not). Newest match wins.
 */
export function findDuplicate(next: NewHandin, earlier: EarlierHandin[], now: Date = new Date()): DuplicateMatch | null {
  const since = now.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000;
  const pool = earlier
    .filter((r) => !r.archived_at && !r.superseded_by && Date.parse(r.created_at) >= since && lane(r.subject) === lane(next.subject))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const fresh = next.fingerprints;
  const known = fresh.filter(Boolean).length;
  if (known) {
    for (const r of pool) {
      const theirs = new Set(r.fingerprints.filter(Boolean) as string[]);
      if (!theirs.size) continue;
      const shared = fresh.filter((f) => f && theirs.has(f)).length;
      if (shared >= Math.min(3, known) || shared * 2 >= known) {
        const newPageIndexes = fresh.map((f, i) => (f && theirs.has(f) ? -1 : i)).filter((i) => i >= 0);
        return { kind: 'photos', run: r, shared, newPageIndexes };
      }
    }
  }
  for (const r of pool) {
    if (sameNameish(next.paperName, r.paper_name)) return { kind: 'name', run: r };
  }
  return null;
}

/** "12:25 pm today" / "yesterday at 10:28 pm" / "on Sat 3 Oct", Singapore time. */
export function whenWords(iso: string, now: Date = new Date()): string {
  const at = new Date(Date.parse(iso) + 8 * 3600_000);
  const today = new Date(now.getTime() + 8 * 3600_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  let h = at.getUTCHours();
  const m = at.getUTCMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const clock = `${h}:${String(m).padStart(2, '0')} ${ap}`;
  if (day(at) === day(today)) return `at ${clock} today`;
  const y = new Date(today.getTime() - 86_400_000);
  if (day(at) === day(y)) return `yesterday at ${clock}`;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.getUTCMonth()];
  return `on ${wd} ${at.getUTCDate()} ${mo}`;
}

/** What the student reads. Short, plain, one idea a line. */
export function duplicateMessage(m: DuplicateMatch, opts: { added?: number; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const name = m.run.paper_name ? `“${m.run.paper_name}”` : 'this paper';
  const when = whenWords(m.run.created_at, now);
  const marked = isMarked(m.run);
  if (m.kind === 'name' && marked) {
    return `You handed in ${name} ${when}, and it is marked. Find it under Papers.\nIf this is a new attempt or a different paper, tap Send anyway.`;
  }
  if (m.kind === 'name') {
    return `You handed in ${name} ${when}. It is still waiting to be marked.\nIf this is the same paper, you don’t need to send it again — it will be marked once.\nIf it is a different paper, tap Send anyway.`;
  }
  if (opts.added) {
    return `We already have this paper — you sent it ${when}.\nThe ${opts.added} new page${opts.added === 1 ? '' : 's'} were added to it, and it will be marked once.`;
  }
  return marked
    ? `We already have this paper — you sent it ${when}, and it is marked. Find it under Papers.`
    : `We already have this paper — you sent it ${when}.\nIt will be marked once. You don’t need to send it again.`;
}
