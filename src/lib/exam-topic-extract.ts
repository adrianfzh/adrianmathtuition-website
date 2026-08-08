// Pure helpers for the exam-topics photo extraction
// (/api/admin-schedule/extract-exam-topics — the exam dialog's "📷 From photo"
// button). The model reads a student's photo (school "topics tested" list,
// exam timetable, teacher's message) and must answer ONLY with topics from
// the tutor's canonical checklist — these helpers build that checklist and
// gate the model's answer against it (models author, deterministic gates
// verify).

import { getExamTopicsForSubject } from './canonical-topics';

export interface ExtractedExamInfo {
  /** Canonical topic names, exactly as the exam dialog's picker shows them. */
  topics: string[];
  /** YYYY-MM-DD when the photo clearly showed the exam date, else null. */
  examDate: string | null;
  /** One short caveat line (e.g. "Integration up to 10.1.6 only"), else null. */
  note: string | null;
}

/**
 * The flat, deduped topic list the exam dialog's picker offers for
 * (level, subject) — cascading lists (EM → S2 → S1) collapse to unique names
 * in first-seen order, mirroring the picker's own dedup.
 */
export function flattenExamTopics(level: string, subject: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cat of getExamTopicsForSubject(level || 'Sec 4', subject || '')) {
    for (const t of cat.topics) {
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

/**
 * Parse the model's reply and keep only topics that exist in `canonical`
 * (case-insensitive; returns canonical casing, deduped). Tolerates markdown
 * fences and prose around the JSON object. Throws when no JSON object can be
 * parsed at all.
 */
export function parseExtractionResponse(raw: string, canonical: string[]): ExtractedExamInfo {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model reply');
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    topics?: unknown;
    examDate?: unknown;
    note?: unknown;
  };

  const byLower = new Map(canonical.map(t => [t.toLowerCase(), t]));
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(parsed.topics) ? parsed.topics : []) {
    const hit = typeof t === 'string' ? byLower.get(t.trim().toLowerCase()) : undefined;
    if (hit && !seen.has(hit)) {
      seen.add(hit);
      topics.push(hit);
    }
  }

  const examDate =
    typeof parsed.examDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.examDate)
      ? parsed.examDate
      : null;
  const note =
    typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.trim().slice(0, 200) : null;

  return { topics, examDate, note };
}
