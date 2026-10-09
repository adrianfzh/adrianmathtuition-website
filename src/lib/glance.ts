// The admin dashboard "at a glance" (5 Oct 2026, Adrian: "admin hub seems
// cluttered > why not have a dashboard?" … "make the dashboard 'at a glance' -
// like a monitoring dashboard").
//
// Pure. The store (lib/glance-store.ts) reads counts from Supabase, Airtable,
// the bot and the logbook into GlanceFacts; this file turns them into tiles:
// a big number, a colour, one plain word saying what the colour means, and
// sometimes a 7-day trend. A fact that could not be read is null and its tile
// says "No reading" in grey — never a made-up zero.

export type Tone = 'green' | 'amber' | 'red' | 'grey';

export interface Tile {
  id: string;
  /** What the number counts, in plain words ("Papers waiting"). */
  label: string;
  /** The big number or short value ("3", "45 min", "62 %"). */
  value: string;
  /** One short line under it — never a paragraph. */
  sub?: string;
  tone: Tone;
  /** The plain word for the colour ("Fine", "Slow", "Stopped"). */
  status: string;
  href?: string;
  /** Oldest → newest, one value per day. */
  trend?: number[];
  /**
   * The things themselves, on the tile (6 Oct 2026, Adrian: "can i have a dash
   * board with information on the dashboard itself?") — which papers, which
   * jobs, which students. At most ROWS_SHOWN; `more` says how many are left.
   */
  rows?: Row[];
  more?: string;
  /** The rows say everything the one-line `sub` says — the page shows the rows only. */
  rowsReplaceSub?: boolean;
  /** Takes two columns — a tile that carries a list. */
  wide?: boolean;
}

/** One line on a tile: the thing, a short grey note beside it, and where a tap goes. */
export interface Row { main: string; note?: string; href?: string; tone?: Tone }

export const ROWS_SHOWN = 5;

/** The first ROWS_SHOWN rows and the "+N more" line for the rest. */
export function capRows(rows: Row[], total: number = rows.length, shown: number = ROWS_SHOWN): { rows?: Row[]; more?: string } {
  if (!rows.length) return {};
  const cut = rows.slice(0, shown);
  const left = Math.max(total, rows.length) - cut.length;
  return { rows: cut, more: left > 0 ? `+${left} more` : undefined };
}

export interface Section { id: 'needs' | 'today' | 'machine' | 'week'; title: string; tiles: Tile[] }

export interface LessonLink { lessonId: string; studentId: string; name: string; time: string | null; href: string }

export interface JobLine { ok: boolean; at: string; summary: string | null }

export interface GlanceFacts {
  // Needs you
  questionProposals: number | null;
  rulesProposed: number | null;
  /** Ship / Change / Drop requests the worker could not finish, last 7 days. */
  shipsFailed: number | null;
  /** Marked papers not yet released that carry parts to check. */
  papersToCheck: { papers: number; parts: number; list?: { id: string; student: string | null; paper: string | null; parts: number }[] } | null;
  extractionFlagged: number | null;
  /** The lists behind the counts above — newest first, a handful each. */
  shipsFailedList?: { slug: string; action: string; result: string | null; at: string }[] | null;
  extractionFlaggedList?: { file: string; status: string; note: string | null }[] | null;
  questionProposalsByLevel?: { level: string; n: number }[] | null;
  /** Lessons waiting to be logged, per lesson date, newest first. */
  lessonsToLogDays?: { date: string; n: number }[] | null;
  failedHandins: number | null;
  /** 💡 Students' suggestions not yet looked at (status 'new'). */
  suggestionsNew: number | null;
  // Today
  lessonsToday: LessonLink[] | null;
  lessonsToLog: number | null;
  marked: { today: number; perDay: number[]; list?: { id: string; student: string | null; paper: string | null }[] } | null;
  /** Practice questions real students answered (lib/dash-counts.ts): today, who, and the 7-day strip. */
  practice: { students: number; questions: number; perDay: number[] } | null;
  /** Papers real students handed in (lib/dash-counts.ts): today and the 7-day strip. Optional so older callers still build. */
  handedIn?: { today: number; perDay: number[] } | null;
  // The machine
  queue: { waiting: number; marking: number; oldestMinutes: number | null; list?: { student: string | null; paper: string; phase: string; waitingMinutes: number; pagesDone: number | null; pagesTotal: number | null }[] } | null;
  extraction: { waiting: number; working: number; held: number; doneToday: number; done24h: number; perDay: number[]; workingOn?: string[] } | null;
  twins: { today: number; perDay: number[]; left: Record<string, number | null> | null } | null;
  jobs: { total: number; late: { job: string; reason: string }[]; failing: string[]; failingWhy?: Record<string, string>; lastSelfFix: { job: string; at: string; summary: string | null } | null } | null;
  logins: { name: string; on: boolean; fiveHour: number | null; sevenDay: number | null; at: string | null }[] | null;
  disk: { pct: number; at: string } | null;
  deploys: { website: { sha: string | null; message: string | null } | null; bot: { up: boolean; uptimeSec: number | null } | null };
  backups: { fileBackup: JobLine | null; backupCheck: JobLine | null; leakTest: JobLine | null };
  // This week
  stuck: { at: string; students: { area: string; names: string[]; groupLabel: string }[]; scienceGaps: string[] } | null;
  cost: { perPaper7d: number | null; papers7d: number; monthToDate: number | null; month: string; perDay: number[] } | null;
  /** Which app tabs students opened in the last 7 days (6 Oct 2026, 'tab:view'): unique students, busiest tabs first. */
  tabs?: { students: number; top: { label: string; students: number; opens: number }[] } | null;
}

export interface Glance { sections: Section[]; lessons: LessonLink[] | null; generatedAt: string }

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const NO_READING = (id: string, label: string, href?: string): Tile => ({ id, label, value: '—', tone: 'grey', status: 'No reading', href });

/** "45 min", "3 h", "2 days" — the age of a thing, short. */
export function ageLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / DAY)} days`;
}

/** Count instants per Singapore day for the last `days` days, oldest first (today last). */
export function perDay(instants: (string | null | undefined)[], days: number, now: number): number[] {
  const out = new Array(days).fill(0);
  const dayOf = (t: number) => Math.floor((t + 8 * HOUR) / DAY);
  const today = dayOf(now);
  for (const s of instants) {
    if (!s) continue;
    const t = Date.parse(s);
    if (!Number.isFinite(t)) continue;
    const i = days - 1 - (today - dayOf(t));
    if (i >= 0 && i < days) out[i] += 1;
  }
  return out;
}

/** Sum values per Singapore day (same window rule as perDay). */
export function sumPerDay(rows: { at: string; value: number }[], days: number, now: number): number[] {
  const out = new Array(days).fill(0);
  const dayOf = (t: number) => Math.floor((t + 8 * HOUR) / DAY);
  const today = dayOf(now);
  for (const r of rows) {
    const t = Date.parse(r.at);
    if (!Number.isFinite(t) || !Number.isFinite(r.value)) continue;
    const i = days - 1 - (today - dayOf(t));
    if (i >= 0 && i < days) out[i] += r.value;
  }
  return out.map((v) => Math.round(v * 100) / 100);
}

/**
 * Hours until the extraction queue empties at the last day's pace, or null
 * when nothing finished in a day (no pace to go on) or nothing is waiting.
 */
export function extractionEtaHours(waiting: number, done24h: number): number | null {
  if (waiting <= 0 || done24h <= 0) return null;
  return waiting / (done24h / 24);
}

export function etaLabel(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `about ${Math.round(hours)} h`;
  return `about ${Math.round(hours / 24)} days`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const firstName = (s: string) => (s || '').trim().split(/\s+/)[0] || s;
/** A paper's row: the student's first name with the paper beside it — or the paper alone when the run has no name on it. */
function who(student: string | null, paper: string | null, tail?: string): { main: string; note?: string } {
  const name = (student || '').trim();
  const title = (paper || '').trim() || 'A paper';
  return name ? { main: firstName(name), note: [title, tail].filter(Boolean).join(' · ') } : { main: title, note: tail };
}
/** Why a ship did not finish, without the ❌ and the slug the row already shows. */
function shipWhy(result: string | null): string {
  const s = (result || '').replace(/^[^A-Za-z]+/, '').replace(/^[\w-]+:\s*/, '').replace(/ for [\w-]+(?= \()/, '').split(/(?<=\.)\s/)[0];
  return s.length > 70 ? `${s.slice(0, 69)}…` : s || 'did not finish';
}
function shortNote(s: string | null): string | undefined {
  const t = (s || '').split(/[—|]/)[0].trim().replace(/:$/, '');
  return t ? (t.length > 60 ? `${t.slice(0, 59)}…` : t) : undefined;
}
/** "today", "yesterday", "Fri 2 Oct" for a YYYY-MM-DD lesson date. */
function dayWord(date: string, now: number): string {
  const today = new Date(now + 8 * HOUR).toISOString().slice(0, 10);
  const yesterday = new Date(now + 8 * HOUR - DAY).toISOString().slice(0, 10);
  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  // by hand: toLocaleDateString's commas differ between Node versions
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
}
const money = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString('en-US')}`;

function needsTiles(f: GlanceFacts): Tile[] {
  const out: Tile[] = [];
  const add = (n: number | null, t: Omit<Tile, 'value' | 'tone' | 'status'> & { tone?: Tone }) => {
    if (!n) return; // the row shows only what is non-zero
    out.push({ ...t, value: String(n), tone: t.tone ?? 'amber', status: 'Needs you' });
  };
  add(f.failedHandins, { id: 'failed-handins', label: 'Hand-ins failed on a phone', sub: 'last 24 h', href: '/admin/students', tone: 'red' });
  if (f.papersToCheck && f.papersToCheck.papers > 0) {
    const list = f.papersToCheck.list ?? [];
    out.push({
      id: 'papers-to-check', label: 'Marked papers to check', value: String(f.papersToCheck.papers), sub: plural(f.papersToCheck.parts, 'part') + ' to look at', tone: 'amber', status: 'Needs you', href: '/admin/mark-paper',
      ...capRows(list.map((p) => ({ ...who(p.student, p.paper, plural(p.parts, 'part')), href: `/admin/mark-paper?run=${p.id}` })), f.papersToCheck.papers),
      wide: list.length > 0,
    });
  }
  add(f.rulesProposed, { id: 'rules', label: 'Extraction rules to decide', href: '/admin/extraction-rules' });
  const ships = f.shipsFailedList ?? [];
  add(f.shipsFailed, {
    id: 'ships-failed', label: 'Proposals that did not ship', sub: 'last 7 days · ask a session', tone: 'red',
    ...capRows(ships.map((p) => ({ main: p.slug, note: shipWhy(p.result), tone: 'red' as Tone })), f.shipsFailed ?? 0), wide: ships.length > 0,
  });
  const flagged = f.extractionFlaggedList ?? [];
  add(f.extractionFlagged, {
    id: 'extraction-flagged', label: 'Extraction papers flagged', href: '/admin/library',
    ...capRows(flagged.map((p) => ({ main: p.file.replace(/\.pdf$/i, ''), note: p.status === 'failed' ? 'failed' : shortNote(p.note), tone: p.status === 'failed' ? 'red' as Tone : undefined })), f.extractionFlagged ?? 0),
    wide: flagged.length > 0,
  });
  add(f.suggestionsNew, { id: 'suggestions', label: 'Suggestions (new)', sub: 'from students', href: '/admin/suggestions' });
  const byLevel = f.questionProposalsByLevel ?? [];
  add(f.questionProposals, {
    id: 'question-proposals', label: 'Questions to vet', sub: 'written by the sheets', href: '/admin/question-proposals',
    rows: byLevel.length ? byLevel.map((l) => ({ main: l.level, note: plural(l.n, 'question') })) : undefined,
  });
  return out;
}

function todayTiles(f: GlanceFacts, now: number): Tile[] {
  const out: Tile[] = [];
  if (f.lessonsToday == null) out.push(NO_READING('lessons', 'Lessons today', '/admin/schedule'));
  else out.push({
    id: 'lessons', label: 'Lessons today', value: String(f.lessonsToday.length),
    sub: f.lessonsToday.length ? f.lessonsToday.slice(0, 4).map((l) => firstName(l.name)).join(', ') + (f.lessonsToday.length > 4 ? '…' : '') : 'No lessons',
    tone: f.lessonsToLog ? 'amber' : 'green',
    status: f.lessonsToLog ? `${f.lessonsToLog} to log` : 'All logged',
    href: f.lessonsToLog ? '/admin/log' : '/admin/schedule',
    ...capRows(f.lessonsToday.map((l) => ({ main: l.name, note: `${l.time || '—'} · next lesson page`, href: l.href })), f.lessonsToday.length, 8),
    wide: f.lessonsToday.length > 2, rowsReplaceSub: true,
  });
  const days = f.lessonsToLogDays ?? [];
  if (f.lessonsToLog && days.length) {
    const head = days.slice(0, 4);
    const rest = days.slice(4).reduce((a, d) => a + d.n, 0);
    out.push({
      id: 'to-log', label: 'Lessons to log', value: String(f.lessonsToLog), tone: 'amber', status: 'Waiting for you', href: '/admin/log',
      rows: [...head.map((d) => ({ main: dayWord(d.date, now), note: plural(d.n, 'lesson') })), ...(rest ? [{ main: 'Earlier', note: plural(rest, 'lesson') }] : [])],
    });
  }
  if (f.marked == null) out.push(NO_READING('marked', 'Papers marked today', '/admin/mark-paper'));
  else out.push({
    id: 'marked', label: 'Papers marked today', value: String(f.marked.today),
    sub: f.queue ? `${f.queue.waiting + f.queue.marking} waiting` : undefined,
    tone: 'green', status: f.marked.today ? 'Going out' : 'Quiet', href: '/admin/mark-paper', trend: f.marked.perDay,
    ...capRows((f.marked.list ?? []).map((p) => ({ ...who(p.student, p.paper), href: `/admin/mark-paper?run=${p.id}` })), f.marked.today, 4),
  });
  if (f.handedIn == null) out.push(NO_READING('handed-in', 'Papers handed in', '/admin/papers'));
  else out.push({
    id: 'handed-in', label: 'Papers handed in', value: String(f.handedIn.today),
    tone: 'green', status: f.handedIn.today ? 'Coming in' : 'Quiet', href: '/admin/papers', trend: f.handedIn.perDay,
  });
  if (f.practice == null) out.push(NO_READING('practice', 'Practice questions done', '/admin/students'));
  else out.push({
    id: 'practice', label: 'Practice questions done', value: String(f.practice.questions),
    sub: `${plural(f.practice.students, 'student')}`,
    tone: 'green', status: f.practice.questions ? 'Practising' : 'Quiet', href: '/admin/students', trend: f.practice.perDay,
  });
  return out;
}

/** The reason a job is late or failed, without the "last run FAILED —" lead-in. */
function jobWhy(reason: string | undefined): string | undefined {
  const s = (reason || '').replace(/^last run FAILED( — )?/, '').replace(/\s+/g, ' ').trim();
  return s ? (s.length > 80 ? `${s.slice(0, 79)}…` : s) : undefined;
}

function machineTiles(f: GlanceFacts, now: number): Tile[] {
  const out: Tile[] = [];

  // Marking queue
  if (!f.queue) out.push(NO_READING('queue', 'Marking queue', '/admin/ops'));
  else {
    const q = f.queue;
    const old = q.oldestMinutes ?? 0;
    const total = q.waiting + q.marking;
    const tone: Tone = total === 0 ? 'green' : old > 180 ? 'red' : old > 60 ? 'amber' : 'green';
    out.push({
      id: 'queue', label: 'Marking queue', value: String(total),
      sub: total ? `${q.marking} being marked · oldest ${ageLabel(old * MIN)}` : 'Empty',
      tone, status: total === 0 ? 'Clear' : tone === 'red' ? 'Stuck?' : tone === 'amber' ? 'Slow' : 'Moving', href: '/admin/ops',
      ...capRows((q.list ?? []).map((r) => ({
        main: `${firstName(r.student || 'A student')} · ${r.paper}`,
        note: `${r.phase === 'unclaimed' ? 'waiting' : r.pagesTotal ? `page ${r.pagesDone ?? 0} of ${r.pagesTotal}` : r.phase} · ${ageLabel(r.waitingMinutes * MIN)}`,
      })), total, 4),
      wide: (q.list ?? []).length > 0,
    });
  }

  // Extraction
  if (!f.extraction) out.push(NO_READING('extraction', 'Extraction', '/admin/library'));
  else {
    const e = f.extraction;
    const stopped = e.waiting > 0 && e.working === 0 && e.done24h === 0;
    const eta = etaLabel(extractionEtaHours(e.waiting, e.done24h));
    out.push({
      id: 'extraction', label: 'Papers to extract', value: String(e.waiting),
      sub: [`${e.doneToday} done today`, eta ? `done in ${eta}` : null, e.held ? `${e.held} on hold` : null].filter(Boolean).join(' · '),
      tone: stopped ? 'red' : 'green', status: stopped ? 'Stopped' : e.working ? `${e.working} working` : e.waiting ? 'Waiting' : 'Clear',
      href: '/admin/library', trend: e.perDay,
      ...capRows((e.workingOn ?? []).map((n) => ({ main: n.replace(/\.pdf$/i, ''), note: 'being read' })), e.working, 3),
    });
  }

  // Twins
  if (!f.twins) out.push(NO_READING('twins', 'Twins written', '/admin/generated'));
  else {
    const t = f.twins;
    const left = t.left ? Object.entries(t.left).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(' · ') : null;
    const week = t.perDay.reduce((a, b) => a + b, 0);
    out.push({
      id: 'twins', label: 'Twins today', value: String(t.today),
      sub: left ? `left: ${left}` : `${week} this week`,
      tone: week === 0 ? 'amber' : 'green', status: week === 0 ? 'None this week' : t.today ? 'Writing' : 'Quiet today',
      href: '/admin/ops', trend: t.perDay,
    });
  }

  // Worker health (the logbook)
  if (!f.jobs) out.push(NO_READING('jobs', 'Scheduled jobs', '/admin/ops'));
  else {
    const j = f.jobs;
    const bad = j.failing.length + j.late.length;
    const fix = j.lastSelfFix ? `self-fix ${ageLabel(now - Date.parse(j.lastSelfFix.at))} ago` : null;
    out.push({
      id: 'jobs', label: 'Scheduled jobs', value: bad ? String(bad) : String(j.total),
      sub: bad
        ? [...j.failing.map((x) => `${x} failed`), ...j.late.map((x) => `${x.job} late`)].slice(0, 2).join(' · ')
        : ['all on time', fix].filter(Boolean).join(' · '),
      tone: j.failing.length ? 'red' : j.late.length ? 'amber' : 'green',
      status: j.failing.length ? `${j.failing.length} failed` : j.late.length ? `${j.late.length} late` : 'All fine',
      href: '/admin/ops',
      ...capRows([
        ...j.failing.map((x) => ({ main: x, note: jobWhy(j.failingWhy?.[x]) || 'last run failed', tone: 'red' as Tone })),
        ...j.late.map((x) => ({ main: x.job, note: jobWhy(x.reason) || 'late', tone: 'amber' as Tone })),
      ]),
      wide: bad > 0, rowsReplaceSub: true,
    });
  }

  // Plan logins
  if (!f.logins || !f.logins.length) out.push(NO_READING('logins', 'Plan logins', '/admin/switches'));
  else {
    const live = f.logins.filter((l) => l.on);
    const week = live.map((l) => l.sevenDay).filter((v): v is number => v != null);
    const roomiest = week.length ? Math.min(...week) : null;
    const full = week.filter((v) => v >= 95).length;
    const tone: Tone = !live.length ? 'red' : roomiest == null ? 'grey' : roomiest >= 95 ? 'red' : roomiest >= 80 ? 'amber' : 'green';
    out.push({
      id: 'logins', label: 'Plan logins (week used)', value: roomiest == null ? '—' : `${Math.round(roomiest)} %`,
      rows: f.logins.map((l, i) => ({
        main: `Login ${i + 1}`,
        note: !l.on ? 'off' : `week ${l.sevenDay == null ? '?' : `${Math.round(l.sevenDay)} %`} · 5 h ${l.fiveHour == null ? '?' : `${Math.round(l.fiveHour)} %`}`,
        tone: !l.on ? 'grey' as Tone : (l.sevenDay ?? 0) >= 95 ? 'red' as Tone : (l.sevenDay ?? 0) >= 80 ? 'amber' as Tone : 'green' as Tone,
      })),
      tone, status: !live.length ? 'All off' : tone === 'red' ? 'All full' : full ? `${full} full` : tone === 'grey' ? 'No reading' : 'Room left',
      href: '/admin/switches',
    });
  }

  // Disk
  if (!f.disk) out.push(NO_READING('disk', 'Worker disk', '/admin/ops'));
  else {
    const p = f.disk.pct;
    const stale = now - Date.parse(f.disk.at) > 2 * DAY;
    out.push({
      id: 'disk', label: 'Worker disk', value: `${Math.round(p)} %`, sub: `read ${ageLabel(now - Date.parse(f.disk.at))} ago · cleans at 85 %`,
      tone: p >= 90 ? 'red' : p >= 80 || stale ? 'amber' : 'green', status: p >= 90 ? 'Full' : p >= 80 ? 'Filling' : stale ? 'Old reading' : 'Room left',
      href: '/admin/ops',
    });
  }

  // Deploys
  {
    const b = f.deploys.bot;
    const w = f.deploys.website;
    const tone: Tone = !b ? 'grey' : !b.up ? 'red' : b.uptimeSec != null && b.uptimeSec < 600 ? 'amber' : 'green';
    out.push({
      id: 'deploys', label: 'Bot + website', value: !b ? '—' : b.up ? 'Up' : 'Down',
      sub: [b && b.up && b.uptimeSec != null ? `bot up ${ageLabel(b.uptimeSec * 1000)}` : null, w?.sha ? `site ${w.sha.slice(0, 7)}` : null].filter(Boolean).join(' · ') || undefined,
      tone, status: !b ? 'No reading' : !b.up ? 'Bot down' : tone === 'amber' ? 'Just restarted' : 'Running',
      href: '/admin/ops',
    });
  }

  // Backups + leak test
  {
    const { fileBackup, backupCheck, leakTest } = f.backups;
    const age = (j: JobLine | null) => (j ? now - Date.parse(j.at) : Infinity);
    const failed = [fileBackup && !fileBackup.ok ? 'file backup' : null, backupCheck && !backupCheck.ok ? 'backup check' : null, leakTest && !leakTest.ok ? 'leak test' : null].filter(Boolean) as string[];
    const late = [age(fileBackup) > 36 * HOUR ? 'file backup' : null, age(leakTest) > 8.5 * DAY ? 'leak test' : null, age(backupCheck) > 35 * DAY ? 'backup check' : null].filter(Boolean) as string[];
    const none = !fileBackup && !backupCheck && !leakTest;
    out.push({
      id: 'backups', label: 'Backups + leak test', value: none ? '—' : failed.length ? 'Failed' : late.length ? 'Late' : 'OK',
      sub: failed.length ? failed.join(' · ') : late.length ? `${late.join(' · ')} late` : `backup ${ageLabel(age(fileBackup))} ago · leak test ${ageLabel(age(leakTest))} ago`,
      rowsReplaceSub: true,
      rows: none ? undefined : ([['File backup', fileBackup, 'file backup'], ['Leak test', leakTest, 'leak test'], ['Backup check', backupCheck, 'backup check']] as [string, JobLine | null, string][]).map(([name, j, key]) => ({
        main: name,
        note: !j ? 'no reading' : `${j.ok ? 'passed' : 'failed'} ${ageLabel(age(j))} ago`,
        tone: !j ? 'grey' as Tone : !j.ok ? 'red' as Tone : late.includes(key) ? 'amber' as Tone : 'green' as Tone,
      })),
      tone: none ? 'grey' : failed.length ? 'red' : late.length ? 'amber' : 'green',
      status: none ? 'No reading' : failed.length ? 'Failed' : late.length ? 'Late' : 'Passed',
      href: '/admin/ops',
    });
  }
  return out;
}

function weekTiles(f: GlanceFacts, now: number): Tile[] {
  const out: Tile[] = [];
  if (!f.stuck) out.push(NO_READING('stuck', 'Students stuck', '/admin/stuck'));
  else {
    const top = f.stuck.students.slice(0, 3);
    out.push({
      id: 'stuck', label: 'Students stuck', value: String(f.stuck.students.length),
      sub: top.length ? top.map((s) => `${s.area}: ${s.names.slice(0, 2).map(firstName).join(', ')}`).join(' · ') : 'Nobody this week',
      tone: f.stuck.students.length ? 'amber' : 'green', status: f.stuck.students.length ? 'Have a look' : 'Nobody stuck',
      href: '/admin/stuck',
      ...capRows(f.stuck.students.map((s) => ({ main: s.area, note: s.names.map(firstName).join(', ') })), f.stuck.students.length, 8),
      wide: f.stuck.students.length > 0, rowsReplaceSub: true,
    });
    out.push({
      id: 'science-gaps', label: 'Science topics open', value: String(f.stuck.scienceGaps.length),
      sub: f.stuck.scienceGaps.length ? f.stuck.scienceGaps.slice(0, 3).join(' · ') : `from the ${ageLabel(now - Date.parse(f.stuck.at))}-old report`,
      tone: f.stuck.scienceGaps.length ? 'amber' : 'green', status: f.stuck.scienceGaps.length ? 'No sheet yet' : 'None',
      href: '/admin/stuck',
    });
  }
  if (!f.tabs) out.push(NO_READING('tabs', 'Tabs opened this week', '/admin/ops#tabs'));
  else {
    const top = f.tabs.top.slice(0, 5);
    out.push({
      id: 'tabs', label: 'Tabs opened this week', value: String(f.tabs.students),
      sub: top.length ? top.map((t) => `${t.label} ${t.students}`).join(' · ') : 'No student opened the app',
      tone: f.tabs.students ? 'green' : 'amber', status: f.tabs.students ? `${plural(f.tabs.students, 'student')}` : 'Nobody in',
      href: '/admin/ops#tabs',
      rowsReplaceSub: true,
      rows: top.length ? top.map((t) => ({ main: t.label, note: `${plural(t.students, 'student')} · ${plural(t.opens, 'open')}` })) : undefined,
    });
  }
  if (!f.cost) out.push(NO_READING('cost', 'Cost per paper', '/admin/costs'));
  else {
    const c = f.cost;
    out.push({
      id: 'cost', label: 'Cost per paper (7 days)', value: c.perPaper7d == null ? '—' : money(c.perPaper7d),
      sub: `${plural(c.papers7d, 'paper')} · ${c.month} so far ${c.monthToDate == null ? '—' : money(c.monthToDate)}`,
      tone: c.perPaper7d != null && c.perPaper7d > 3 ? 'amber' : 'green', status: c.perPaper7d != null && c.perPaper7d > 3 ? 'High' : 'Normal',
      href: '/admin/costs', trend: c.perDay,
    });
  }
  return out;
}

export function buildGlance(f: GlanceFacts, now: number = Date.now()): Glance {
  const sections: Section[] = [];
  const needs = needsTiles(f);
  if (needs.length) sections.push({ id: 'needs', title: 'Needs you', tiles: needs });
  sections.push({ id: 'today', title: 'Today', tiles: todayTiles(f, now) });
  sections.push({ id: 'machine', title: 'The machine', tiles: machineTiles(f, now) });
  sections.push({ id: 'week', title: 'This week', tiles: weekTiles(f, now) });
  return { sections, lessons: f.lessonsToday, generatedAt: new Date(now).toISOString() };
}

/** Every tile's tone, worst first — the header's one-word summary. */
export function overallTone(g: Glance): Tone {
  const tones = g.sections.flatMap((s) => s.tiles.map((t) => t.tone));
  if (tones.includes('red')) return 'red';
  if (tones.includes('amber')) return 'amber';
  return tones.includes('green') ? 'green' : 'grey';
}
