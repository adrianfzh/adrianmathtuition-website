// lib/remark-diff.ts — what a re-mark changed, part by part (8 Sep 2026).
// Adrian: "i remarked denise page 12 but i can't see what changed". The bot
// keeps the marking that stepped aside on the row (`previous_results`,
// `previous_totals`, `previous_marked_at`, `queue.remark_pages`); this turns
// that into the desk's "what the re-mark changed" panel. Pure; tested. Twin of
// the bot's lib/page-remark.js partDiff.

type Part = { label?: unknown; awarded?: unknown; max?: unknown; error_summary?: unknown };
type ResultLike = { photo_index?: unknown; question_number?: unknown; marking_output?: { parts?: Part[] } | null };

export type RemarkPartDiff = {
  q: string; part: string;
  before: { awarded: number; max: number } | null;
  after: { awarded: number; max: number; why: string } | null;
};
export type RemarkDiff = {
  pages: number[] | null;          // photo indices re-marked; null = the whole paper
  hadPrevious: boolean;
  parts: RemarkPartDiff[];         // every part on the re-marked pages, before → after
  changed: RemarkPartDiff[];       // the ones whose awarded marks moved
};

const partLabel = (p: Part) => { const l = String(p?.label ?? '').trim(); return /^\(?whole\)?$/i.test(l) ? '' : l; };

export function remarkDiff(previousResults: unknown, results: unknown, pages: unknown): RemarkDiff {
  const want = Array.isArray(pages) && pages.length ? new Set(pages.map(Number)) : null;
  const collect = (src: unknown) => {
    const map = new Map<string, { q: string; part: string; awarded: number; max: number; why: string }>();
    for (const r of Array.isArray(src) ? (src as ResultLike[]) : []) {
      if (!r) continue;
      if (want && !want.has(Number(r.photo_index))) continue;
      for (const p of r.marking_output?.parts ?? []) {
        const key = `${String(r.question_number)}|${partLabel(p)}`;
        if (!map.has(key)) map.set(key, { q: String(r.question_number), part: partLabel(p), awarded: Number(p.awarded) || 0, max: Number(p.max) || 0, why: String(p.error_summary ?? '').trim() });
      }
    }
    return map;
  };
  const prev = collect(previousResults), curr = collect(results);
  const hadPrevious = Array.isArray(previousResults) && previousResults.length > 0;
  const parts: RemarkPartDiff[] = [];
  for (const [k, c] of curr) {
    const o = prev.get(k);
    parts.push({ q: c.q, part: c.part, before: o ? { awarded: o.awarded, max: o.max } : null, after: { awarded: c.awarded, max: c.max, why: c.why } });
  }
  for (const [k, o] of prev) if (!curr.has(k)) parts.push({ q: o.q, part: o.part, before: { awarded: o.awarded, max: o.max }, after: null });
  const changed = hadPrevious ? parts.filter(d => !d.before || !d.after || d.before.awarded !== d.after.awarded) : [];
  return { pages: want ? [...want].sort((a, b) => a - b) : null, hadPrevious, parts, changed };
}

/** Telegram-safe maths: "$\lg n \approx 1.87$" → "lg n ≈ 1.87". */
export function plainMath(text: unknown): string {
  const words: Record<string, string> = { approx: '≈', times: '×', cdot: '·', le: '≤', ge: '≥', neq: '≠', ne: '≠', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', infty: '∞', pm: '±', sqrt: '√', div: '÷', to: '→', rightarrow: '→' };
  return String(text ?? '')
    .replace(/\$/g, '')
    .replace(/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\([A-Za-z]+)/g, (_m, k: string) => words[k] !== undefined ? words[k] : k)
    .replace(/\^\{([^}]*)\}/g, '^$1').replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

/** Cut a message at a word boundary with an ellipsis, never mid-word. */
export function clip(text: string, max: number): string {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}
