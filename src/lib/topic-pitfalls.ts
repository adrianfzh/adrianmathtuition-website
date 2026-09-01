// Curated traps (Supabase `pitfalls`) for the portal practice grader.
//
// Why this exists: when a student's paper is MARKED, the marker reads their
// handwriting and diagnoses the actual slip, so it needs no help. The practice
// grader is the opposite case — for a typed attempt it often sees only a wrong
// final value, with no working to diagnose. There, a curated trap for the
// question's topic is the best signal available.
//
// The pure functions here are unit-tested (topic-pitfalls.test.ts); the fetch is
// the only part that touches Supabase.

export type PitfallRow = {
  subject: string;
  topic: string;
  wrong_move: string;
  why_wrong: string | null;
  corrective_cue: string | null;
};

/**
 * Map a `questions.level` value onto the `pitfalls.subject` vocabulary.
 *
 * The two tables use different alphabets: questions carry the fine-grained
 * teaching level (S3_AM, JC2_H1, EM_NA…), pitfalls carry the coarse subject the
 * trap belongs to (AM/EM/JC/S1/S2). A Sec 3 A-Math trap is the same trap at
 * Sec 4, so the S3_* levels fold into their parent. Returns null when no
 * pitfalls vocabulary covers the level, in which case we simply send none.
 */
export function pitfallSubjectForLevel(level: string | null | undefined): string | null {
  const l = String(level || '').trim().toUpperCase();
  if (!l) return null;
  if (l === 'S1') return 'S1';
  if (l === 'S2') return 'S2';
  if (l.startsWith('JC')) return 'JC';          // JC1, JC2, JC2_H1
  if (l.includes('AM')) return 'AM';            // AM, S3_AM, AM_NA
  if (l.includes('EM')) return 'EM';            // EM, S3_EM, EM_NA, S3_EM_NT…
  return null;
}

const STOP = new Set(['the','a','an','of','to','in','is','it','and','or','for','on','as','by',
  'that','this','with','when','not','be','are','at','from','into','every','each','its','you','your']);

/** Content words of a string, lowercased, for cheap overlap scoring. */
function tokens(s: string): Set<string> {
  return new Set(
    String(s || '').toLowerCase().replace(/\$[^$]*\$/g, ' ')   // drop LaTeX spans
      .split(/[^a-z]+/).filter(w => w.length > 3 && !STOP.has(w)),
  );
}

/**
 * Choose which traps to send for a question.
 *
 * Deliberately strict: only rows whose topic is one the question is actually
 * tagged with, deduped on wrong_move, and hard-capped. A long list invites the
 * grader to hunt for errors that are not on the page, which is the failure mode
 * this whole feature has to avoid — so fewer, exactly-matching traps beat more.
 *
 * A broad topic can hold far more traps than the cap (AM "Logarithms" has 15),
 * so when `context` (the question text and answer) is supplied the rows are
 * ranked by word overlap with it and the closest are kept. Without context the
 * original order is preserved, which keeps the pure ordering predictable.
 */
export function selectPitfalls(
  rows: PitfallRow[],
  topics: string[],
  limit = 4,
  context = '',
): PitfallRow[] {
  if (!rows?.length || !topics?.length) return [];
  const wanted = new Set(topics.map(t => String(t).trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const matched: PitfallRow[] = [];
  for (const r of rows) {
    if (!r?.wrong_move) continue;
    if (!wanted.has(String(r.topic || '').trim().toLowerCase())) continue;
    const key = r.wrong_move.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(r);
  }
  if (matched.length <= limit || !context) return matched.slice(0, limit);

  const ctx = tokens(context);
  const scored = matched.map((r, i) => {
    const t = tokens(`${r.wrong_move} ${r.why_wrong || ''}`);
    let hits = 0;
    for (const w of t) if (ctx.has(w)) hits++;
    return { r, i, hits };
  });
  // Highest overlap first; original order breaks ties so the result is stable.
  scored.sort((a, b) => b.hits - a.hits || a.i - b.i);
  return scored.slice(0, limit).map(s => s.r);
}

/**
 * Load this question's traps. Never throws and never blocks grading — any
 * failure returns [] and the grader runs exactly as it did before.
 *
 * `admin` is the Supabase service client. It is deliberately untyped here:
 * threading the generated database generics through this call makes tsc report
 * "type instantiation is excessively deep", and the query result is validated
 * structurally by selectPitfalls anyway.
 */
export async function loadPitfallsForQuestion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  level: string | null | undefined,
  topics: unknown,
  limit = 4,
  context = '',
): Promise<PitfallRow[]> {
  try {
    const subject = pitfallSubjectForLevel(level);
    const topicList = Array.isArray(topics) ? (topics as unknown[]).map(String) : [];
    if (!subject || !topicList.length) return [];
    // status='approved' is the gate: `pitfalls.status` defaults to 'pending' and
    // NOTHING has ever moved a row off it, so this filter means only traps
    // Adrian has personally signed off reach a student. With none approved the
    // query returns nothing and the grader behaves exactly as it did before —
    // the safe direction to fail.
    const { data, error } = await admin
      .from('pitfalls')
      .select('subject, topic, wrong_move, why_wrong, corrective_cue')
      .eq('status', 'approved')
      .eq('subject', subject)
      .in('topic', topicList);
    if (error || !Array.isArray(data)) return [];
    return selectPitfalls(data as PitfallRow[], topicList, limit, context);
  } catch {
    return [];
  }
}
