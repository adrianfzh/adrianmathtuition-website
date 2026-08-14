// Pure half of /api/admin/prep — the per-student lesson-prep card.
//
// Everything here is selection/matching logic with no I/O, per the repo testing
// policy. The route owns the Airtable/Supabase fetches and hands rows in.
//
// The weak-topic thresholds the route applies (min 4 marks behind a topic,
// <75% = weak, top 3) deliberately mirror `report-facts.ts` and
// `portal-marking.ts` — Adrian, the parent report and the student portal must
// never disagree about what a student's focus topics are.

/** Airtable `Subjects` values → which question-bank `level` strings to search. */
export function deriveBankLevels(level: string, subjects: string[]): string[] {
  const subj = new Set(subjects.map(s => s.trim()));
  const am = subj.has('A Math') || subj.has('IP Math');
  const em = subj.has('E Math') || subj.has('Math') || subj.has('IP Math');
  const out: string[] = [];
  switch (level) {
    case 'Sec 1': out.push('S1'); break;
    case 'Sec 2': out.push('S2'); break;
    case 'Sec 3':
      // S3 banks first, topped up from the S4 pool — same order the
      // revision-worksheet skill uses.
      if (am) out.push('S3_AM', 'AM');
      if (em) out.push('S3_EM', 'EM');
      break;
    case 'Sec 4':
    case 'Sec 5':
      if (am) out.push('AM');
      if (em) out.push('EM');
      break;
    case 'JC1':
    case 'JC2':
      out.push('JC');
      break;
  }
  return [...new Set(out)];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Map a marker-detected topic name onto the bank's own vocabulary.
 *
 * The marker writes `topic_detected` free-ish ("Trigonometry"), the bank tags
 * rows with its canonical list ("Trigonometric Functions") — an exact
 * `contains` query misses those near-names. Order of preference: exact
 * normalised match, then containment either way, then a shared long word
 * prefix (≥8 chars, so "trigonometr…" links the pair above but "quadratic"
 * alone never bridges Functions ↔ Inequalities). Ties go to the closest
 * length. Returns null when nothing plausible matches — an empty suggestion
 * beats a wrong-topic one.
 */
export function matchBankTopic(detected: string, bankTopics: string[]): string | null {
  const d = norm(detected);
  if (d.length < 3) return null;

  let best: { topic: string; score: number; lenDiff: number } | null = null;
  const consider = (topic: string, score: number) => {
    const lenDiff = Math.abs(norm(topic).length - d.length);
    if (!best || score > best.score || (score === best.score && lenDiff < best.lenDiff)) {
      best = { topic, score, lenDiff };
    }
  };

  for (const t of bankTopics) {
    const b = norm(t);
    if (!b) continue;
    if (b === d) return t;
    if ((d.length >= 4 && b.includes(d)) || (b.length >= 4 && d.includes(b))) {
      consider(t, 500);
      continue;
    }
    let prefix = 0;
    for (const dw of d.split(' ')) {
      for (const bw of b.split(' ')) {
        let k = 0;
        while (k < dw.length && k < bw.length && dw[k] === bw[k]) k++;
        if (k >= 8) prefix = Math.max(prefix, k);
      }
    }
    if (prefix) consider(t, 100 + prefix);
  }
  return best ? (best as { topic: string }).topic : null;
}

/** The columns the suggestion picker reads off a `questions` row. */
export interface BankQuestionRow {
  id: string;
  school: string | null;
  year: number | string | null;
  paper: string | null;
  question_number: string | number | null;
  question_text: string | null;
  total_marks: number | null;
  answer: string | null;
  parts: unknown;
  difficulty: string | null;
}

function partsAnswered(parts: unknown): boolean {
  if (!Array.isArray(parts) || parts.length === 0) return false;
  return parts.every(p => {
    const a = (p as { answer?: unknown })?.answer;
    return typeof a === 'string' && a.trim() !== '';
  });
}

/** "(i) 12 · (ii) x=3" — the per-part answers, when the row has no top-level one. */
export function partsAnswerSummary(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map(p => {
      const r = p as { label?: unknown; answer?: unknown };
      const a = typeof r?.answer === 'string' ? r.answer.trim() : '';
      if (!a) return '';
      const label = typeof r?.label === 'string' && r.label.trim() ? `(${r.label.trim().replace(/^\(|\)$/g, '')}) ` : '';
      return `${label}${a}`;
    })
    .filter(Boolean)
    .join(' · ');
}

const FIGURE_RE = /\b(figure|diagram|graph (below|shown)|table below|shown (below|in the))\b/i;

/**
 * Pick n suggestion-worthy questions: answerable (a final answer to check
 * against), self-contained on a screen (no figure talk — the card has no
 * images), recent years first, and no two from the same school until every
 * school has had a turn.
 */
export function pickSuggestedQuestions(rows: BankQuestionRow[], n: number): BankQuestionRow[] {
  const usable = rows.filter(r => {
    const text = (r.question_text || '').trim();
    if (!text || FIGURE_RE.test(text)) return false;
    const answered = (r.answer || '').trim() !== '' || partsAnswered(r.parts);
    return answered;
  });

  usable.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));

  const picked: BankQuestionRow[] = [];
  const seenSchools = new Set<string>();
  for (const r of usable) {
    if (picked.length >= n) break;
    const school = (r.school || '').trim().toLowerCase();
    if (school && seenSchools.has(school)) continue;
    picked.push(r);
    if (school) seenSchools.add(school);
  }
  for (const r of usable) {
    if (picked.length >= n) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked;
}

const TIME_ORDER = ['9-11am', '11am-1pm', '1-3pm', '3-5pm', '5-7pm', '7-9pm'];

/** Sort key for Slots `Time` values; unknown strings sink to the end. */
export function slotTimeSortKey(time: string): number {
  const i = TIME_ORDER.indexOf(time);
  return i === -1 ? TIME_ORDER.length : i;
}

/** `Topics Covered` is a JSON array in a long-text field; free text rides along. */
export function parseTopicsCovered(raw: unknown, freeText?: unknown): string[] {
  const out: string[] = [];
  const s = (raw ?? '').toString().trim();
  if (s) {
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j)) out.push(...j.map(String));
      else out.push(s);
    } catch {
      out.push(s);
    }
  }
  const free = (freeText ?? '').toString().trim();
  if (free) out.push(free);
  return out.filter(Boolean);
}
