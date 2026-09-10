// Saved answers — the pure half (SPEC-NOTEBOOK-V2 §1, 11 Sep 2026: "build
// notebook: save an answer"). A student taps 💾 under an Ask answer and the
// question + worked answer land in My Notebook, filed under the topic (the word
// they know) and tagged with the bank sub-skill (from ask_skills, when the bot
// has filed that ask). They may retitle the card; the skill stays as the tag.
//
// The row store is Supabase `notebook_saves` (private to the student, RLS on,
// no policies — service key only, identity-filtered). The route is
// /api/portal/notebook/saves; the band is app/my-notes/saved-answers.tsx.

export interface SaveRow {
  id: string;
  kind: 'ask' | 'practice' | 'clip' | string;
  source: string | null;
  question_text: string | null;
  answer_text: string;
  image_url: string | null;
  title: string;
  topic: string | null;
  skill: string | null;
  created_at: string;
}

export const MAX_TITLE = 90;
export const MAX_SAVES_PER_STUDENT = 500;
/** How far an ask_skills row may sit from the answer's timestamp and still be "this ask". */
export const SKILL_MATCH_WINDOW_MS = 15 * 60_000;

/** The card's default title: the question's first line, trimmed — else the answer's — else a plain label. */
export function saveTitleFrom(questionText: string | null | undefined, answerText: string | null | undefined): string {
  const pick = (s: string | null | undefined) => {
    const line = String(s || '').replace(/\$\$?[^$]*\$\$?/g, ' ').replace(/[*_`#>]/g, '').split('\n').map(l => l.trim())
      // "[image]" is the chat's placeholder for a photo question — not a title.
      .find(l => l.length >= 3 && !/^\[?(image|photo)\]?$/i.test(l)) || '';
    return line.replace(/\s+/g, ' ').trim();
  };
  const q = pick(questionText);
  const a = pick(answerText);
  const base = q || a || 'Saved answer';
  return base.length > MAX_TITLE ? base.slice(0, MAX_TITLE - 1).replace(/\s+\S*$/, '') + '…' : base;
}

/** A student-typed title, cleaned; empty → null (keep the old one). */
export function cleanTitle(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return t.length >= 1 ? t : null;
}

/**
 * Pick the ask_skills row for an answer: the nearest by time inside the window,
 * or null. Rows are {topic, skill, asked_at}; `at` is the answer's timestamp.
 */
export function nearestAskSkill<T extends { asked_at: string }>(rows: readonly T[], at: string, windowMs = SKILL_MATCH_WINDOW_MS): T | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  let best: T | null = null;
  let bestGap = Infinity;
  for (const r of rows) {
    const g = Math.abs(Date.parse(r.asked_at) - t);
    if (Number.isFinite(g) && g <= windowMs && g < bestGap) { best = r; bestGap = g; }
  }
  return best;
}

export interface SaveGroup { topic: string; saves: SaveRow[] }

/** Group by topic for the band — newest topic first (by its newest save); untagged saves last under "Other". */
export function groupSavesByTopic(rows: readonly SaveRow[]): SaveGroup[] {
  const byTopic = new Map<string, SaveRow[]>();
  for (const r of [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    const key = (r.topic || '').trim() || 'Other';
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key)!.push(r);
  }
  const groups = [...byTopic].map(([topic, saves]) => ({ topic, saves }));
  return groups.sort((a, b) => {
    if (a.topic === 'Other') return 1;
    if (b.topic === 'Other') return -1;
    return a.saves[0].created_at < b.saves[0].created_at ? 1 : -1;
  });
}
