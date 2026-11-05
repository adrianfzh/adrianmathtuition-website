// Which app tabs students open (6 Oct 2026, Adrian: "yes — record which app
// tabs students open"). Pure, client-safe: the beacon (components/TabBeacon.tsx)
// turns a path under /app into ONE short fixed name and posts
// {kind:'tab:view', detail:<name>} to /api/portal/event; the route accepts only
// a name on this list; lib/portal-activity.ts counts them. The stored detail is
// always one of these names — never a raw URL, never an id.

export const TAB_VIEW_KIND = 'tab:view';

/** The fixed names, each with the plain word Adrian reads on the dashboard. */
export const TAB_LABELS = {
  home: 'Home',
  practice: 'Practise',
  'practice-question': 'Practise · a question',
  'practice-timed': 'Timed set',
  'jc-methods': 'H2 methods',
  'jc-stats': 'H2 stats',
  'jc-sketch': 'H2 sketching',
  find: 'Find a question',
  ask: 'Ask',
  papers: 'Papers',
  paper: 'A marked paper',
  explain: 'Explain it',
  submit: 'Hand in',
  notebook: 'My Notebook',
  're-attempt': 'Notebook (re-attempt)',
  assignments: 'From your tutor',
  work: 'A worksheet',
  print: 'Print a paper',
  settings: 'Settings',
  learn: 'Learn',
  lesson: 'Lesson',
  notes: 'Notes',
  reference: 'Reference',
  reschedule: 'Reschedule',
  suggestions: 'Suggestions',
  fixit: 'Fix it',
  'science-home': 'Science home',
  'science-practice': 'Science practise',
  'science-practice-run': 'Science practise · a topic',
  'science-submit': 'Science hand in',
  'science-papers': 'Science papers',
  'science-paper': 'A science paper',
  'science-notebook': 'Science notebook',
  'science-study': 'Science study pages',
  humanities: 'Humanities',
  languages: 'Languages',
  other: 'Other',
} as const;

export type TabName = keyof typeof TAB_LABELS;

export const TAB_NAMES = Object.keys(TAB_LABELS) as TabName[];

export function isTabName(x: unknown): x is TabName {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(TAB_LABELS, x);
}

export function tabLabel(name: string): string {
  return isTabName(name) ? TAB_LABELS[name] : name;
}

/** First match wins — longer paths before their parents. `null` = not under /app. */
const RULES: [RegExp, TabName][] = [
  [/^\/app\/?$/, 'home'],
  [/^\/app\/practice\/timed(\/|$)/, 'practice-timed'],
  [/^\/app\/practice\/methods(\/|$)/, 'jc-methods'],
  [/^\/app\/practice\/stats(\/|$)/, 'jc-stats'],
  [/^\/app\/practice\/sketch(\/|$)/, 'jc-sketch'],
  [/^\/app\/practice(\/|$)/, 'practice'],
  [/^\/app\/find(\/|$)/, 'find'],
  [/^\/app\/ask(\/|$)/, 'ask'],
  [/^\/app\/marking\/[^/]+\/explain(\/|$)/, 'explain'],
  [/^\/app\/marking\/[^/]+/, 'paper'],
  [/^\/app\/marking(\/|$)/, 'papers'],
  [/^\/app\/submit(\/|$)/, 'submit'],
  [/^\/app\/(my-notes|plan)(\/|$)/, 'notebook'],
  [/^\/app\/notebook(\/|$)/, 're-attempt'],
  [/^\/app\/assignments(\/|$)/, 'assignments'],
  [/^\/app\/work(\/|$)/, 'work'],
  [/^\/app\/print(\/|$)/, 'print'],
  [/^\/app\/settings(\/|$)/, 'settings'],
  [/^\/app\/learn(\/|$)/, 'learn'],
  [/^\/app\/lesson(\/|$)/, 'lesson'],
  [/^\/app\/notes(-preview)?(\/|$)/, 'notes'],
  [/^\/app\/reference(\/|$)/, 'reference'],
  [/^\/app\/reschedule(\/|$)/, 'reschedule'],
  [/^\/app\/suggestions(\/|$)/, 'suggestions'],
  [/^\/app\/fixit(\/|$)/, 'fixit'],
  [/^\/app\/science\/?$/, 'science-home'],
  [/^\/app\/science\/practice\/run(\/|$)/, 'science-practice-run'],
  [/^\/app\/science\/practice(\/|$)/, 'science-practice'],
  [/^\/app\/science\/submit(\/|$)/, 'science-submit'],
  [/^\/app\/science\/papers(\/|$)/, 'science-papers'],
  [/^\/app\/science\/marking\/[^/]+\/explain(\/|$)/, 'explain'],
  [/^\/app\/science\/marking(\/|$)/, 'science-paper'],
  [/^\/app\/science\/my-notes(\/|$)/, 'science-notebook'],
  [/^\/app\/science\/(qa|definitions|processes|command-words)(\/|$)/, 'science-study'],
  [/^\/app\/humanities(\/|$)/, 'humanities'],
  [/^\/app\/languages(\/|$)/, 'languages'],
];

/** The tab a pathname belongs to; `null` outside /app (nothing is sent). Query strings are ignored. */
export function tabForPath(pathname: string | null | undefined): TabName | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0];
  if (!/^\/app(\/|$)/.test(path)) return null;
  for (const [re, name] of RULES) if (re.test(path)) return name;
  return 'other';
}

/** At most one event per tab per device per this window. */
export const TAB_VIEW_GAP_MS = 30 * 60_000;

/** Send now? `lastAt` = the device's last send for this tab (ms), or null. A clock that went backwards sends. */
export function shouldSendTabView(lastAt: number | null, now: number): boolean {
  if (lastAt == null || !Number.isFinite(lastAt)) return true;
  const gap = now - lastAt;
  return gap < 0 || gap >= TAB_VIEW_GAP_MS;
}
