// The PROGRESS NOTE on the student card (5 Oct 2026). Adrian: "a model reads
// everything on one student … and writes on the profile, in plain words, short:
// How she is doing · Why · Next steps for you", once a week and refreshed before
// a lesson when new work arrived.
//
// The rule from lib/report-facts.ts holds here: THE NUMBERS COME FROM THE DATA.
// This module computes the facts (pure, tested in progress-note.test.ts); the
// model (plan-billed, the Fly worker's /progress-note skill) only writes words
// around them, and checkNoteNumbers refuses a number the facts do not contain.
import { markerTopics, type StuckSubject } from './stuck-topics';

export const NOTE_WINDOW_DAYS = 90;
/** A note is due weekly … */
export const NOTE_EVERY_DAYS = 7;
/** … or before a lesson, when new work came in since the last note and the last note is this old. */
export const NOTE_BEFORE_LESSON_MIN_DAYS = 2;

const DAY = 86_400_000;

// ── inputs (the store loads them) ───────────────────────────────────────────

export interface NotePaper { date: string; name: string; subject: string; awarded: number | null; max: number | null; resultJson: unknown }
export interface NoteMistake { subject: string; topic: string | null; errorKind: string | null; evidence: { date?: string; clean?: boolean; label?: string | null }[] }
export interface NoteAttempt { at: string; verdict: string | null; topics: string[] }
export interface NoteAsk { at: string; topic: string }
export interface NoteTaught { date: string; topics: string[]; how: 'log' | 'auto' }
/** What Adrian said after a lesson (the end-of-lesson voice note, lib/lesson-voice). */
export interface NoteLessonNote { date: string; struggled: string | null; homework: string | null; next: string | null }
export interface NoteSheet { at: string; closed: boolean; section: string }
export interface NoteExam { date: string; label: string; subject: string; daysLeft: number }

// ── the facts ───────────────────────────────────────────────────────────────

export interface TopicMonths { topic: string; subject: StuckSubject; byMonth: Record<string, number>; lost: number; questions: number }

export interface ProgressFacts {
  from: string;                  // YYYY-MM-DD
  to: string;
  months: string[];              // 'YYYY-MM', oldest first
  papers: { date: string; name: string; subject: string; awarded: number; max: number; pct: number }[];
  topics: TopicMonths[];         // marks lost by topic by month, most lost first (top 6)
  causes: { kind: string; words: string; n: number; share: number }[];   // why marks went, most first
  causeTopics: { topic: string; kind: string; n: number }[];
  practice: { attempts: number; correct: number; topics: { topic: string; n: number; correct: number }[] };
  asks: { n: number; topics: { topic: string; n: number }[] };
  taught: NoteTaught[];
  /** Adrian's own words after recent lessons, newest last (at most 4) */
  lessonNotes: NoteLessonNote[];
  sheets: { closed: number; open: number };
  exams: NoteExam[];
  lastDataAt: string | null;
}

/** The error kinds the marker files, in plain words. */
export const KIND_WORDS: Record<string, string> = {
  concept: 'not knowing the method (concept)',
  incomplete: 'stopping short or leaving out steps',
  careless: 'careless slips',
  sign: 'sign errors',
  misread: 'misreading the question',
  transfer: 'copying a number wrongly between lines',
  arithmetic: 'arithmetic',
  rounding: 'rounding / accuracy',
  units: 'units',
  keywords: 'missing the scheme\'s key words',
  other: 'other',
};

const monthOf = (iso: string) => iso.slice(0, 7);
const r1 = (n: number) => Math.round(n * 10) / 10;
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

function subjectKeyOf(subject: string): StuckSubject | null {
  const s = subject.toLowerCase();
  if (s.startsWith('a math')) return 'AM';
  if (s.startsWith('e math') || s === 'math') return 'EM';
  if (s.startsWith('h2') || s.startsWith('h1')) return 'H2';
  return null;
}

/** The last `n` calendar months up to `to`, oldest first. */
export function monthsUpTo(to: string, n = 3): string[] {
  const [y, m] = to.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function buildProgressFacts(input: {
  now: Date;
  papers: NotePaper[];
  mistakes: NoteMistake[];
  attempts: NoteAttempt[];
  asks: NoteAsk[];
  taught: NoteTaught[];
  lessonNotes?: NoteLessonNote[];
  sheets: NoteSheet[];
  exams: NoteExam[];
}): ProgressFacts {
  const to = new Date(input.now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const fromMs = input.now.getTime() - NOTE_WINDOW_DAYS * DAY;
  const from = new Date(fromMs + 8 * 3600_000).toISOString().slice(0, 10);
  const inWin = (iso: string | null | undefined) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const months = monthsUpTo(to, 3);
  let last = 0;
  const seen = (iso: string | null | undefined) => { const t = Date.parse(String(iso ?? '')); if (Number.isFinite(t) && t > last) last = t; };

  // papers + marks lost by topic by month (the marker's own per-question marks)
  const papers: ProgressFacts['papers'] = [];
  const byTopic = new Map<string, TopicMonths>();
  for (const p of input.papers) {
    if (!inWin(p.date)) continue;
    const subj = subjectKeyOf(p.subject);
    if (!subj) continue;
    seen(p.date);
    if (p.max && p.max > 0 && p.awarded !== null) papers.push({ date: p.date, name: p.name, subject: p.subject, awarded: r1(p.awarded), max: r1(p.max), pct: Math.round((100 * p.awarded) / p.max) });
    const results = rec(p.resultJson)?.results;
    for (const raw of Array.isArray(results) ? results : []) {
      const r = rec(raw);
      const topicRaw = String(rec(rec(r?.marking_output)?.meta)?.topic_detected ?? '').trim();
      const marking = rec(r?.marking);
      const max = num(marking?.total_max);
      if (!topicRaw || !marking || !(max > 0)) continue;
      const lost = Math.max(0, max - num(marking.total_awarded));
      const topic = markerTopics(subj, topicRaw)[0];
      if (!topic) continue;
      const k = `${subj}|${topic}`;
      const t = byTopic.get(k) ?? { topic, subject: subj, byMonth: Object.fromEntries(months.map((m) => [m, 0])), lost: 0, questions: 0 };
      const m = monthOf(p.date);
      if (m in t.byMonth) t.byMonth[m] = r1(t.byMonth[m] + lost);
      t.lost = r1(t.lost + lost);
      t.questions += 1;
      byTopic.set(k, t);
    }
  }
  papers.sort((a, b) => a.date.localeCompare(b.date));
  const topics = [...byTopic.values()].filter((t) => t.lost > 0).sort((a, b) => b.lost - a.lost || a.topic.localeCompare(b.topic)).slice(0, 6);

  // causes: every lost question the Notebook filed, by error kind
  const kinds = new Map<string, number>();
  const kindTopic = new Map<string, number>();
  for (const m of input.mistakes) {
    const subj = subjectKeyOf(m.subject);
    if (!subj) continue;
    const kind = m.errorKind || 'other';
    const topic = (m.topic && markerTopics(subj, m.topic)[0]) || null;
    for (const e of m.evidence) {
      if (e.clean !== false || !inWin(e.date)) continue;
      seen(e.date);
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      if (topic) kindTopic.set(`${topic}|${kind}`, (kindTopic.get(`${topic}|${kind}`) ?? 0) + 1);
    }
  }
  const kindTotal = [...kinds.values()].reduce((a, b) => a + b, 0);
  const causes = [...kinds.entries()].sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => ({ kind, words: KIND_WORDS[kind] ?? kind, n, share: kindTotal ? Math.round((100 * n) / kindTotal) : 0 }));
  const causeTopics = [...kindTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => { const [topic, kind] = k.split('|'); return { topic, kind, n }; });

  // practice
  const pt = new Map<string, { n: number; correct: number }>();
  let attempts = 0, correct = 0;
  for (const a of input.attempts) {
    if (!inWin(a.at)) continue;
    seen(a.at);
    attempts++;
    const ok = a.verdict === 'correct';
    if (ok) correct++;
    for (const t of a.topics.slice(0, 1)) { const x = pt.get(t) ?? { n: 0, correct: 0 }; x.n++; if (ok) x.correct++; pt.set(t, x); }
  }

  // asks to the bot (last 30 days of the window carry the weight, but count the window)
  const at = new Map<string, number>();
  let asks = 0;
  for (const a of input.asks) { if (!inWin(a.at)) continue; seen(a.at); asks++; at.set(a.topic, (at.get(a.topic) ?? 0) + 1); }

  const taught = input.taught.filter((t) => inWin(t.date) && t.topics.length).sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
  for (const t of taught) seen(t.date);
  const lessonNotes = (input.lessonNotes ?? []).filter((n) => inWin(n.date) && (n.struggled || n.homework || n.next)).sort((a, b) => a.date.localeCompare(b.date)).slice(-4);
  for (const n of lessonNotes) seen(n.date);
  let closed = 0, open = 0;
  for (const s of input.sheets) { if (!inWin(s.at)) continue; seen(s.at); if (s.closed) closed++; else open++; }

  return {
    from, to, months, papers, topics, causes, causeTopics,
    practice: { attempts, correct, topics: [...pt.entries()].map(([topic, x]) => ({ topic, ...x })).sort((a, b) => b.n - a.n).slice(0, 5) },
    asks: { n: asks, topics: [...at.entries()].map(([topic, n]) => ({ topic, n })).sort((a, b) => b.n - a.n).slice(0, 5) },
    taught,
    lessonNotes,
    sheets: { closed, open },
    exams: input.exams.filter((e) => e.daysLeft >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3),
    lastDataAt: last ? new Date(last).toISOString() : null,
  };
}

const MONTH_WORD = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-SG', { month: 'short', timeZone: 'UTC' });

/** The facts as plain lines — what the model reads and what the card shows folded under the note. */
export function renderProgressFacts(f: ProgressFacts): string {
  const L: string[] = [];
  L.push(`Window: ${f.from} to ${f.to}.`);
  if (f.papers.length) {
    L.push('Papers (oldest first):');
    for (const p of f.papers) L.push(`- ${p.date} ${p.subject} ${p.name}: ${p.awarded}/${p.max} (${p.pct}%)`);
  } else L.push('Papers: none marked in the window.');
  if (f.topics.length) {
    L.push(`Marks lost by topic, by month (${f.months.map(MONTH_WORD).join(' / ')}):`);
    for (const t of f.topics) L.push(`- ${t.topic}: ${f.months.map((m) => t.byMonth[m] ?? 0).join(' / ')} (${t.lost} marks over ${t.questions} questions)`);
  }
  if (f.causes.length) {
    L.push('Why marks were lost (lost questions by cause):');
    for (const c of f.causes) L.push(`- ${c.words}: ${c.n} (${c.share}%)`);
    if (f.causeTopics.length) L.push(`Most common: ${f.causeTopics.map((c) => `${c.topic} — ${KIND_WORDS[c.kind] ?? c.kind} (${c.n})`).join('; ')}.`);
  }
  L.push(f.practice.attempts
    ? `Practice in the app: ${f.practice.attempts} questions, ${f.practice.correct} right${f.practice.topics.length ? ` — ${f.practice.topics.map((t) => `${t.topic} ${t.correct}/${t.n}`).join(', ')}` : ''}.`
    : 'Practice in the app: none.');
  L.push(f.asks.n ? `Asked the bot: ${f.asks.n} questions — ${f.asks.topics.map((t) => `${t.topic} (${t.n})`).join(', ')}.` : 'Asked the bot: none.');
  if (f.taught.length) L.push(`Taught in lessons: ${f.taught.map((t) => `${t.date} ${t.topics.join(', ')}${t.how === 'auto' ? ' (auto log)' : ''}`).join('; ')}.`);
  if (f.lessonNotes?.length) {
    L.push("Adrian's notes after lessons (his own words):");
    for (const n of f.lessonNotes) L.push(`- ${n.date}: ${[n.struggled ? `struggled with ${n.struggled}` : null, n.homework ? `homework ${n.homework}` : null, n.next ? `next time ${n.next}` : null].filter(Boolean).join('; ')}`);
  }
  if (f.sheets.closed + f.sheets.open) L.push(`Practice Again sections: ${f.sheets.closed} fixed on the next paper, ${f.sheets.open} not yet.`);
  if (f.exams.length) L.push(`Coming exams: ${f.exams.map((e) => `${e.subject} ${e.label} ${e.date} (${e.daysLeft} days)`).join('; ')}.`);
  return L.join('\n');
}

// ── the note ────────────────────────────────────────────────────────────────

export interface ProgressNote {
  doing: string[];   // How she is doing
  why: string[];     // Why
  next: string[];    // Next steps for you
  parent: string | null;  // a draft paragraph for the monthly report — never sent by itself
}

/** The model's JSON → a note, or why not. Short by construction (≤ 4 lines a part, ≤ 220 chars a line). */
export function parseProgressNote(v: unknown): ProgressNote | { error: string } {
  const o = rec(typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
  if (!o) return { error: 'not a JSON object' };
  const lines = (x: unknown) => (Array.isArray(x) ? x : []).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 4).map((s) => s.slice(0, 220));
  const note: ProgressNote = {
    doing: lines(o.doing), why: lines(o.why), next: lines(o.next),
    parent: typeof o.parent === 'string' && o.parent.trim() ? o.parent.trim().slice(0, 900) : null,
  };
  if (!note.doing.length || !note.next.length) return { error: 'a note needs "doing" and "next" lines' };
  return note;
}

/** Every number the prose uses must be in the facts (dates and percentages included). Returns the strays. */
export function checkNoteNumbers(note: ProgressNote, factsText: string): string[] {
  const have = new Set((factsText.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  const prose = [...note.doing, ...note.why, ...note.next, note.parent ?? ''].join('\n');
  const strays = new Set<string>();
  for (const n of prose.match(/\d+(?:\.\d+)?/g) ?? []) {
    const v = String(Number(n));
    // small counting words a sentence needs ("2 papers", "the next 3 lessons") are allowed up to 3
    if (!have.has(v) && Number(n) > 3) strays.add(n);
  }
  return [...strays];
}

/** Due: a week since the last note with something new, or a lesson tomorrow and new work since a note ≥ 2 days old. */
export function noteDue(o: { lastNoteAt: string | null; lastDataAt: string | null; lessonSoon: boolean; now: Date }): boolean {
  if (!o.lastDataAt) return false;
  if (!o.lastNoteAt) return true;
  const age = o.now.getTime() - Date.parse(o.lastNoteAt);
  const newer = Date.parse(o.lastDataAt) > Date.parse(o.lastNoteAt);
  if (!newer) return false;
  if (age >= NOTE_EVERY_DAYS * DAY) return true;
  return o.lessonSoon && age >= NOTE_BEFORE_LESSON_MIN_DAYS * DAY;
}
