// ─── /admin/overnight — what the machine did by itself overnight ─────────────────
//
// Adrian, 12 Oct 2026: "all autofixes, auto-improvements, auto-whatever reports on the
// admin dashboard" → "build the overnight page". Phase 1 reads only what the website can
// reach today:
//   • the bot repo's docs/PROPOSALS.md (the ledger of proposals waiting for his Ship), and
//   • `job_runs` (every night job stamps one row a run).
// Telegram digests and the reviews' findings files are not reachable from here (phase 2).
//
// Pure: parsing the ledger, grouping logbook rows into "last night" and a 7-day history,
// and building the `proposal_requests` row a Ship / Change / Drop tap writes — the SAME
// row the bot's Telegram button writes (bot lib/proposals.js recordRequest), so the Fly
// worker (bot scripts/proposal-ship.js) cannot tell the two doors apart.

import { addDaysISO, sgtDateISO, sgtDayStart } from './sgt';

// ── The ledger ────────────────────────────────────────────────────────────────

/** Same slug rule as the bot (callback_data is capped at 64 bytes). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,54}$/;
export const NOTE_MAX = 2000;

export type LedgerRow = { slug: string; branch: string; date: string; gate: string; status: string };

/** The markdown table `| slug | branch | date | gate | status |` → rows (bot parseLedger). */
export function parseLedger(markdown: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const line of String(markdown || '').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5 || cells[0] === 'slug' || /^-+$/.test(cells[0])) continue;
    rows.push({ slug: cells[0], branch: cells[1], date: cells[2], gate: cells[3].replace(/^`|`$/g, ''), status: cells[4] });
  }
  return rows;
}

export type PlainParts = { name: string | null; problem: string | null; solution: string | null; fix: string | null; text: string | null };

/**
 * The part of a "### In plain words" line after `- <slug> — `. Three shapes, newest first:
 *   `"Plain name" — Problem: … Solution: … Fix: …`   (12 Oct 2026)
 *   `"Plain name" — Problem: … Fix: …`               (8–11 Oct 2026; also without the name)
 *   any sentence                                       (older lines — shown as it is)
 * An `APPROVED — ` marker after the name is dropped.
 */
export function parsePlainLine(rest: string | null | undefined): PlainParts {
  let s = String(rest ?? '').trim();
  if (!s) return { name: null, problem: null, solution: null, fix: null, text: null };
  let name: string | null = null;
  const n = /^["“]([^"”]+)["”]\s*(?:[—–-]\s*)?/.exec(s);
  if (n) { name = n[1].trim(); s = s.slice(n[0].length).trim(); }
  s = s.replace(/^APPROVED\s*[—–-]\s*/, '').trim();
  const three = /^Problem:\s*([\s\S]+?)\s+Solution:\s*([\s\S]+?)\s+Fix:\s*([\s\S]+?)\s*$/.exec(s);
  if (three) return { name, problem: three[1], solution: three[2], fix: three[3], text: null };
  const two = /^Problem:\s*([\s\S]+?)\s+Fix:\s*([\s\S]+?)\s*$/.exec(s);
  if (two) return { name, problem: two[1], solution: null, fix: two[2], text: null };
  return { name, problem: null, solution: null, fix: null, text: s || null };
}

/** "graph-solution-figure" → "Graph solution figure" — the bot's button spells it the same way. */
export function slugName(slug: string): string {
  const t = String(slug || '').replace(/-+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export type OpenProposal = PlainParts & {
  slug: string;
  /** The name to show: the line's own "Plain name", else the slug in words. */
  title: string;
  date: string;
  /** Whole days since the row's date (Singapore calendar); null when the date is not a date. */
  days: number | null;
  /** 'website' when the branch lives in the website repo (the row says "(website)"). */
  repo: 'bot' | 'website';
  /** Adrian already said yes in words; only his Ship press is left (bot ledger "APPROVED —"). */
  approved?: boolean;
};

/** Every `open` row, with its plain line split up. Longest-waiting first. Pure. */
export function openProposals(markdown: string, todayISO: string): OpenProposal[] {
  const md = String(markdown || '');
  const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const out: OpenProposal[] = [];
  const seen = new Set<string>();
  for (const r of parseLedger(md)) {
    if (r.status !== 'open' || !SLUG_RE.test(r.slug) || seen.has(r.slug)) continue;
    seen.add(r.slug);
    const esc = r.slug.replace(/[-]/g, '\\-');
    const m = md.match(new RegExp(`^- ${esc} [—–-] (.+)$`, 'm'));
    const plain = parsePlainLine(m ? m[1] : null);
    const days = /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? Math.max(0, day(todayISO) - day(r.date)) : null;
    out.push({
      ...plain, slug: r.slug, title: plain.name || slugName(r.slug), date: r.date, days,
      repo: /\(website\)/i.test(r.branch) ? 'website' : 'bot',
    });
  }
  return out.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

/** "waiting 3 days" / "new today". */
export function waitingWords(days: number | null): string {
  if (days == null) return '';
  if (days === 0) return 'new today';
  return `waiting ${days} day${days === 1 ? '' : 's'}`;
}

// ── A Ship / Change / Drop tap ────────────────────────────────────────────────

export type ProposalAction = 'ship' | 'change' | 'drop';
export type TapInput = { slug?: unknown; action?: unknown; note?: unknown };
export type ProposalRequestRow = {
  slug: string; action: ProposalAction; requested_by: number | null; chat_id: number | null;
  thread_id: null; message_id: null; note: string | null;
};

/**
 * Check a tap from the page. `openSlugs` = the ledger's open slugs (a stale page cannot
 * ship something already shipped or dropped). Returns the clean request or an error in
 * plain words.
 */
export function checkTap(body: TapInput, openSlugs: Iterable<string>):
  { ok: true; slug: string; action: ProposalAction; note: string | null } | { ok: false; error: string } {
  const slug = String(body?.slug ?? '').trim().toLowerCase();
  const action = String(body?.action ?? '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'That is not a proposal name.' };
  if (action !== 'ship' && action !== 'change' && action !== 'drop') return { ok: false, error: 'Ship, Change or Drop only.' };
  if (!new Set(openSlugs).has(slug)) return { ok: false, error: 'This proposal is no longer open. Refresh the page.' };
  const note = String(body?.note ?? '').trim().slice(0, NOTE_MAX);
  if (action === 'change' && !note) return { ok: false, error: 'Say what to change first.' };
  return { ok: true, slug, action, note: action === 'change' ? note : null };
}

/** Telegram ids are numbers; anything else → null. */
function tgId(v: string | number | null | undefined): number | null {
  const n = Number(String(v ?? '').trim().replace(/^["']|["']$/g, ''));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * The row a tap inserts — exactly the columns the bot's recordRequest writes. From the
 * page there is no Telegram message, so thread and message are null and the worker
 * answers in Adrian's own chat with the bot (the same as his typed "ship proposal <slug>"
 * in the DM). `adrianId` = his Telegram user id, which is also that chat's id.
 */
export function proposalRequestRow(tap: { slug: string; action: ProposalAction; note: string | null }, adrianId: string | number | null | undefined): ProposalRequestRow {
  const id = tgId(adrianId);
  return {
    slug: tap.slug, action: tap.action, requested_by: id, chat_id: id,
    thread_id: null, message_id: null, note: tap.note ? tap.note.slice(0, NOTE_MAX) : null,
  };
}

export type RequestState = { slug: string; action: string; status: string; requested_at: string };

/** The newest request per slug (rows in any order). */
export function latestRequests(rows: RequestState[]): Record<string, RequestState> {
  const out: Record<string, RequestState> = {};
  for (const r of rows) {
    const cur = out[r.slug];
    if (!cur || Date.parse(r.requested_at) > Date.parse(cur.requested_at)) out[r.slug] = r;
  }
  return out;
}

/** The one line a card shows once something was asked of it. */
export function requestWords(r: RequestState): string {
  const busy = r.status === 'pending' || r.status === 'running';
  const verb = r.action === 'ship' ? ['Shipping', 'Shipped', 'Did not ship'] : r.action === 'drop' ? ['Dropping', 'Dropped', 'Not dropped'] : ['Changing', 'Changed — the new version is in Telegram', 'Not changed'];
  if (busy) return `⏳ ${verb[0]}… the answer comes in Telegram`;
  if (r.status === 'done') return `✅ ${verb[1]}`;
  // clashed with newer work; a session has to redo it (22 Oct 2026)
  if (r.status === 'needs_session') return `🛠 ${verb[2]} — it clashes with newer work, a session has to redo it`;
  return `❌ ${verb[2]} — see Telegram`;
}

// ── Last night and the week, from the logbook ─────────────────────────────────

export type RunRow = { job: string; ran_at: string; ok: boolean; summary: string | null; meta?: Record<string, unknown> | null };

/** The night jobs, in the order the night runs them, with a plain name each. */
export const NIGHT_JOBS: { job: string; name: string }[] = [
  { job: 'nightly-builder', name: 'Night builder' },
  { job: 'flag-review', name: 'Flagged answers checked' },
  { job: 'file-subgroups', name: 'Questions filed into groups' },
  { job: 'twin-batch', name: 'Our own maths questions' },
  { job: 'science-twins', name: 'Our own science questions' },
  { job: 'day-review', name: "Yesterday's bot answers read" },
  { job: 'bot-review', name: 'Chat bot fixes' },
  { job: 'marking-review', name: 'Marked pages read' },
  { job: 'extraction-learn', name: 'Extraction rules' },
  { job: 'marking-learn', name: 'Learning from your mark changes' },
  { job: 'marking-fix', name: 'Red pen fixes' },
  { job: 'doc-sweep', name: 'Old instructions tidied (Sundays)' },
];
const NAME = new Map(NIGHT_JOBS.map((j) => [j.job, j.name]));
/** Lanes that run many times a night: their line adds the runs up instead of quoting one. */
const LANES = new Set(['twin-batch', 'science-twins']);

/** "Last night" starts at 6 pm Singapore time the day before today. */
export function nightStart(now: number = Date.now()): Date {
  const yesterday = addDaysISO(sgtDateISO(now), -1);
  return new Date(sgtDayStart(yesterday).getTime() + 18 * 3600_000);
}

/**
 * What a job fixed across its runs in one stretch. A job that runs once a night can stamp
 * twice (the day-review has two writers; the fixer retries) and both rows describe the
 * same fixes — so the biggest single run counts, not the sum.
 */
function fixedAcross(job: string, rows: RunRow[]): number {
  return rows.reduce((n, r) => Math.max(n, fixCount(job, r.summary)), 0);
}

const num = (re: RegExp, s: string) => { const m = re.exec(s); return m ? Number(m[1]) || 0 : 0; };

/**
 * How many things one run says it FIXED by itself (not made, not read — fixed). Read off
 * the summary each job already writes; a job whose wording is not known counts 0.
 */
export function fixCount(job: string, summary: string | null | undefined): number {
  const s = String(summary ?? '');
  switch (job) {
    case 'marking-fix': return num(/(\d+) class(?:es)? fixed/i, s) + num(/(\d+) of Adrian's own reports done/i, s);
    case 'bot-review': return (s.match(/\bshipped\b/gi) ?? []).length;
    case 'day-review': return num(/(\d+) (?:topic |subject )?labels? fixed/i, s) || num(/labels? fixed (\d+)/i, s) || num(/(\d+) topics? fixed/i, s);
    case 'doc-sweep': return num(/fixed (\d+)/i, s);
    case 'extraction-learn': return num(/applied (\d+)/i, s);
    case 'flag-review': return /\bfixed\b/i.test(s) ? 1 : 0;
    case 'nightly-builder': return num(/built (\d+)/i, s) || num(/(\d+) built/i, s);
    default: return 0;
  }
}

export type NightLine = {
  job: string; name: string;
  /** The newest run in the window; null = the job did not run last night. */
  at: string | null;
  ok: boolean | null;
  /** What it did, in one plain line (lib plainLine) — never the stored summary, which carries
   *  names; for a lane, its runs added up. */
  summary: string | null;
  runs: number;
  fixed: number;
};

function laneSummary(rows: RunRow[]): string {
  let published = 0, looked = 0;
  for (const r of rows) {
    const m = r.meta ?? {};
    published += Number((m as Record<string, unknown>).published) || 0;
    looked += Number((m as Record<string, unknown>).looked) || 0;
  }
  const failed = rows.filter((r) => !r.ok).length;
  return `Wrote ${published} new question${published === 1 ? '' : 's'}${looked ? ` (of ${looked} tried)` : ''} in ${rows.length} run${rows.length === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}.`;
}

/** One line per night job for the window [nightStart(now), now]. Pure. */
export function lastNight(rows: RunRow[], now: number = Date.now()): { since: string; lines: NightLine[]; fixed: number } {
  const since = nightStart(now).getTime();
  const lines: NightLine[] = [];
  let fixed = 0;
  for (const { job, name } of NIGHT_JOBS) {
    const mine = rows
      .filter((r) => r.job === job && Date.parse(r.ran_at) >= since && Date.parse(r.ran_at) <= now)
      .sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
    if (!mine.length) { lines.push({ job, name, at: null, ok: null, summary: null, runs: 0, fixed: 0 }); continue; }
    const newest = mine[0];
    const f = fixedAcross(job, mine);
    fixed += f;
    lines.push({
      job, name, at: newest.ran_at,
      ok: LANES.has(job) ? mine.every((r) => r.ok) : newest.ok,
      summary: LANES.has(job) ? laneSummary(mine) : (plainLine(job, newest.summary, newest.meta) || null),
      runs: mine.length, fixed: f,
    });
  }
  return { since: new Date(since).toISOString(), lines, fixed };
}

export type HistoryDay = { date: string; runs: number; failed: number; summary: string | null; fixed: number };
export type JobHistory = { job: string; name: string; days: HistoryDay[] };

/** Seven Singapore days per night job, newest first; a day with no run is listed as such. Pure. */
export function weekHistory(rows: RunRow[], now: number = Date.now(), daysBack = 7): JobHistory[] {
  const today = sgtDateISO(now);
  const dates = Array.from({ length: daysBack }, (_, i) => addDaysISO(today, -i));
  return NIGHT_JOBS.map(({ job, name }) => {
    const mine = rows.filter((r) => r.job === job);
    const days = dates.map((date) => {
      const d = mine.filter((r) => sgtDateISO(Date.parse(r.ran_at)) === date).sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
      if (!d.length) return { date, runs: 0, failed: 0, summary: null, fixed: 0 };
      return {
        date, runs: d.length, failed: d.filter((r) => !r.ok).length,
        summary: LANES.has(job) ? laneSummary(d) : (plainLine(job, d[0].summary, d[0].meta) || null),
        fixed: fixedAcross(job, d),
      };
    });
    return { job, name, days };
  });
}

/** The plain name of a job, for a line on this page (falls back to the job's own id). */
export function jobName(job: string): string {
  return NAME.get(job) ?? job;
}

// ── The open proposals from the bot (12 Oct 2026) ─────────────────────────────
// The bot serves its ledger's open rows as JSON (bot GET /api/internal/proposals, lib/proposals.js
// openProposalsJson = stillOpen + problemAndFix), so the website needs no GitHub key.

export type BotProposal = {
  slug?: unknown; title?: unknown; days?: unknown; approved?: unknown;
  problem?: unknown; solution?: unknown; fix?: unknown; plain?: unknown; repo?: unknown;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The bot's JSON → the cards this page draws. Rows without a proper slug are dropped. The bot's
 *  order is kept (approved first, then longest waiting — the Telegram list's order). Pure. */
export function fromBotProposals(rows: unknown): OpenProposal[] {
  if (!Array.isArray(rows)) return [];
  const out: OpenProposal[] = [];
  const seen = new Set<string>();
  for (const r of rows as BotProposal[]) {
    const slug = str(r?.slug);
    if (!slug || !SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    const days = typeof r.days === 'number' && Number.isFinite(r.days) ? Math.max(0, Math.floor(r.days)) : null;
    const problem = str(r.problem), fix = str(r.fix);
    out.push({
      slug, name: str(r.title), title: str(r.title) || slugName(slug), date: '', days,
      problem: problem && fix ? problem : null, solution: problem && fix ? str(r.solution) : null, fix: problem && fix ? fix : null,
      text: problem && fix ? null : str(r.plain),
      repo: r.repo === 'website' ? 'website' : 'bot',
      approved: r.approved === true,
    });
  }
  return out;
}

// ── One plain line per night job (12 Oct 2026) ────────────────────────────────
// Adrian reads this page on his phone: short, plain words, one idea, no jargon, no model
// names — and NEVER a student's name (the stored summaries carry names and paper ids, so the
// page shows only this line, never the raw summary). Read off the summary each job writes;
// anything not understood falls back to a cut-short first clause with names taken out.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const n1 = (re: RegExp, s: string): number | null => { const m = re.exec(s); return m ? Number(m[1]) : null; };
const sentence = (t: string) => { const x = t.trim().replace(/[\s,;:.]+$/, ''); return x ? `${x.charAt(0).toUpperCase()}${x.slice(1)}.` : ''; };

/** The safe fallback: the first clause, with no dates, ids, brackets or capitalised words (a
 *  name is capitalised; so are a few harmless words — losing those is the price). */
export function cutShort(summary: string | null | undefined, max = 70): string {
  let s = String(summary ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\d{4}-\d{2}-\d{2}\S*\s*[:·-]?\s*/, '').replace(/^\d{1,2} [A-Z][a-z]{2} \d{4}( [A-Z][a-z]{2})?\s*/, '');
  s = s.split(/\s*(?:[;(]|\s—\s|\s–\s)/)[0];
  s = s.replace(/\b[0-9a-f]{7,40}\b/g, '').replace(/#\d+/g, '');
  const words = s.split(' ').filter(Boolean);
  s = words.filter((w) => !/^[A-Z][a-z]/.test(w)).join(' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) s = `${s.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return s ? sentence(s).replace(/….$/, '…') : '';
}

/** Count the proposal slugs a bot-review summary says it opened ("proposed a-b (…) and c-d"). */
function proposedSlugs(s: string): number {
  const flat = s.replace(/\([^()]*\)/g, '').replace(/\s+/g, ' ');
  let n = 0;
  for (const m of flat.matchAll(/\bproposed ((?:[a-z0-9]+(?:-[a-z0-9]+)+)(?:(?:,| and) (?:[a-z0-9]+(?:-[a-z0-9]+)+))*)/g)) {
    n += m[1].split(/,| and /).filter(Boolean).length;
  }
  return n;
}

/** One run's summary → one plain line. `meta` is used where the job stores numbers there. Pure. */
export function plainLine(job: string, summary: string | null | undefined, meta?: Record<string, unknown> | null): string {
  const s = String(summary ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const waiting = (p: number) => (p > 0 ? `${plural(p, 'change')} waiting for your Ship` : '');
  const join = (...parts: string[]) => parts.filter(Boolean).join('; ');
  switch (job) {
    case 'nightly-builder': {
      if (/nothing approved/i.test(s)) return 'Nothing approved to build.';
      const b = n1(/built (\d+)/i, s) ?? n1(/(\d+) built/i, s);
      if (b != null) return sentence(b ? `Built ${plural(b, 'change')} you approved` : 'Nothing built');
      break;
    }
    case 'flag-review': {
      const t = n1(/(\d+) tickets? read/i, s);
      if (t == null) break;
      const wrong = n1(/(\d+) wrong repl/i, s) ?? 0;
      const fixed = /\bfixed\b/i.test(s);
      return sentence(join(`Checked ${plural(t, 'flagged answer')}${fixed ? ' and fixed the cause' : ''}`,
        wrong ? `the bot's reply was wrong ${wrong === 1 ? 'once' : `${wrong} times`}` : ''));
    }
    case 'file-subgroups': {
      const left = n1(/(\d+) left the backlog/i, s), still = n1(/(\d+) still to file/i, s);
      if (left == null || still == null) break;
      if (!left && !still) return 'No new questions to file.';
      return sentence(join(left ? `Filed ${plural(left, 'question')} into practice groups` : 'Filed none', still ? `${still} still to file` : 'none left'));
    }
    case 'day-review': {
      const q = n1(/(\d+) (?:rows|questions)\b/i, s);
      if (q == null) break;
      const labels = n1(/(\d+) (?:topic |subject )?labels? fixed/i, s) ?? n1(/labels? fixed (\d+)/i, s) ?? n1(/(\d+) topics? fixed/i, s) ?? 0;
      const wrong = n1(/(\d+) wrong\b/i, s) ?? 0;
      const part = n1(/(\d+) incomplete/i, s) ?? 0;
      const verdict = !wrong && !part ? 'all right' : [wrong ? `${wrong} wrong` : '', part ? `${part} not complete` : ''].filter(Boolean).join(', ');
      return `Read ${plural(q, 'chat-bot answer')} from yesterday: ${verdict}${labels ? `, ${plural(labels, 'label')} fixed` : ''}.`;
    }
    case 'bot-review': {
      const shipped = (s.match(/\bshipped\b/gi) ?? []).length;
      const proposed = proposedSlugs(s);
      if (!shipped && !proposed) return /\bfound\b|\brecorded\b|\bno change\b/i.test(s) ? 'Looked at the chat bot: nothing to change.' : cutShort(s);
      return sentence(join(shipped ? `Fixed ${plural(shipped, 'thing')} in the chat bot` : '', waiting(proposed)));
    }
    case 'marking-review': {
      const pages = n1(/(\d+) pages read/i, s), papers = n1(/(\d+) papers/i, s);
      if (pages == null) break;
      const found = n1(/~?(\d+) findings/i, s);
      const items = n1(/(\d+) items?\b/i, s);
      return sentence(join(`Read ${plural(pages, 'marked page')}${papers != null ? ` from ${plural(papers, 'paper')}` : ''}`,
        found != null ? `about ${found} small slips` : '', items ? `${items} sent to you` : ''));
    }
    case 'marking-fix': {
      if (/ended without its logbook row/i.test(s)) return 'Stopped before it finished; it tries again.';
      const classes = n1(/(\d+) class(?:es)? fixed/i, s);
      if (classes == null) break;
      const pages = n1(/(\d+) pages?\b/i, s);
      const yours = n1(/(\d+) of Adrian's own reports done/i, s) ?? 0;
      const proposed = n1(/(\d+) proposed/i, s) ?? 0;
      return sentence(join(classes ? `Fixed ${plural(classes, 'kind')} of red-pen mistakes${pages ? ` on ${plural(pages, 'page')}` : ''}` : 'No red-pen mistakes fixed',
        yours ? `did ${yours} of your reports` : '', waiting(proposed)));
    }
    case 'marking-learn': {
      if (/no new corrections/i.test(s)) return 'No new mark changes from you to learn from.';
      const read = n1(/(\d+) corrections? read/i, s);
      if (read == null) break;
      const patterns = n1(/(\d+) patterns?/i, s) ?? 0;
      const proposed = n1(/(\d+) proposed/i, s) ?? 0;
      return sentence(join(`Read ${plural(read, 'mark change')} of yours`, patterns ? `found ${plural(patterns, 'pattern')}` : 'no pattern yet', waiting(proposed)));
    }
    case 'extraction-learn': {
      const read = n1(/read (\d+) papers?/i, s);
      if (read == null) break;
      if (!read) return 'No new papers to learn from.';
      const applied = n1(/applied (\d+)/i, s) ?? 0, proposed = n1(/proposed (\d+)/i, s) ?? 0;
      return sentence(join(`Read ${plural(read, 'new paper')}`, applied ? `added ${plural(applied, 'reading rule')}` : (proposed ? '' : 'nothing to change'), waiting(proposed)));
    }
    case 'doc-sweep': {
      const fixed = n1(/fixed (\d+)/i, s);
      if (fixed == null) break;
      const proposed = n1(/proposed (\d+)/i, s) ?? 0;
      return sentence(join(fixed ? `Fixed ${plural(fixed, 'out-of-date line')} in the instructions` : 'Instructions all up to date', waiting(proposed)));
    }
    case 'twin-batch': case 'science-twins': {
      const m = meta ?? {};
      const p = Number((m as Record<string, unknown>).published);
      if (Number.isFinite(p)) return `Wrote ${plural(p, 'new question')}.`;
      break;
    }
  }
  return cutShort(s);
}

/** What the "Needs your look" number is made of, in words: `${n} jobs failed or late` and each
 *  dashboard count with its own label. `sub` fits under the big number; `parts` lists them all. */
export function needsWords(staleCount: number, tiles: { value: string; label: string }[]): { count: number; parts: string[]; sub: string } {
  const parts: string[] = [];
  if (staleCount > 0) parts.push(`${plural(staleCount, 'job')} failed or late`);
  let count = staleCount;
  for (const t of tiles) {
    const n = Number.parseInt(t.value, 10) || 0;
    if (!n) continue;
    count += n;
    parts.push(`${n} ${t.label.charAt(0).toLowerCase()}${t.label.slice(1)}`);
  }
  const sub = parts.length === 0 ? 'nothing' : parts.length === 1 ? parts[0] : `${parts.length} kinds, below`;
  return { count, parts, sub };
}

/** A job-health reason in plain words, with no stored summary in it (summaries carry names). */
export function staleWords(job: string, reason: string): string {
  const m = /^last run FAILED(?: — ([\s\S]*))?$/.exec(reason);
  if (m) { const p = m[1] ? plainLine(job, m[1]) : ''; return p ? `Last run failed: ${p.charAt(0).toLowerCase()}${p.slice(1)}` : 'Last run failed.'; }
  const h = /hasn't run in (\d+)h/.exec(reason);
  if (h) return `Has not run for ${h[1]} hours.`;
  if (/no run this month/.test(reason)) return 'Has not run this month.';
  return 'Did not run on time.';
}
