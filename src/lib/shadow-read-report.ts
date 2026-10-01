// 👻 lib/shadow-read-report — the website's read of the bot's SHADOW READS
// (1 Oct 2026; the bot writes them, `lib/shadow-read.js`, flag MARKING_SHADOW_ARMS).
//
// A second model (the agreed arm: Sonnet 5.5 reading against the bank's reference
// solutions) marks every delivered maths paper again, after delivery, and its
// per-part marks sit in `paper_marking_runs.result_json.shadow_read`. This module
// turns those records into the lines Adrian reads: per arm, per level, how often
// the shadow gave the delivered mark, against the NOISE FLOOR — how often the
// marker gives its own delivered mark when it re-reads a paper (the weekly
// consistency shadow, `result_json.shadow_runs[]`). The TWIN of the bot's
// `summariseShadowReads` in lib/shadow-read.js; the worked example in the test is
// the same there, so a drift fails a test rather than printing two numbers.
//
// It does not judge. A level moves to the cheaper reader only when Adrian says so,
// after adjudicating the listed disagreements (CLAUDE.md §Measuring the marking).
import { flattenParts, diffAssemblies, type MarkedResult } from './shadow-diff';

export type ShadowPart = { q: string | null; part: string; awarded: number; max: number; why?: string | null; codes?: string | null };
export type ShadowPage = { photo_index: number; parts: ShadowPart[]; error?: string | null; empty?: boolean };
export type ShadowArm = {
  key: string; model: string; reference?: boolean; pages?: ShadowPage[];
  cost_usd?: number; in_tok?: number; out_tok?: number; sec?: number; error?: string | null;
};
export type ShadowReadRecord = { arms: ShadowArm[]; arm_keys?: string[]; at?: string | null; shadow_cost_usd?: number };
export type ShadowRun = {
  id: string; paper_name?: string | null; student_name?: string | null; created_at?: string | null;
  result_json?: { results?: MarkedResult[] | null; shadow_read?: ShadowReadRecord | null; shadow_runs?: { at?: string; results?: MarkedResult[] }[] | null } | null;
};

export type Bucket = {
  papers: number; with_reference: number; pages: number; pages_failed: number; pages_empty: number;
  parts: number; same: number; abs_diff: number; shadow_only: number; delivered_only: number;
  cost_usd: number; agree_pct: number | null; abs_diff_per_paper: number | null; cost_per_paper: number | null; verdict: string;
};
export type ShadowDiffRow = {
  run_id: string; paper: string; level: string; at: string | null; key: string; q: string; part: string;
  delivered: number; shadow: number; max: number; photo_index: number | null; why: string | null;
};
export type ArmSummary = { key: string; model: string; all: Bucket; levels: ({ level: string } & Bucket)[]; diffs: ShadowDiffRow[] };
export type NoiseFloor = { papers: number; parts: number; same: number; agree_pct: number };
export type ShadowSummary = { noise: NoiseFloor | null; arms: ArmSummary[] };

export const MIN_PAPERS_PER_LEVEL = 10;

const pct = (a: number, b: number): number | null => (b ? Math.round((1000 * a) / b) / 10 : null);

/** A paper's level from its name — a rough grouping for the report only. */
export function levelOf(name: string | null | undefined): string {
  const n = String(name || '');
  if (/\bH2\b|\bJC\b|9758|9740/i.test(n)) return 'H2';
  if (/\bA[ -]?Math|\bAM\b|4049|4047/i.test(n)) return 'A Math';
  if (/\bE[ -]?Math|\bEM\b|4048|4052/i.test(n)) return 'E Math';
  if (/\bSec ?[12]\b|\bS[12]\b/i.test(n)) return 'Lower Sec';
  return 'other';
}

/** The marker against itself: latest consistency re-read vs the delivered marks, every paper that has one. */
export function noiseFloor(runs: ShadowRun[] | null | undefined): NoiseFloor | null {
  let papers = 0, parts = 0, same = 0;
  for (const r of runs ?? []) {
    const rj = r?.result_json ?? {};
    const reads = (rj.shadow_runs ?? []).filter((x) => x && Array.isArray(x.results));
    if (!reads.length || !Array.isArray(rj.results)) continue;
    const latest = [...reads].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
    const d = diffAssemblies(rj.results, latest.results!);
    if (!d.parts.total) continue;
    papers += 1; parts += d.parts.total; same += d.parts.same;
  }
  return papers ? { papers, parts, same, agree_pct: pct(same, parts)! } : null;
}

/** Shadow pages → the results[] shape flattenParts understands (failed pages left out). */
function pagesAsResults(pages: ShadowPage[]): MarkedResult[] {
  const out: MarkedResult[] = [];
  for (const pg of pages) for (const p of pg.parts ?? []) out.push({ question_number: p.q, marking_output: { parts: [{ label: p.part, awarded: p.awarded, max: p.max }] } });
  return out;
}

/** Delivered vs one arm, part by part, over the pages the arm read without error. */
export function computeAgreement(delivered: MarkedResult[], pages: ShadowPage[]) {
  const ok = (pages ?? []).filter((p) => p && !p.error && Array.isArray(p.parts));
  const read = new Set(ok.map((p) => p.photo_index));
  const D = flattenParts((delivered ?? []).filter((r) => {
    const pi = (r as { photo_index?: number | null }).photo_index;
    return pi == null || read.has(pi);
  }));
  const S = flattenParts(pagesAsResults(ok));
  const origin = new Map<string, { photo_index: number; why: string | null }>();
  for (const pg of ok) for (const p of pg.parts) {
    const k = [...flattenParts([{ question_number: p.q, marking_output: { parts: [{ label: p.part, awarded: 0, max: 0 }] } }]).keys()][0];
    if (k && !origin.has(k)) origin.set(k, { photo_index: pg.photo_index, why: p.why ?? null });
  }
  let parts = 0, same = 0, abs_diff = 0, shadow_only = 0;
  const diffs: Omit<ShadowDiffRow, 'run_id' | 'paper' | 'level' | 'at'>[] = [];
  for (const [k, s] of S) {
    const d = D.get(k);
    if (!d) { shadow_only += 1; continue; }
    parts += 1;
    if (d.awarded === s.awarded) { same += 1; continue; }
    abs_diff += Math.abs(d.awarded - s.awarded);
    const o = origin.get(k);
    diffs.push({ key: k, q: s.question, part: s.label, delivered: d.awarded, shadow: s.awarded, max: d.max || s.max, photo_index: o?.photo_index ?? null, why: o?.why ?? null });
  }
  let delivered_only = 0;
  for (const k of D.keys()) if (!S.has(k)) delivered_only += 1;
  return { agreement: { parts, same, diff: parts - same, shadow_only, delivered_only, abs_diff }, diffs };
}

type Raw = Omit<Bucket, 'agree_pct' | 'abs_diff_per_paper' | 'cost_per_paper' | 'verdict'>;
const fresh = (): Raw => ({ papers: 0, with_reference: 0, pages: 0, pages_failed: 0, pages_empty: 0, parts: 0, same: 0, abs_diff: 0, shadow_only: 0, delivered_only: 0, cost_usd: 0 });

/** The verdict rule: ≥ MIN_PAPERS_PER_LEVEL papers and agreement at or above the marker's own. */
export function verdictFor(b: Raw, floor: number | null): string {
  if (!b.parts) return 'nothing compared yet';
  if (floor == null) return 'no noise floor yet (no consistency re-reads to compare against)';
  const agree = pct(b.same, b.parts)!;
  if (b.papers < MIN_PAPERS_PER_LEVEL) return `too few papers (${b.papers}, want ≥ ${MIN_PAPERS_PER_LEVEL})`;
  return agree >= floor
    ? `agrees at least as often as the marker agrees with itself (${agree}% vs ${floor}%) — a candidate`
    : `below the marker's own consistency (${agree}% vs ${floor}%) — stays Opus`;
}

export function summariseShadowReads(runs: ShadowRun[] | null | undefined, noise: NoiseFloor | null = null): ShadowSummary {
  const arms = new Map<string, { key: string; model: string; all: Raw; levels: Map<string, Raw>; diffs: ShadowDiffRow[] }>();
  const add = (b: Raw, a: ShadowArm, ag: ReturnType<typeof computeAgreement>['agreement']) => {
    b.papers += 1; if (a.reference) b.with_reference += 1;
    const pages = a.pages ?? [];
    b.pages += pages.length; b.pages_failed += pages.filter((p) => p?.error).length; b.pages_empty += pages.filter((p) => p?.empty).length;
    b.parts += ag.parts; b.same += ag.same; b.abs_diff += ag.abs_diff; b.shadow_only += ag.shadow_only; b.delivered_only += ag.delivered_only;
    b.cost_usd += Number(a.cost_usd) || 0;
  };
  for (const r of runs ?? []) {
    const rj = r?.result_json ?? {};
    const rec = rj.shadow_read;
    if (!rec || !Array.isArray(rec.arms)) continue;
    const level = levelOf(r.paper_name);
    const paper = [r.student_name, r.paper_name].filter(Boolean).join(' — ') || String(r.id).slice(0, 8);
    for (const a of rec.arms) {
      if (!a?.key) continue;
      if (!arms.has(a.key)) arms.set(a.key, { key: a.key, model: a.model, all: fresh(), levels: new Map(), diffs: [] });
      const A = arms.get(a.key)!;
      if (!A.levels.has(level)) A.levels.set(level, fresh());
      const { agreement, diffs } = computeAgreement(rj.results ?? [], a.pages ?? []);
      add(A.all, a, agreement); add(A.levels.get(level)!, a, agreement);
      for (const d of diffs) A.diffs.push({ run_id: r.id, paper, level, at: rec.at ?? r.created_at ?? null, ...d });
    }
  }
  const floor = noise?.agree_pct ?? null;
  const finish = (b: Raw): Bucket => ({
    ...b,
    cost_usd: Math.round(b.cost_usd * 1000) / 1000,
    agree_pct: pct(b.same, b.parts),
    abs_diff_per_paper: b.papers ? Math.round((100 * b.abs_diff) / b.papers) / 100 : null,
    cost_per_paper: b.papers ? Math.round((1000 * b.cost_usd) / b.papers) / 1000 : null,
    verdict: verdictFor(b, floor),
  });
  return {
    noise,
    arms: [...arms.values()].map((A) => ({
      key: A.key, model: A.model, all: finish(A.all),
      levels: [...A.levels.entries()].map(([level, b]) => ({ level, ...finish(b) })).sort((x, y) => y.papers - x.papers),
      diffs: A.diffs.sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')) || x.key.localeCompare(y.key)),
    })),
  };
}

/** The Monday report's ONE line, or null while nothing has been shadowed. */
export function shadowLine(s: ShadowSummary): string | null {
  const A = s.arms[0];
  if (!A || !A.all.papers) return null;
  const lv = A.levels.filter((l) => l.parts).map((l) => `${l.level} ${l.agree_pct}% of ${l.parts}`).join(', ');
  const floor = s.noise ? ` (marker vs itself ${s.noise.agree_pct}%)` : '';
  const todo = A.diffs.length ? `; ${A.diffs.length} part${A.diffs.length === 1 ? '' : 's'} to adjudicate` : '; no disagreements';
  return `👻 Shadow (${A.key}): ${A.all.papers} paper${A.all.papers === 1 ? '' : 's'}; same mark on ${lv || `${A.all.agree_pct}% of ${A.all.parts}`}${floor}${todo}.`;
}

/** The weekly message: the line, the verdict per level, and the first few disagreements with their doors. */
export function shadowReport(s: ShadowSummary, { maxDiffs = 8, base = 'https://www.adrianmathtuition.com' } = {}): string | null {
  const head = shadowLine(s);
  if (!head) return null;
  const out = [head];
  for (const A of s.arms) {
    out.push(`${A.key}: US$${A.all.cost_per_paper ?? '–'} a paper, reference on ${A.all.with_reference}/${A.all.papers}, pages failed ${A.all.pages_failed}/${A.all.pages}.`);
    for (const l of A.levels) out.push(`  ${l.level}: ${l.papers} papers — ${l.verdict}`);
    if (A.diffs.length) {
      out.push(`Disagreeing parts (delivered → shadow, of max)${A.diffs.length > maxDiffs ? `, first ${maxDiffs} of ${A.diffs.length}` : ''}:`);
      for (const d of A.diffs.slice(0, maxDiffs)) {
        out.push(`• ${d.paper} · Q${d.q}${d.part} · ${d.delivered} → ${d.shadow} / ${d.max}${d.why ? ` · "${d.why}"` : ''}\n  ${base}/admin/mark-paper?run=${d.run_id}`);
      }
      out.push('All of them: node scripts/shadow-sonnet-report.cjs --diffs (bot repo). A level moves only on your word.');
    }
  }
  return out.join('\n');
}
