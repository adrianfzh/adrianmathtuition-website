// Listening papers in Supabase (table english_listening_papers, migrations/english_listening_papers.sql)
// and their recordings in the public bucket english-audio. SPEC-ENGLISH-ORAL-LISTENING.md §More papers.
// Server only (service key).
import { getSupabaseAdmin } from './supabase';
import type { ListeningSet } from './english-listening';
import { LISTENING_BUCKET, MONTHLY_CAP, nextPaper, nextPaperId, paperOfPart, paperProblems, papersWanted, partAudioKey, partId, reviewFailures, sharedRuns, wantedWithinLimits, weakPaper, type BlindAnswers, blindMisses, type ListeningLevel, type ListeningPaper, LISTENING_LEVELS, type PaperStats } from './english-listening-papers';
import { sgtDateISO } from './sgt';

export type PaperStatus = 'checked' | 'ready' | 'rejected' | 'retired';
export interface PaperRow { id: string; level: ListeningLevel; status: PaperStatus; paper: ListeningPaper; checks: PaperChecks | null; audio: Record<string, { key: string; seconds: number; chars: number }> | null; made_by: string; made_for: string | null; created_at: string; ready_at: string | null }
export interface PaperChecks { problems: string[]; blind: { misses: string[]; by: string; at: string }; review: { failed: string[]; items: unknown }; copy: { shared: string[] }; guessed?: { right: number; total: number }; retired?: { reason: string; at: string } }

const db = () => getSupabaseAdmin().from('english_listening_papers');

/** The public address of a part's recording. */
export function partAudioUrl(id: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${LISTENING_BUCKET}/${partAudioKey(id)}`;
}

/** Ready papers, oldest first: { id, level }. */
export async function readyPapers(level?: ListeningLevel): Promise<{ id: string; level: ListeningLevel }[]> {
  let q = db().select('id, level').eq('status', 'ready').order('id');
  if (level) q = q.eq('level', level);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; level: ListeningLevel }[];
}

export async function loadPaperRow(id: string): Promise<PaperRow | null> {
  if (!/^lp\d{3}$/.test(id)) return null;
  const { data } = await db().select('*').eq('id', id).maybeSingle();
  return (data as PaperRow | null) ?? null;
}

/** A part of a READY paper (what a student may open). Admin may open a checked one too. */
export async function loadPart(id: string, opts: { admin?: boolean } = {}): Promise<{ set: ListeningSet; paper: PaperRow } | null> {
  const pid = paperOfPart(id);
  if (!pid) return null;
  const row = await loadPaperRow(pid);
  if (!row || !(row.status === 'ready' || (opts.admin && row.status === 'checked'))) return null;
  const set = row.paper.parts.find(s => s.id === id);
  return set ? { set, paper: row } : null;
}

/** What this student has done in papers: part id → { right, total, at } (their latest try). */
export async function partsDone(identity: string): Promise<Record<string, { right: number; total: number; at: string }>> {
  const { data } = await getSupabaseAdmin().from('english_practice_attempts').select('result, awarded, max_marks, created_at')
    .eq('identity', identity).eq('kind', 'listening').order('created_at', { ascending: true }).limit(2000);
  const out: Record<string, { right: number; total: number; at: string }> = {};
  for (const r of (data ?? []) as { result: { set?: string } | null; awarded: number | null; max_marks: number | null; created_at: string }[]) {
    const id = r.result?.set;
    if (id && paperOfPart(id)) out[id] = { right: Number(r.awarded ?? 0), total: Number(r.max_marks ?? 0), at: r.created_at };
  }
  return out;
}
export const papersStarted = (done: Record<string, unknown>): Set<string> => new Set(Object.keys(done).map(paperOfPart).filter((x): x is string => !!x));

/** "New paper": the next ready paper at the level this student has not started. */
export async function nextPaperFor(identity: string, level: ListeningLevel): Promise<{ id: string | null; left: number; total: number }> {
  const ids = (await readyPapers(level)).map(p => p.id);
  const started = papersStarted(await partsDone(identity));
  const id = nextPaper(ids, started);
  return { id, left: ids.filter(x => !started.has(x)).length, total: ids.length };
}

// ── Saving a paper (the session's batch script, the worker's door) ───────────
/**
 * Run every check and store the paper: 'checked' when it passes (recordings still to make),
 * 'rejected' with the reasons when it does not. The id is given here, never by the writer.
 * `bank` = other texts to compare against (the language bank; the session script passes it).
 */
/**
 * Every check on a draft, nothing stored: mechanical, Singapore words, the copy check against every
 * kept paper (and `bank`), the blind reader, the guesser, the reviewer. Empty = keep.
 */
export async function judgePaper(draft: ListeningPaper, blind: BlindAnswers, review: unknown, opts: { dict?: Set<string>; bank?: string[]; guessed?: { right: number; total: number } } = {}): Promise<{ problems: string[]; checks: Omit<PaperChecks, 'blind'> & { misses: string[] } }> {
  const { data: all } = await db().select('id, paper, status');
  const rows = (all ?? []) as { id: string; paper: ListeningPaper; status: PaperStatus }[];
  const problems = paperProblems(draft, { dict: opts.dict });
  const shared = sharedRuns(draft, [...rows.filter(r => r.status !== 'rejected').map(r => r.paper.parts.map(s => s.script.map(l => l.text).join(' ')).join(' ')), ...(opts.bank ?? [])]);
  if (shared.length) problems.push(`shares ${shared.length} run(s) of 8 words with another paper or the bank, e.g. "${shared[0]}"`);
  const misses = blindMisses(draft, blind);
  if (misses.length) problems.push(...misses.map(m => `blind reader: ${m}`));
  // A test that can be passed without listening is no test: the guesser saw only the questions.
  if (opts.guessed && opts.guessed.total && opts.guessed.right / opts.guessed.total > 0.5) problems.push(`answerable without listening: a reader with no script got ${opts.guessed.right} of ${opts.guessed.total} choice and matching questions`);
  const failed = reviewFailures(review);
  if (failed.length) problems.push(...failed.map(f => `reviewer: ${f}`));
  return { problems, checks: { problems, misses, review: { failed, items: (review as { items?: unknown } | null)?.items ?? null }, copy: { shared }, ...(opts.guessed ? { guessed: opts.guessed } : {}) } };
}

/**
 * Judge and store the paper: 'checked' when it passes (recordings still to make), 'rejected' with
 * the reasons when it does not. The id is given here, never by the writer. `draft` uses the ids
 * lp000-1 … lp000-4 (the blind answers too).
 */
export async function savePaper(draft: ListeningPaper, blind: BlindAnswers, review: unknown, opts: { by: string; madeBy: 'session' | 'worker'; madeFor?: string | null; dict?: Set<string>; bank?: string[]; guessed?: { right: number; total: number } }): Promise<{ id: string; status: PaperStatus; problems: string[] }> {
  const { problems, checks: c } = await judgePaper(draft, blind, review, opts);
  const { data: all } = await db().select('id');
  const id = nextPaperId(((all ?? []) as { id: string }[]).map(r => r.id));
  const paper = renumber(draft, id);
  const status: PaperStatus = problems.length ? 'rejected' : 'checked';
  const checks: PaperChecks = { problems, blind: { misses: c.misses, by: opts.by, at: new Date().toISOString() }, review: c.review, copy: c.copy, ...(c.guessed ? { guessed: c.guessed } : {}) };
  const { error } = await db().insert({ id, level: paper.level, status, paper, checks, made_by: opts.madeBy, made_for: opts.madeFor ?? null });
  if (error) throw new Error(error.message);
  return { id, status, problems };
}

function renumber(p: ListeningPaper, id: string): ListeningPaper {
  return { id, level: p.level, parts: p.parts.map((s, i) => ({ ...s, id: partId(id, i) })) };
}

export async function setPaperStatus(id: string, status: PaperStatus, extra: Partial<Pick<PaperRow, 'audio' | 'ready_at'>> = {}): Promise<void> {
  const { error } = await db().update({ status, ...extra }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Stock: how many more papers each level needs, within the limits ─────────
export interface LevelStock { level: ListeningLevel; ready: number; checked: number; wanted: number; fewestLeft: number | null; keenest: string | null }
export async function listeningStock(): Promise<{ levels: LevelStock[]; madeThisMonth: number; monthlyCap: number }> {
  const { data } = await db().select('id, level, status, made_for, created_at');
  const rows = (data ?? []) as { id: string; level: ListeningLevel; status: PaperStatus; made_for: string | null; created_at: string }[];
  const today = sgtDateISO();
  const month = today.slice(0, 7);
  // Every paper the worker wrote counts toward the month, kept or thrown away: the cap is on making.
  const madeThisMonth = rows.filter(r => sgtDateISO(new Date(r.created_at)).slice(0, 7) === month).length;
  const madeToday = (who: string) => rows.filter(r => r.made_for === who && sgtDateISO(new Date(r.created_at)) === today).length;
  const started = await startedByStudent();
  let usedThisMonth = madeThisMonth;
  const levels = LISTENING_LEVELS.map(({ level }): LevelStock => {
    const ready = rows.filter(r => r.level === level && r.status === 'ready').map(r => r.id);
    const checked = rows.filter(r => r.level === level && r.status === 'checked').length;
    const users = [...started.entries()].filter(([, s]) => ready.some(id => s.has(id)));
    const left = users.map(([who, s]) => ({ who, n: ready.filter(id => !s.has(id)).length + checked }));
    const keen = left.sort((a, b) => a.n - b.n)[0] ?? null;
    const stock = ready.length + checked;
    const raw = papersWanted(stock, left.map(l => l.n));
    const byKeenest = stock >= 3 && raw > 0;
    const wanted = wantedWithinLimits(raw, { madeThisMonth: usedThisMonth, keenestMadeToday: keen ? madeToday(keen.who) : 0, byKeenest });
    usedThisMonth += wanted;
    return { level, ready: ready.length, checked, wanted, fewestLeft: keen ? keen.n : null, keenest: byKeenest && keen ? keen.who : null };
  });
  return { levels, madeThisMonth, monthlyCap: MONTHLY_CAP };
}

/** identity → papers started, from the last 120 days of listening tries (admin and the preview student left out). */
async function startedByStudent(): Promise<Map<string, Set<string>>> {
  const { data: att } = await getSupabaseAdmin().from('english_practice_attempts').select('identity, result')
    .eq('kind', 'listening').gte('created_at', new Date(Date.now() - 120 * 86400_000).toISOString()).limit(20000);
  const started = new Map<string, Set<string>>();
  for (const a of (att ?? []) as { identity: string; result: { set?: string } | null }[]) {
    const pid = a.result?.set ? paperOfPart(a.result.set) : null;
    if (!pid || a.identity === 'admin') continue;
    if (!started.has(a.identity)) started.set(a.identity, new Set());
    started.get(a.identity)!.add(pid);
  }
  return started;
}

// ── After use: retire weak papers ───────────────────────────────────────────
/** Read every ready paper's results; retire the weak ones (status 'retired', reason in checks.retired). */
export async function retireWeakPapers(): Promise<{ id: string; reason: string }[]> {
  const { data: papers } = await db().select('id, level, checks, paper').eq('status', 'ready');
  const { data: att } = await getSupabaseAdmin().from('english_practice_attempts').select('identity, result')
    .eq('kind', 'listening').limit(50000);
  const byPart = new Map<string, { identity: string; questions: { n: string; ok: boolean }[] }[]>();
  for (const a of (att ?? []) as { identity: string; result: { set?: string; questions?: { n: string; ok: boolean }[] } | null }[]) {
    if (!a.result?.set || !paperOfPart(a.result.set) || a.identity === 'admin') continue;
    if (!byPart.has(a.result.set)) byPart.set(a.result.set, []);
    byPart.get(a.result.set)!.push({ identity: a.identity, questions: a.result.questions ?? [] });
  }
  const out: { id: string; reason: string }[] = [];
  for (const p of (papers ?? []) as { id: string; level: ListeningLevel; checks: PaperChecks | null; paper: ListeningPaper }[]) {
    const parts = p.paper.parts.map(s => {
      // each student's FIRST try counts (a second try after seeing the answers would flatter the paper)
      const firsts = new Map<string, { n: string; ok: boolean }[]>();
      for (const t of byPart.get(s.id) ?? []) if (!firsts.has(t.identity)) firsts.set(t.identity, t.questions);
      const perQuestion: Record<string, { right: number; tries: number }> = {};
      for (const qs of firsts.values()) for (const q of qs) { perQuestion[q.n] ??= { right: 0, tries: 0 }; perQuestion[q.n].tries++; if (q.ok) perQuestion[q.n].right++; }
      return { id: s.id, tries: firsts.size, perQuestion, who: new Set(firsts.keys()) };
    });
    const startedBy = new Set(parts.flatMap(x => [...x.who]));
    const finishedBy = [...startedBy].filter(w => parts.every(x => x.who.has(w)));
    // "left halfway" only counts students who began more than a week ago — read loosely: anyone not finished
    const stats: PaperStats = { level: p.level, parts: parts.map(({ id, tries, perQuestion }) => ({ id, tries, perQuestion })), started: startedBy.size, finished: finishedBy.length };
    const reason = weakPaper(stats);
    if (!reason) continue;
    await db().update({ status: 'retired', checks: { ...(p.checks ?? {}), retired: { reason, at: new Date().toISOString() } } }).eq('id', p.id);
    out.push({ id: p.id, reason });
  }
  return out;
}

/** Every paper for Adrian's list: newest first, without the scripts. */
export async function paperList(): Promise<Pick<PaperRow, 'id' | 'level' | 'status' | 'checks' | 'made_by' | 'made_for' | 'created_at' | 'ready_at'>[]> {
  const { data } = await db().select('id, level, status, checks, made_by, made_for, created_at, ready_at').order('id', { ascending: false }).limit(500);
  return (data ?? []) as Pick<PaperRow, 'id' | 'level' | 'status' | 'checks' | 'made_by' | 'made_for' | 'created_at' | 'ready_at'>[];
}
