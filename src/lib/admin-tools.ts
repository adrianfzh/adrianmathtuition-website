// Every admin page the dashboard can open, in one list (6 Oct 2026). The dashboard's
// tools row and its "All tools" menu read it, and so does the visit counter in the admin
// layout — which is how the row learns which pages Adrian actually opens ("easy access to
// commonly use tools" → "learn from my taps"). Pure: no storage here, only the arithmetic.

export type AdminTool = { label: string; href: string; emoji: string };

export const ADMIN_TOOLS: { group: string; links: AdminTool[] }[] = [
  { group: 'Teaching', links: [
    { label: 'Schedule', href: '/admin/schedule', emoji: '📅' }, { label: 'Log lessons', href: '/admin/log', emoji: '✏️' },
    { label: 'Students', href: '/admin/students', emoji: '👤' }, { label: 'Exams', href: '/admin/exams', emoji: '📊' },
    { label: 'Follow-ups', href: '/admin/followups', emoji: '📌' }, { label: 'Parent digests', href: '/admin/digests', emoji: '📬' },
    { label: 'Waitlist', href: '/admin/waitlist', emoji: '⏳' }, { label: 'Suggestions', href: '/admin/suggestions', emoji: '💡' },
  ] },
  { group: 'Marking', links: [
    { label: 'Mark a paper', href: '/admin/mark-paper', emoji: '✍️' }, { label: 'Marked papers', href: '/admin/papers', emoji: '🗂' },
    { label: 'Mark schemes', href: '/admin/schemes', emoji: '📘' }, { label: 'Calibration', href: '/admin/calibration', emoji: '⚖️' },
    { label: 'Stuck', href: '/admin/stuck', emoji: '🧭' }, { label: 'Generated', href: '/admin/generated', emoji: '📷' },
    { label: 'Essays', href: '/admin/essays', emoji: '📝' },
  ] },
  { group: 'The machine', links: [
    { label: 'Ops logbook', href: '/admin/ops', emoji: '🩺' }, { label: 'Switches', href: '/admin/switches', emoji: '🎚' },
    { label: 'Costs', href: '/admin/costs', emoji: '💵' }, { label: 'Extraction rules', href: '/admin/extraction-rules', emoji: '📜' },
    { label: 'Bot', href: '/admin/bot', emoji: '🤖' },
  ] },
  { group: 'Bank + materials', links: [
    { label: 'Question bank', href: '/admin/questions', emoji: '📚' }, { label: 'Question proposals', href: '/admin/question-proposals', emoji: '📥' },
    { label: 'Bank health', href: '/admin/bank-health', emoji: '🩻' }, { label: 'Bank figures', href: '/admin/figures-bank', emoji: '🖼' },
    { label: 'Figure review', href: '/admin/figures', emoji: '🖼️' }, { label: 'Trap review', href: '/admin/pitfalls', emoji: '🎯' },
    { label: 'Topic cards', href: '/admin/topic-cards', emoji: '🗒️' }, { label: 'Notes', href: '/admin/notes', emoji: '🖨️' },
    { label: 'Prelim builder', href: '/admin/prelim-builder', emoji: '📄' }, { label: 'Print a paper', href: '/app/print', emoji: '🧾' },
    { label: 'Worksheet builder', href: '/admin/worksheet-builder', emoji: '🧱' }, { label: 'Teaching decks', href: '/admin/lessons', emoji: '🎓' },
    { label: 'Curriculum', href: '/admin/curriculum', emoji: '🗺' }, { label: 'Paper library', href: '/admin/library', emoji: '🏛' },
  ] },
  { group: 'Money', links: [
    { label: 'Invoices', href: '/admin/invoices', emoji: '💰' }, { label: 'Email log', href: '/admin/emails', emoji: '📨' },
  ] },
  { group: 'Other', links: [
    { label: 'My to-dos', href: '/admin/my-todos', emoji: '☑️' }, { label: 'Math tools', href: '/tools', emoji: '📐' },
    { label: 'TI-84', href: '/calculator?real=1', emoji: '🧮' }, { label: 'Casio fx-97SG X', href: '/calculator/casio', emoji: '🔢' },
    { label: 'Revision decks', href: '/revise/am', emoji: '⚡' }, { label: 'Kiosk (student view)', href: '/kiosk', emoji: '🖥' },
    { label: 'Marketing calendar', href: '/admin/calendar-marketing-post', emoji: '📣' }, { label: 'Old hub (tiles)', href: '/admin/classic', emoji: '🧩' },
  ] },
];

export const ALL_ADMIN_TOOLS: AdminTool[] = ADMIN_TOOLS.flatMap((g) => g.links);

/** What the row shows before it has learnt anything, in this order. */
export const DEFAULT_TOOLS = ['/admin/schedule', '/admin/log', '/admin/students', '/admin/mark-paper', '/admin/invoices', '/admin/questions', '/admin/notes'];

export const TAPS_KEY = 'admin_dash_taps_v1';
/** Past this many counted opens every count is halved, so last month's habit fades. */
export const TAPS_DECAY_AT = 300;

export type TapCounts = Record<string, number>;

const pathOf = (href: string) => href.split(/[?#]/)[0];

/** The tool a visited page belongs to: `/admin/students/rec1/next` → `/admin/students`. The dashboard itself and the old hub are not tools. */
export function toolForPath(pathname: string): string | null {
  const p = pathOf(pathname).replace(/\/+$/, '');
  if (!p || p === '/admin' || p === '/admin/classic') return null;
  let best: string | null = null;
  for (const t of ALL_ADMIN_TOOLS) {
    const tp = pathOf(t.href);
    if (tp === '/admin/classic') continue;
    if ((p === tp || p.startsWith(`${tp}/`)) && (!best || tp.length > pathOf(best).length)) best = t.href;
  }
  return best;
}

/** One more open of `href`. Unknown hrefs are ignored; a full tally is halved first. */
export function bumpTap(counts: TapCounts, href: string): TapCounts {
  if (!ALL_ADMIN_TOOLS.some((t) => t.href === href)) return counts;
  let next: TapCounts = { ...counts };
  const total = Object.values(next).reduce((a, b) => a + b, 0);
  if (total >= TAPS_DECAY_AT) next = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, Math.floor(v / 2)]).filter(([, v]) => (v as number) > 0)) as TapCounts;
  next[href] = (next[href] ?? 0) + 1;
  return next;
}

/** The `n` tools for the row: most opened first; ties and the not-yet-opened fall back to the default order. */
export function topTools(counts: TapCounts, n = 7): AdminTool[] {
  const rank = (href: string) => { const i = DEFAULT_TOOLS.indexOf(href); return i < 0 ? DEFAULT_TOOLS.length + ALL_ADMIN_TOOLS.findIndex((t) => t.href === href) : i; };
  return [...ALL_ADMIN_TOOLS]
    .filter((t) => t.href !== '/admin/classic')
    .sort((a, b) => (counts[b.href] ?? 0) - (counts[a.href] ?? 0) || rank(a.href) - rank(b.href))
    .slice(0, n);
}

export function parseTaps(raw: string | null): TapCounts {
  try {
    const v = JSON.parse(raw || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([k, c]) => typeof c === 'number' && c > 0 && ALL_ADMIN_TOOLS.some((t) => t.href === k))) as TapCounts;
  } catch { return {}; }
}
