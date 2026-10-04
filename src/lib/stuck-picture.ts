// The weekly "where are my students stuck" picture (5 Oct 2026, Adrian: "yes to
// all 3" — learn from students' questions). Two signals, one week:
//   ASKED  — a question a linked student asked the bot (Telegram or the app's
//            Ask tab), filed under a canonical topic and, where the bot could,
//            a bank sub-skill (`ask_skills`, else Airtable `Questions.Topic`);
//   LOST   — a question a student lost marks on in a marked paper or a
//            practice grade (`notebook_mistakes.evidence`, one entry per
//            question, the marker's own topic words → stuck-topics.ts).
// A topic that is BOTH asked about and lost on in the same week is a real gap.
// A topic that comes up much more than in the four weeks before is rising.
//
// Pure: no I/O, no clock (the caller passes `now`). Tested in
// stuck-picture.test.ts. The route (/api/cron/stuck-weekly) loads the events,
// calls this, prepares the material and words the message.

import { areaOf, markerTopics, SUBJECT_LABEL, type StuckSubject } from './stuck-topics';

export const WEEK_DAYS = 7;
export const BASELINE_WEEKS = 4;

export interface StuckStudent {
  id: string;                 // Airtable rec id
  name: string;
  level: string | null;       // 'Sec 4', 'JC2', …
  subjects: StuckSubject[];   // what they take with Adrian
  active: boolean;            // Active / Trial
}

export interface AskEvent {
  studentId: string;
  at: string;                 // ISO
  subject: StuckSubject;
  topic: string;              // canonical
  skill?: string | null;      // bank sub-skill name
  subgroupId?: number | null;
}

export interface LossEvent {
  studentId: string;
  at: string;                 // ISO
  subject: StuckSubject;
  text: string;               // the marker's topic words
  /** one lost question = one event; the caller dedupes re-marks by this key */
  key?: string;
}

export interface CountRow { name: string; n: number }

export interface AreaStat {
  subject: StuckSubject;
  area: string;
  asks: number;
  askStudents: string[];
  losses: number;
  lossStudents: string[];
  /** students who asked AND lost marks on it this week */
  bothStudents: string[];
  /** lost questions per student this week */
  lossCounts: Record<string, number>;
  /** the four windows before, as an average per window (asks + losses) */
  baselinePerWeek: number;
  /** canonical topics inside the area, most frequent first (asks + losses) */
  topics: CountRow[];
  /** bank sub-skills from the asks, most frequent first */
  skills: (CountRow & { subgroupId: number | null })[];
  gap: boolean;
  rising: boolean;
  isNew: boolean;
  score: number;
}

export interface GroupPicture {
  key: string;                // 'Sec 4|AM'
  label: string;              // 'Sec 4 A Math'
  level: string | null;
  subject: StuckSubject;
  roster: string[];           // active students in this level + subject
  areas: AreaStat[];          // ranked, gaps first
}

export interface StudentLine {
  studentIds: string[];
  names: string[];
  groupLabel: string;
  subject: StuckSubject;
  area: string;
  asks: number;
  losses: number;
}

export interface StuckPicture {
  from: string;               // window start (ISO)
  to: string;                 // now (ISO)
  windowDays: number;
  groups: GroupPicture[];
  gaps: (AreaStat & { groupKey: string; groupLabel: string })[];
  rising: (AreaStat & { groupKey: string; groupLabel: string })[];
  students: StudentLine[];
  totals: { asks: number; losses: number; lossesUnmapped: number; students: number };
}

const DAY = 86_400_000;

/** 'Sec 4' + AM → 'Sec 4 A Math'; Sec 1–2 E Math reads 'Sec 2 Math'. */
export function groupLabel(level: string | null, subject: StuckSubject): string {
  const lv = level || 'Other';
  if (subject === 'EM' && /^Sec [12]$/.test(lv)) return `${lv} Math`;
  if (subject === 'H2') return `${lv} H2 Math`;
  return `${lv} ${SUBJECT_LABEL[subject]}`;
}

function rank(m: Map<string, number>): CountRow[] {
  return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

interface Acc {
  subject: StuckSubject; area: string;
  asks: number; askBy: Set<string>; losses: number; lossBy: Set<string>; base: number;
  topics: Map<string, number>; skills: Map<string, { n: number; subgroupId: number | null }>;
  askPer: Map<string, number>; lossPer: Map<string, number>;
}

/** A gap needs both signals in the same week and either one student behind both, or several students. */
export function isGap(a: Pick<AreaStat, 'asks' | 'losses' | 'bothStudents' | 'askStudents' | 'lossStudents'>): boolean {
  if (!a.asks || !a.losses) return false;
  if (a.bothStudents.length) return true;
  return a.askStudents.length + a.lossStudents.length >= 3;
}

/** Rising: at least 3 this week and more than twice the weekly average of the four weeks before. */
export function isRising(thisWeek: number, baselinePerWeek: number): boolean {
  return thisWeek >= 3 && thisWeek > 2 * baselinePerWeek;
}

export function buildStuckPicture(input: {
  students: StuckStudent[];
  asks: AskEvent[];
  losses: LossEvent[];
  now: Date;
  /** the window (default a week); the baseline is the four windows before it */
  windowDays?: number;
}): StuckPicture {
  const now = input.now.getTime();
  const windowDays = input.windowDays ?? WEEK_DAYS;
  const weekStart = now - windowDays * DAY;
  const baseStart = weekStart - BASELINE_WEEKS * windowDays * DAY;
  const byId = new Map(input.students.map((s) => [s.id, s]));
  const level = (sid: string) => byId.get(sid)?.level ?? null;

  const acc = new Map<string, Acc>();            // groupKey||area
  const groupMeta = new Map<string, { level: string | null; subject: StuckSubject }>();
  const get = (sid: string, subject: StuckSubject, area: string) => {
    const lv = level(sid);
    const gk = `${lv ?? 'Other'}|${subject}`;
    groupMeta.set(gk, { level: lv, subject });
    const k = `${gk}||${area}`;
    let a = acc.get(k);
    if (!a) {
      a = { subject, area, asks: 0, askBy: new Set(), losses: 0, lossBy: new Set(), base: 0, topics: new Map(), skills: new Map(), askPer: new Map(), lossPer: new Map() };
      acc.set(k, a);
    }
    return a;
  };

  let asksThisWeek = 0, lossesThisWeek = 0, unmapped = 0;
  const who = new Set<string>();

  for (const e of input.asks) {
    const t = Date.parse(e.at);
    if (!(t >= baseStart && t < now) || !byId.has(e.studentId)) continue;
    const area = areaOf(e.subject, e.topic);
    const a = get(e.studentId, e.subject, area);
    if (t < weekStart) { a.base += 1; continue; }
    asksThisWeek += 1; who.add(e.studentId);
    a.asks += 1; a.askBy.add(e.studentId);
    a.askPer.set(e.studentId, (a.askPer.get(e.studentId) ?? 0) + 1);
    a.topics.set(e.topic, (a.topics.get(e.topic) ?? 0) + 1);
    if (e.skill) {
      const s = a.skills.get(e.skill) ?? { n: 0, subgroupId: e.subgroupId ?? null };
      s.n += 1; a.skills.set(e.skill, s);
    }
  }

  const seenLoss = new Set<string>();
  for (const e of input.losses) {
    const t = Date.parse(e.at);
    if (!(t >= baseStart && t < now) || !byId.has(e.studentId)) continue;
    if (e.key) { if (seenLoss.has(e.key)) continue; seenLoss.add(e.key); }
    const topics = markerTopics(e.subject, e.text);
    if (!topics.length) { if (t >= weekStart) unmapped += 1; continue; }
    for (const topic of topics) {
      const a = get(e.studentId, e.subject, areaOf(e.subject, topic));
      if (t < weekStart) { a.base += 1; continue; }
      a.losses += 1; a.lossBy.add(e.studentId);
      a.lossPer.set(e.studentId, (a.lossPer.get(e.studentId) ?? 0) + 1);
      a.topics.set(topic, (a.topics.get(topic) ?? 0) + 1);
    }
    if (t >= weekStart) { lossesThisWeek += 1; who.add(e.studentId); }
  }

  const groups = new Map<string, GroupPicture>();
  const studentLines: StudentLine[] = [];
  for (const [k, a] of acc) {
    const gk = k.split('||')[0];
    const meta = groupMeta.get(gk)!;
    if (!a.asks && !a.losses) continue;   // only the baseline — nothing this week
    const both = [...a.askBy].filter((s) => a.lossBy.has(s));
    const thisWeek = a.asks + a.losses;
    const baselinePerWeek = a.base / BASELINE_WEEKS;
    const stat: AreaStat = {
      subject: a.subject, area: a.area,
      asks: a.asks, askStudents: [...a.askBy].sort(),
      losses: a.losses, lossStudents: [...a.lossBy].sort(),
      bothStudents: both.sort(),
      lossCounts: Object.fromEntries(a.lossPer),
      baselinePerWeek,
      topics: rank(a.topics),
      skills: [...a.skills.entries()].map(([name, v]) => ({ name, n: v.n, subgroupId: v.subgroupId })).sort((x, y) => y.n - x.n || x.name.localeCompare(y.name)),
      gap: false, rising: false, isNew: a.base === 0, score: 0,
    };
    stat.gap = isGap(stat);
    stat.rising = isRising(thisWeek, baselinePerWeek);
    const people = new Set([...a.askBy, ...a.lossBy]).size;
    stat.score = people * 2 + both.length * 3 + a.asks + a.losses / 2;
    let g = groups.get(gk);
    if (!g) {
      const roster = input.students.filter((s) => s.active && (s.level ?? 'Other') === (meta.level ?? 'Other') && s.subjects.includes(meta.subject)).map((s) => s.id);
      g = { key: gk, label: groupLabel(meta.level, meta.subject), level: meta.level, subject: meta.subject, roster, areas: [] };
      groups.set(gk, g);
    }
    g.areas.push(stat);

    // stuck students: asked twice or more, or asked AND lost marks
    const stuck = [...a.askBy].filter((s) => (a.askPer.get(s) ?? 0) >= 2 || a.lossBy.has(s)).sort();
    if (stuck.length) {
      studentLines.push({
        studentIds: stuck,
        names: stuck.map((s) => byId.get(s)?.name ?? s),
        groupLabel: g.label, subject: a.subject, area: a.area,
        asks: stuck.reduce((n, s) => n + (a.askPer.get(s) ?? 0), 0),
        losses: stuck.reduce((n, s) => n + (a.lossPer.get(s) ?? 0), 0),
      });
    }
  }

  const byRank = (x: AreaStat, y: AreaStat) => (Number(y.gap) - Number(x.gap)) || (y.score - x.score) || x.area.localeCompare(y.area);
  const groupList = [...groups.values()];
  for (const g of groupList) g.areas.sort(byRank);
  const groupScore = (g: GroupPicture) => g.areas.reduce((n, a) => n + a.score, 0);
  groupList.sort((x, y) => groupScore(y) - groupScore(x) || x.label.localeCompare(y.label));

  const flat = groupList.flatMap((g) => g.areas.map((a) => ({ ...a, groupKey: g.key, groupLabel: g.label })));
  const gaps = flat.filter((a) => a.gap).sort((x, y) => y.score - x.score);
  const rising = flat.filter((a) => a.rising && !a.gap).sort((x, y) => (y.asks + y.losses) - (x.asks + x.losses));
  studentLines.sort((x, y) => (y.asks + y.losses) - (x.asks + x.losses) || x.groupLabel.localeCompare(y.groupLabel));

  return {
    from: new Date(weekStart).toISOString(),
    to: new Date(now).toISOString(),
    windowDays,
    groups: groupList,
    gaps, rising,
    students: studentLines,
    totals: { asks: asksThisWeek, losses: lossesThisWeek, lossesUnmapped: unmapped, students: who.size },
  };
}

// ── what to prepare ─────────────────────────────────────────────────────────

export const MAX_MATERIALS = 3;
export const SHEET_COUNT = 10;

export interface MaterialPlan {
  slug: string;               // what Adrian types: "send trigonometry-sec4-am"
  groupKey: string;
  groupLabel: string;
  level: string | null;
  subject: StuckSubject;
  area: string;
  /** canonical topics for the sheet (one or two — a chapter sheet when two) */
  topics: string[];
  /** students who asked about it or lost marks on it this week */
  stuckStudents: string[];
  /** every active student in the level + subject */
  groupStudents: string[];
  /** bank sub-skills the asks named — the twins lane does these first */
  subgroupIds: number[];
}

export function materialSlug(area: string, level: string | null, subject: StuckSubject): string {
  const a = area.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').filter((w) => !['and', 'of', 'the'].includes(w)).slice(0, 3).join('-');
  const lv = String(level ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return [a, lv, subject.toLowerCase()].filter(Boolean).join('-');
}

/**
 * Who is stuck on an area: everyone who asked the bot about it, and everyone who
 * lost marks on two or more of its questions. One lost question in a whole paper
 * is an ordinary paper, not being stuck.
 */
export function stuckOn(a: Pick<AreaStat, 'askStudents' | 'lossCounts'>): string[] {
  const lost = Object.entries(a.lossCounts).filter(([, n]) => n >= 2).map(([s]) => s);
  return [...new Set([...a.askStudents, ...lost])].sort();
}

/** The top gaps (up to MAX_MATERIALS, one per area per group) → what to prepare. */
export function planMaterials(p: StuckPicture, max = MAX_MATERIALS): MaterialPlan[] {
  const out: MaterialPlan[] = [];
  const groups = new Map(p.groups.map((g) => [g.key, g]));
  for (const gap of p.gaps) {
    if (out.length >= max) break;
    const g = groups.get(gap.groupKey);
    if (!g) continue;
    const topics = gap.topics.slice(0, 2).filter((t, i) => i === 0 || t.n >= Math.max(2, gap.topics[0].n / 2)).map((t) => t.name);
    out.push({
      slug: materialSlug(gap.area, g.level, g.subject),
      groupKey: g.key, groupLabel: g.label, level: g.level, subject: g.subject,
      area: gap.area, topics,
      stuckStudents: stuckOn(gap),
      groupStudents: g.roster,
      subgroupIds: gap.skills.map((s) => s.subgroupId).filter((x): x is number => typeof x === 'number'),
    });
  }
  return out;
}

// ── the twins lanes' focus ──────────────────────────────────────────────────

export interface TwinFocus { subgroupId: number; subject: StuckSubject; area: string }

/** Sub-skills per subject topped up from the week's picture when no sheet named one. */
export const FOCUS_PER_SUBJECT = 4;

/**
 * The sub-skills the twins lanes write first (`stuck_reports.twin_focus`, read by
 * scripts/twins/twin.mjs). The sheets' own sub-skills first; then BOTH A Math and
 * E Math get some (Adrian, 5 Oct 2026: "both A Math and E Math needs to be
 * written") — a subject the sheets did not name takes the sub-skills of its
 * highest-ranked area that has any (gaps first, then the rest by score).
 */
export function twinFocusFor(p: StuckPicture, materials: Pick<MaterialPlan, 'subgroupIds' | 'subject' | 'area'>[]): TwinFocus[] {
  const out: TwinFocus[] = [];
  const seen = new Set<number>();
  const add = (id: number, subject: StuckSubject, area: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ subgroupId: id, subject, area });
  };
  for (const m of materials) for (const id of m.subgroupIds) add(id, m.subject, m.area);
  for (const subject of ['AM', 'EM'] as StuckSubject[]) {
    if (out.some((f) => f.subject === subject)) continue;
    const areas = p.groups.filter((g) => g.subject === subject).flatMap((g) => g.areas)
      .filter((a) => a.skills.some((s) => typeof s.subgroupId === 'number'))
      .sort((x, y) => (Number(y.gap) - Number(x.gap)) || (y.score - x.score) || x.area.localeCompare(y.area));
    const top = areas[0];
    if (!top) continue;
    for (const s of top.skills.slice(0, FOCUS_PER_SUBJECT)) if (typeof s.subgroupId === 'number') add(s.subgroupId, subject, top.area);
  }
  return out;
}

// ── the message ─────────────────────────────────────────────────────────────

export interface PreparedMaterial extends MaterialPlan {
  ok: boolean;
  title?: string;
  count?: number;
  pdfUrl?: string;
  questionIds?: string[];
  error?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lc = (area: string) => area.toLowerCase();
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/** One line about one area: who asked, who lost marks, which sub-skill. Plain words. */
export function areaLine(a: AreaStat, span = 'this week'): string {
  const parts: string[] = [];
  const skill = a.skills[0] && a.skills[0].n >= 2 ? ` (mostly "${a.skills[0].name}")` : '';
  const asked = a.askStudents.length, lost = a.lossStudents.length, both = a.bothStudents.length;
  if (asked) parts.push(`${plural(asked, 'student')} asked about ${lc(a.area)}${skill}`);
  if (lost) {
    if (!asked) parts.push(`${plural(lost, 'student')} lost marks on ${lc(a.area)} in papers`);
    else if (both && both === asked && asked === 1) parts.push(`${lost > 1 ? `that student and ${plural(lost - 1, 'other')}` : 'the same student'} lost marks on it in papers too`);
    else if (both) parts.push(`${both === asked ? `all ${both}` : `${both} of them`} also lost marks on it in papers${lost > both ? ` (${lost} students in all)` : ''}`);
    else parts.push(`${plural(lost, 'student')} lost marks on it in papers too`);
  }
  let line = parts.join('; ') + '.';
  if (a.rising && a.isNew) line += ` New ${span}.`;
  else if (a.rising) line += ' More than usual.';
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export const STUCK_PAGE = 'https://www.adrianmathtuition.com/admin/stuck';

/**
 * The ONE Telegram message for Adrian (HTML-safe plain text): the week's
 * background first, then what is ready and how to send it. Empty week → a
 * short quiet line, so silence still means the job is dead.
 */
export function stuckMessage(p: StuckPicture, ready: PreparedMaterial[], opts: { maxGroups?: number; maxAreas?: number; maxStudents?: number } = {}): string {
  const maxGroups = opts.maxGroups ?? 4, maxAreas = opts.maxAreas ?? 2, maxStudents = opts.maxStudents ?? 3;
  const span = p.windowDays === WEEK_DAYS ? 'This week' : `These ${p.windowDays} days`;
  const head = `${span} (${dayLabel(p.from)} to ${dayLabel(p.to)}): what students asked the bot, and where they lost marks.`;
  if (!p.totals.asks && !p.totals.losses) return `${head}\n\nQuiet week: no questions to the bot and no marked papers from linked students.`;
  const lines: string[] = [head];

  const shown = p.groups.filter((g) => g.areas.some((a) => a.gap || a.askStudents.length + a.lossStudents.length >= 2)).slice(0, maxGroups);
  for (const g of shown) {
    const areas = g.areas.filter((a) => a.gap || a.askStudents.length + a.lossStudents.length >= 2).slice(0, maxAreas);
    if (!areas.length) continue;
    lines.push('', `${g.label}:`);
    for (const a of areas) lines.push(areaLine(a, p.windowDays === WEEK_DAYS ? 'this week' : 'in these days'));
  }

  const studentLines = p.students.filter((s) => s.asks >= 2).slice(0, maxStudents);
  if (studentLines.length) {
    lines.push('', 'Stuck, by name:');
    for (const s of studentLines) {
      const n = s.studentIds.length;
      const asked = `asked ${plural(s.asks, 'time')}${n > 1 ? ' between them' : ''}`;
      const lost = s.losses ? `, lost marks on ${plural(s.losses, 'question')}` : '';
      lines.push(`${joinNames(s.names)} (${s.groupLabel}): ${lc(s.area)}, ${asked}${lost}.`);
    }
  }

  const rising = p.rising.filter((r) => !shown.some((g) => g.key === r.groupKey && g.areas.slice(0, maxAreas).some((a) => a.area === r.area))).slice(0, 2);
  if (rising.length) {
    lines.push('', 'Coming up more than before:');
    const when = p.windowDays === WEEK_DAYS ? 'this week' : `in ${p.windowDays} days`;
    for (const r of rising) lines.push(`${r.groupLabel}: ${lc(r.area)} (${r.asks + r.losses} ${when}${r.isNew ? ', none before' : ''}).`);
  }

  const ok = ready.filter((m) => m.ok);
  if (ok.length) {
    lines.push('', 'Ready for you (nothing sent yet):');
    for (const m of ok) {
      lines.push(`${m.title ?? m.area} — ${plural(m.count ?? 0, 'question')} from the bank, for ${m.groupLabel}.`);
      lines.push(`Say "send ${m.slug}" for the ${plural(m.stuckStudents.length, 'student')} stuck on it, or "send ${m.slug} to all" for all ${m.groupStudents.length} in ${m.groupLabel}.`);
    }
  }
  const failed = ready.filter((m) => !m.ok);
  if (failed.length) lines.push('', `Could not prepare: ${failed.map((m) => `${m.area} (${m.error ?? 'no questions'})`).join('; ')}.`);
  lines.push('', `The full picture: ${STUCK_PAGE}`);
  return lines.join('\n');
}
