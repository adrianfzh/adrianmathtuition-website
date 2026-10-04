// /admin/extraction-rules — every rule the question-bank extraction follows, in plain words
// (Adrian, 5 Oct 2026: "are standing rules fixed?" → "yes do that").
//
// The rows live in Supabase `extraction_rules` (main project). The LAW the workers read is
// still `extraction_worker_prompt` id 'exam-extraction'; a row's `law_text` is the exact text
// there, and the bot's extraction learner (scripts/extraction-learn.js) adds a row whenever it
// applies or proposes a rule — docs/EXTRACTION-QUEUE.md §The rules in plain words.
// Pure; tested (extraction-rules.test.ts). The page reads with the service key.

export type RuleKind = 'safe' | 'filing';
export type RuleStatus = 'proposed' | 'active' | 'retired' | 'dropped' | 'redraft';
export interface ExtractionRule {
  slug: string;
  type: 'rule' | 'alias';
  kind: RuleKind;
  status: RuleStatus;
  title: string;
  plain_words: string;
  law_text: string | null;
  law_section: string | null;
  why: string | null;
  proposal: string | null;
  evidence: { id?: string; paper?: string; said?: string }[] | null;
  requeue_ids: string[] | null;
  source: 'learned' | 'adrian-ruling' | 'existing';
  added_at: string;
  decided_at: string | null;
  replaced_by: string | null;
  note: string | null;
}

export interface RuleGroups {
  /** Waiting for Adrian — proposed, or being rewritten after his Change note. */
  waiting: ExtractionRule[];
  /** How papers are filed (level, school, exam, skipping, splitting, keys). */
  filing: ExtractionRule[];
  /** What the worker does (figures, solutions, checks). */
  worker: ExtractionRule[];
  /** Known spellings of one school. */
  spellings: ExtractionRule[];
  /** Retired or dropped — folded at the bottom. */
  old: ExtractionRule[];
}

const newestFirst = (a: ExtractionRule, b: ExtractionRule) => String(b.added_at).localeCompare(String(a.added_at));

export function groupRules(rules: ExtractionRule[]): RuleGroups {
  const g: RuleGroups = { waiting: [], filing: [], worker: [], spellings: [], old: [] };
  for (const r of rules) {
    if (r.status === 'proposed' || r.status === 'redraft') g.waiting.push(r);
    else if (r.status === 'retired' || r.status === 'dropped') g.old.push(r);
    else if (r.type === 'alias') g.spellings.push(r);
    else if (r.kind === 'filing') g.filing.push(r);
    else g.worker.push(r);
  }
  for (const k of Object.keys(g) as (keyof RuleGroups)[]) g[k].sort(newestFirst);
  g.spellings.sort((a, b) => a.title.localeCompare(b.title));
  return g;
}

/** "5 Oct 2026" in Singapore time. */
export function sgtDay(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
}

const SOURCE_WORDS: Record<ExtractionRule['source'], string> = {
  'adrian-ruling': 'your ruling',
  learned: 'learned from the flags',
  existing: 'already in the rules',
};

/** The grey line under a rule: "added 5 Oct 2026 · your ruling". */
export function addedLine(r: ExtractionRule): string {
  const bits = [`added ${sgtDay(r.added_at)}`, SOURCE_WORDS[r.source] ?? r.source];
  if (r.status === 'retired' && r.replaced_by) bits.push(`replaced by ${r.replaced_by}`);
  if (r.status === 'dropped' && r.decided_at) bits.push(`dropped ${sgtDay(r.decided_at)}`);
  if (r.status === 'redraft') bits.push('being rewritten with your note');
  return bits.join(' · ');
}

/** What the "Change this" button copies — Adrian finishes the sentence and gives it to a session. */
export function changeRequest(r: Pick<ExtractionRule, 'slug'>): string {
  return `Change rule ${r.slug}: `;
}

/** One idea a line: split a stored paragraph on line breaks. */
export function lines(text: string | null | undefined): string[] {
  return String(text ?? '').split(/\n+/).map(s => s.trim()).filter(Boolean);
}
