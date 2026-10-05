// 🖼 Figures we need (5 Oct 2026, Adrian: whenever a twin seed is parked because no figure-library
// family fits, record the figure it needed; group them; tell him weekly; a shape needed by 3
// seeds is ready to build). Table `figure_needs` (maths project, migrations/figure_needs.sql) —
// written by the maths twins lane, the science twins lane (scripts/figure-needs/record.mjs) and
// the cloud-twins door (/api/agent/twins/figure-need). Read by /admin/generated (🖼 Figures we
// need) and the Sunday message (/api/cron/figure-needs-weekly). Pure; tested.
// It replaces the "3-candidate gate" counts that lived only as prose in CLAUDE.md.

/** A shape needed by this many distinct seeds is ready to build (the old 3-candidate gate). */
export const READY_AT = 3;

const STOP = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'for', 'in', 'on', 'to', 'diagram', 'figure', 'drawing', 'showing', 'shows']);

/**
 * The grouping key. The author writes a short kebab-case shape ('venn-probability'); this folds
 * spelling: lower case, words only, stop words dropped, a plural 's' dropped, at most four words.
 * With no shape, the first words of `what` stand in. Same rule as scripts/figure-needs/record.mjs.
 */
export function normShape(shape: string | null | undefined, what?: string | null): string {
  const src = String(shape ?? '').trim() || String(what ?? '');
  const words = src.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return words.slice(0, 4).join('-') || 'unknown';
}

export type FigureNeedRow = {
  id: number; created_at: string; bank: 'maths' | 'science'; seed_id: string | null;
  subject: string | null; level: string | null; topic: string | null;
  what: string; shape: string; source: string; status: 'open' | 'built' | 'dropped';
  built_family?: string | null; note?: string | null;
};

export type FigureNeedGroup = {
  shape: string;
  /** distinct seeds (a legacy row with no seed counts once) */
  count: number;
  ready: boolean;
  banks: string[]; subjects: string[]; topics: string[];
  /** up to three plain descriptions, newest first */
  examples: string[];
  newThisWeek: number;
  lastAt: string;
};

/** Open needs grouped by shape, biggest first; `now` decides what is new this week. */
export function groupNeeds(rows: readonly FigureNeedRow[], now: Date = new Date()): FigureNeedGroup[] {
  const weekAgo = new Date(now.getTime() - 7 * 86400e3).toISOString();
  const by = new Map<string, FigureNeedRow[]>();
  for (const r of rows) {
    if (r.status !== 'open') continue;
    const k = normShape(r.shape, r.what);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  }
  const out: FigureNeedGroup[] = [];
  for (const [shape, list] of by) {
    const seeds = new Set(list.map((r) => r.seed_id ?? `row-${r.id}`));
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    out.push({
      shape, count: seeds.size, ready: seeds.size >= READY_AT,
      banks: uniq(list.map((r) => r.bank)), subjects: uniq(list.map((r) => r.subject)), topics: uniq(list.map((r) => r.topic)),
      examples: uniq(sorted.map((r) => r.what)).slice(0, 3),
      newThisWeek: list.filter((r) => r.created_at >= weekAgo).length,
      lastAt: sorted[0]?.created_at ?? '',
    });
  }
  return out.sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

/** The Sunday message, plain words. null = nothing open (no message). */
export function weeklyMessage(groups: readonly FigureNeedGroup[], top = 8): string | null {
  if (!groups.length) return null;
  const ready = groups.filter((g) => g.ready);
  const lines = groups.slice(0, top).map((g) => {
    const where = [...g.subjects, ...g.topics.slice(0, 2)].filter(Boolean).join(', ');
    return `${g.ready ? '✅' : '•'} ${g.shape.replace(/-/g, ' ')} — ${g.count} question${g.count === 1 ? '' : 's'}${where ? ` (${where})` : ''}${g.newThisWeek ? `, ${g.newThisWeek} new this week` : ''}`;
  });
  const head = '🖼 Figures we need';
  const intro = 'Twins we could not write because no figure family draws the picture:';
  const ask = ready.length
    ? `${ready.length === 1 ? 'One shape is' : `${ready.length} shapes are`} needed by ${READY_AT} or more questions (✅) — build ${ready.length === 1 ? 'it' : 'them'}?`
    : `None has reached ${READY_AT} questions yet.`;
  const more = groups.length > top ? `\n…and ${groups.length - top} more on /admin/generated.` : '';
  return `${head}\n\n${intro}\n${lines.join('\n')}${more}\n\n${ask}`;
}
