// A score chip Adrian retyped on the page ("Q3(b) 2/2" → "Q3(b) 1/2") is a mark
// change, and the record must follow the ink (20 Sep 2026 — "if i change the
// marks, will it recalculate?"). This turns the overlay's score edits into the
// per-question overrides the desk's own mark editor writes (lib/mark-triage
// applyOverride with parts), so the question total, the paper total and the
// cover all move together and nothing is re-derived here.
import type { RecordEdit } from './layer';
import type { PartOverride } from '@/lib/mark-triage';

export type ScoreEdit = Extract<RecordEdit, { kind: 'score' }>;

export type ScoreOverride = {
  /** Index of the question in result_json.results. */
  index: number;
  /** Per-part marks to set; empty when the question has no parts array. */
  parts: PartOverride[];
  /** Whole-question mark, used only when `parts` is empty. */
  awarded: number;
};

type Row = { question_number?: unknown; photo_index?: unknown; marking?: { parts?: unknown; total_max?: unknown } };

const normLabel = (s: unknown) => String(s ?? '').replace(/[()\s.]/g, '').toLowerCase();

/** The chip's part attribute as the bot writes it is the keyed caption ("Q3(b)",
 *  "Q3b", or just "Q3" for a one-part question); the record's label is "(b)". */
export function partLabelFromChip(part: string, q: string): string {
  const stripped = String(part || '').trim().replace(new RegExp(`^q\\s*${String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '');
  return stripped.trim();
}

export function scoreEdits(edits: unknown): ScoreEdit[] {
  if (!Array.isArray(edits)) return [];
  return edits.filter((e): e is ScoreEdit =>
    !!e && typeof e === 'object' && (e as { kind?: unknown }).kind === 'score'
    && typeof (e as { q?: unknown }).q === 'string' && Number.isFinite(Number((e as { awarded?: unknown }).awarded)) && Number.isFinite(Number((e as { max?: unknown }).max)));
}

/**
 * Group the score edits by the question they belong to. A question is matched by
 * its printed number, the copy on the edited page first (a question can run over
 * two photos). A part is matched by label; when the chip names no part and the
 * question has exactly one, that one is meant. An edit that matches nothing is
 * dropped — the ink still changes, the record does not, and the caller says so.
 */
export function scoreEditsToOverrides(resultJson: unknown, edits: ScoreEdit[], photoIndex: number): { overrides: ScoreOverride[]; unmatched: ScoreEdit[] } {
  const rows = Array.isArray((resultJson as { results?: unknown })?.results) ? ((resultJson as { results: Row[] }).results) : [];
  const byIndex = new Map<number, ScoreOverride>();
  const unmatched: ScoreEdit[] = [];
  for (const e of edits) {
    const candidates = rows.map((r, i) => ({ r, i })).filter(({ r }) => String(r.question_number ?? '') === String(e.q));
    if (!candidates.length) { unmatched.push(e); continue; }
    const pick = candidates.find(({ r }) => Number(r.photo_index) === photoIndex) ?? candidates[0];
    const parts = Array.isArray(pick.r.marking?.parts) ? (pick.r.marking!.parts as { label?: unknown; max?: unknown }[]) : [];
    const cur = byIndex.get(pick.i) ?? { index: pick.i, parts: [], awarded: 0 };
    if (!parts.length) {
      cur.awarded = e.awarded;
      byIndex.set(pick.i, cur);
      continue;
    }
    const want = normLabel(partLabelFromChip(e.part, e.q));
    const target = want
      ? parts.find(p => normLabel(p.label) === want)
      : (parts.length === 1 ? parts[0] : undefined);
    if (!target) { unmatched.push(e); continue; }
    cur.parts = cur.parts.filter(p => normLabel(p.label) !== normLabel(target.label));
    cur.parts.push({ label: String(target.label ?? ''), awarded: e.awarded });
    byIndex.set(pick.i, cur);
  }
  return { overrides: [...byIndex.values()], unmatched };
}
