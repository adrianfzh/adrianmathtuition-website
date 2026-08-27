// Worked-solution rollup — the one place that knows where solution text lives.
//
// Since the 2026-08-27 canonicalisation, per-part solutions inside
// `questions.parts` are the source of truth and the duplicated top-level
// `solution` copy was nulled on ~15.6k rows (quarantine + backup tables were
// taken first; see solution_slot_review). Any reader that consumes a whole
// worked solution as text must go through this: top-level when present,
// else the parts' solutions stitched in order with their labels.
//
// Pure (repo testing policy) — no I/O, tolerant of malformed jsonb.

export function rollupSolution(solution: unknown, parts: unknown): string {
  const top = typeof solution === 'string' ? solution.trim() : '';
  if (top) return top;

  const lines: string[] = [];
  const walk = (ps: unknown, prefix: string): void => {
    if (!Array.isArray(ps)) return;
    for (const p of ps) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
      const o = p as Record<string, unknown>;
      const own = typeof o.label === 'string' ? o.label.trim() : '';
      const label = own && prefix ? `${prefix}${own}` : own || prefix;
      const sol = typeof o.solution === 'string' ? o.solution.trim() : '';
      if (sol) lines.push(label ? `${label} ${sol}` : sol);
      if (Array.isArray(o.subparts)) walk(o.subparts, label);
    }
  };
  walk(parts, '');
  return lines.join('\n\n');
}

/**
 * The same rule for ANSWERS. Unlike solutions, the top-level answer is a
 * materialised compact key and is usually present — but 3,981 rows carry
 * their answer ONLY inside parts, so a reader that trusts the top level
 * alone shows those students nothing. Joined inline (not blank-line
 * separated) because an answer key is a one-line artifact, not prose.
 */
export function rollupAnswer(answer: unknown, parts: unknown): string {
  const top = typeof answer === 'string' ? answer.trim() : '';
  if (top) return top;

  const bits: string[] = [];
  const walk = (ps: unknown, prefix: string): void => {
    if (!Array.isArray(ps)) return;
    for (const p of ps) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
      const o = p as Record<string, unknown>;
      const own = typeof o.label === 'string' ? o.label.trim() : '';
      const label = own && prefix ? `${prefix}${own}` : own || prefix;
      const ans = typeof o.answer === 'string' ? o.answer.trim() : '';
      if (ans) bits.push(label ? `${label} ${ans}` : ans);
      if (Array.isArray(o.subparts)) walk(o.subparts, label);
    }
  };
  walk(parts, '');
  return bits.join('   ');
}
