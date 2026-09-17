// Closure tracking (17 Sep 2026, Adrian: "do the closure tracking"). When a
// Practice Again sheet comes back marked, each question the marker found on it
// is matched to the SECTION that taught it — by the words of the question,
// against the practice questions the section carried — and the section is
// scored on what the student did with it:
//   closed         every matched question got full marks
//   slip           marks were lost, but only to careless slips
//   still_failing  marks were lost to method or anything else
//   unknown        no question on the returned sheet matched this section
// Pure and tested; lib/sheet-closure-store.ts writes the rows.
export type ClosureSection = { id: string; section_index: number; title: string; practice_texts: string[] };
export type ReturnedQuestion = {
  /** The marker's description of the printed question (marking_output.question.prompt or text). */
  text: string;
  question_number: string;
  awarded: number;
  max: number;
  /** The error kinds of the lost parts, e.g. ['careless'] or ['concept', 'careless']. */
  kinds: string[];
};
export type SectionOutcome = {
  section_id: string;
  outcome: 'closed' | 'slip' | 'still_failing' | 'unknown';
  awarded: number;
  max: number;
  matched: { question_number: string; score: number }[];
};

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'at', 'for', 'with', 'is', 'are', 'by', 'from', 'that', 'this', 'find', 'calculate', 'show', 'given', 'hence', 'write', 'down', 'value', 'values', 'each', 'its', 'it', 'as', 'be', 'has', 'have', 'which', 'when', 'where', 'two', 'one', 'cm', 'kg', 'mm', 'answer', 'give', 'your', 'correct', 'significant', 'figures', 'decimal', 'places']);

/** Content words of a question, numbers included (numbers are what tell twins apart). */
export function questionTokens(text: string): Set<string> {
  return new Set(String(text || '').toLowerCase().replace(/\\[a-z]+/g, ' ').replace(/[^a-z0-9.]+/g, ' ').split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w)));
}

/** Overlap of a returned question with one practice text: |A∩B| / |smaller|. */
export function overlap(a: string, b: string): number {
  const ta = questionTokens(a), tb = questionTokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit += 1;
  return hit / Math.min(ta.size, tb.size);
}

/** The section a returned question belongs to: the best overlap of at least
 *  `floor` (0.45 — the marker rephrases the stem, so exact matches are rare;
 *  a shared number-rich stem still scores high). Null when nothing is close. */
export function sectionFor(q: ReturnedQuestion, sections: ClosureSection[], floor = 0.45): { section: ClosureSection; score: number } | null {
  let best: { section: ClosureSection; score: number } | null = null;
  for (const s of sections) {
    for (const t of s.practice_texts || []) {
      const sc = overlap(q.text, t);
      if (sc >= floor && (!best || sc > best.score)) best = { section: s, score: sc };
    }
  }
  return best;
}

const CARELESS = new Set(['careless', 'arithmetic', 'sign', 'rounding', 'units', 'transfer']);

/** One outcome per section. */
export function sectionOutcomes(sections: ClosureSection[], returned: ReturnedQuestion[]): SectionOutcome[] {
  const by = new Map<string, { awarded: number; max: number; kinds: string[]; matched: { question_number: string; score: number }[] }>();
  for (const s of sections) by.set(s.id, { awarded: 0, max: 0, kinds: [], matched: [] });
  for (const q of returned) {
    const hit = sectionFor(q, sections);
    if (!hit) continue;
    const slot = by.get(hit.section.id)!;
    slot.awarded += Number(q.awarded) || 0;
    slot.max += Number(q.max) || 0;
    slot.kinds.push(...(q.kinds || []).filter(Boolean));
    slot.matched.push({ question_number: q.question_number, score: Math.round(hit.score * 100) / 100 });
  }
  return sections.map(s => {
    const v = by.get(s.id)!;
    let outcome: SectionOutcome['outcome'] = 'unknown';
    if (v.matched.length) {
      if (v.max > 0 && v.awarded >= v.max) outcome = 'closed';
      else if (v.kinds.length && v.kinds.every(k => CARELESS.has(k))) outcome = 'slip';
      else outcome = 'still_failing';
    }
    return { section_id: s.id, outcome, awarded: v.awarded, max: v.max, matched: v.matched };
  });
}

/** The returned sheet's questions, read off a run's results. */
export function returnedQuestions(results: unknown): ReturnedQuestion[] {
  if (!Array.isArray(results)) return [];
  const out: ReturnedQuestion[] = [];
  for (const res of results as Array<Record<string, unknown>>) {
    if (!res || typeof res !== 'object' || res.superseded) continue;
    const mo = (res.marking_output ?? {}) as Record<string, unknown>;
    const m = (res.marking ?? {}) as Record<string, unknown>;
    const qRaw = mo.question;
    const text = typeof qRaw === 'string' ? qRaw
      : qRaw && typeof qRaw === 'object' ? String((qRaw as Record<string, unknown>).prompt ?? (qRaw as Record<string, unknown>).text ?? '') : '';
    const parts = Array.isArray(mo.parts) ? mo.parts as Array<Record<string, unknown>> : [];
    const kinds = parts.filter(p => Number(p.awarded) < Number(p.max)).map(p => String(p.error_kind ?? '')).filter(Boolean);
    const awarded = Number(m.total_awarded ?? parts.reduce((a, p) => a + (Number(p.awarded) || 0), 0)) || 0;
    const max = Number(m.total_max ?? parts.reduce((a, p) => a + (Number(p.max) || 0), 0)) || 0;
    if (!text || max <= 0) continue;
    out.push({ text, question_number: String(res.question_number ?? ''), awarded, max, kinds });
  }
  return out;
}

/** One line for Adrian per returned sheet: "3 sections: 2 closed, 1 still failing". */
export function closureLine(outcomes: SectionOutcome[]): string {
  const n = (k: SectionOutcome['outcome']) => outcomes.filter(o => o.outcome === k).length;
  const bits = [['closed', n('closed')], ['slip', n('slip')], ['still failing', n('still_failing')], ['unmatched', n('unknown')]].filter(([, c]) => (c as number) > 0).map(([k, c]) => `${c} ${k}`);
  return `${outcomes.length} section${outcomes.length === 1 ? '' : 's'}: ${bits.join(', ') || 'nothing matched'}`;
}
