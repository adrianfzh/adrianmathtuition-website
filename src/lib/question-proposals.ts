// Validating a question the sheet worker wrote, before it can wait for vetting.
//
// The worker is a headless session composing JSON by hand, so this is the gate
// between "a model produced some fields" and a row Adrian will be asked to rule
// on. Everything is pure and tested; the route only inserts.
//
// The strictness is deliberate on two fields. `question_text` must be long enough
// to be a question — a queue full of fragments is a queue nobody opens. And the
// FAILED SEARCH must be recorded, because it is what separates "the bank genuinely
// lacks this" from "nobody looked": without it the vetting queue cannot tell the
// two apart, and the gap is the half worth knowing.

export const MAX_LIST = 500;
/** Short enough to catch a fragment, long enough for a one-line "find k." item. */
export const MIN_QUESTION_CHARS = 25;
const MAX_TEXT = 8000;
const MAX_TOPICS = 8;

export type ProposalRow = {
  sheet_job_id: string | null;
  run_id: string | null;
  student_name: string | null;
  paper_name: string | null;
  level: string;
  topics: string[];
  question_text: string;
  answer: string | null;
  solution: string | null;
  marks: number | null;
  skill: string | null;
  search_query: string | null;
  search_hits: unknown;
};

const uuid = (v: unknown): string | null =>
  (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) ? v : null;

const text = (v: unknown, cap = MAX_TEXT): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, cap) : null;
};

/**
 * Validate one proposal. Returns `{ row }` or `{ error }` — never throws, and
 * never half-accepts: a row that reaches the queue is one Adrian can rule on
 * without opening the DOCX it came from.
 */
export function sanitizeProposal(input: unknown): { row: ProposalRow } | { error: string } {
  const b = (input ?? {}) as Record<string, unknown>;

  const level = text(b.level, 40);
  if (!level) return { error: 'level is required' };

  const question_text = text(b.questionText ?? b.question_text);
  if (!question_text) return { error: 'questionText is required' };
  if (question_text.length < MIN_QUESTION_CHARS) {
    return { error: `questionText is too short to vet (under ${MIN_QUESTION_CHARS} characters)` };
  }

  // The search that came up empty is the justification for authoring at all.
  const search_query = text(b.searchQuery ?? b.search_query, 500);
  if (!search_query) {
    return { error: 'searchQuery is required — record the bank search that found nothing, or use the bank question it found' };
  }

  const topicsIn = Array.isArray(b.topics) ? b.topics : [];
  const topics = topicsIn
    .map(t => (typeof t === 'string' ? t.trim() : '')).filter(Boolean).slice(0, MAX_TOPICS);

  const marksNum = Number(b.marks);
  const marks = Number.isInteger(marksNum) && marksNum > 0 && marksNum <= 30 ? marksNum : null;

  return {
    row: {
      sheet_job_id: uuid(b.sheetJobId ?? b.sheet_job_id),
      run_id: uuid(b.runId ?? b.run_id),
      student_name: text(b.studentName ?? b.student_name, 120),
      paper_name: text(b.paperName ?? b.paper_name, 200),
      level,
      topics,
      question_text,
      answer: text(b.answer, 2000),
      solution: text(b.solution),
      marks,
      skill: text(b.skill, 300),
      search_query,
      // Kept whole: the hits it rejected are the evidence that the search ran and
      // what it turned up. Capped so one runaway response cannot bloat the table.
      search_hits: (() => {
        const hits = b.searchHits ?? b.search_hits;
        return Array.isArray(hits) ? hits.slice(0, 20) : null;
      })(),
    },
  };
}
