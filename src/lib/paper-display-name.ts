// The paper's name the way a student knows it (Adrian, 7 Sep 2026: "show the
// paper's name the way the student knows it — 'A Math 2022 Paper 1'"), from the
// internal name Adrian typed at marking time ("tze hin em tys 2022 p2",
// "kassandra am practice set 3 p1", "Emath O2022"). Pure, tested. Never throws;
// falls back to the raw name, tidied.
const LEVELS: Array<[RegExp, string]> = [
  [/\b(am|amath|a ?math|additional math(ematics)?)\b/i, 'A Math'],
  [/\b(em|emath|e ?math|elementary math(ematics)?)\b/i, 'E Math'],
  [/\bh2\b/i, 'H2 Math'],
  [/\bh1\b/i, 'H1 Math'],
];
const EXAMS: Array<[RegExp, string]> = [
  [/\b(tys|gce|o ?level|a ?level)\b/i, 'GCE'],
  [/\bprelims?\b/i, 'Prelim'],
  [/\bpromo(tional)?\b/i, 'Promo'],
  [/\b(eoy|end[- ]of[- ]year|sa2)\b/i, 'End-of-Year'],
  [/\b(mye|mid[- ]year|sa1)\b/i, 'Mid-Year'],
  [/\b(wa[12]|ca[12])\b/i, 'Class Test'],
  [/\bpractice set\b/i, 'Practice Set'],
  [/\btest set\b/i, 'Test Set'],
  [/\bmock\b/i, 'Mock'],
];

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// School codes stay upper-case ("SJC Prelim", not "Sjc Prelim"). A token with no
// vowel is a code (sjc, vjc, dhs, nygh, tkss); the ones with vowels are listed.
// Everything else is a word and title-cases (St Theresa, Nan Hua, Hwa Chong).
const CODES_WITH_VOWELS = new Set(['acs', 'acsi', 'acsb', 'ri', 'rgs', 'hci', 'ajc', 'sajc', 'ejc', 'asrjc', 'nush', 'chij', 'sota', 'nus', 'ntu', 'ip', 'sap']);
// vowel-less abbreviations that are words, not codes ("St Theresa", "Mt Sinai")
const SHORT_WORDS = new Set(['st', 'mt', 'dr']);
function schoolCase(s: string): string {
  return s.split(' ').map((t) => {
    const low = t.toLowerCase();
    const isCode = /^[a-z]{2,5}$/.test(low) && !SHORT_WORDS.has(low) && (!/[aeiou]/.test(low) || CODES_WITH_VOWELS.has(low));
    return isCode ? low.toUpperCase() : titleCase(low);
  }).join(' ');
}

/**
 * @param raw        the run's paper_name
 * @param studentName the student's display name — its words are dropped from the raw name
 */
export function displayPaperName(raw: string | null | undefined, studentName?: string | null): string {
  const src = String(raw || '').replace(/\.(pdf|jpe?g|png|heic)$/i, '').replace(/[_]+/g, ' ').trim();
  if (!src) return 'Marked paper';
  const drop = new Set(String(studentName || '').toLowerCase().split(/\s+/).filter(t => t.length >= 2));
  // A handed-in Practice Again sheet is named after its paper ("Practice Again —
  // AM TYS 2022 P1"); it must not display as the paper itself, or the student
  // sees two rows with one name. The prefix is kept and the rest reads as usual.
  const isPracticeAgain = /\bpractice again\b/i.test(src);
  const body = src.replace(/\bpractice again\b/gi, ' ');
  // separate "O2022" / "P1"-style glue so the tokens read
  const spaced = body.replace(/\b([oa])(20\d\d)\b/gi, '$1 level $2').replace(/\b(p|paper)\s*([1-4])\b/gi, 'paper $2');
  // punctuation-only tokens ("—", "-") never name a school
  const tokens = spaced.split(/\s+/).filter(t => t && /[a-z0-9]/i.test(t) && !drop.has(t.toLowerCase()));
  const text = tokens.join(' ');
  const level = LEVELS.find(([re]) => re.test(text))?.[1] ?? null;
  const year = (text.match(/\b(20\d\d)\b/) || [])[1] ?? null;
  const paper = (text.match(/\bpaper\s*([1-4])\b/i) || [])[1] ?? null;
  const exam = EXAMS.find(([re]) => re.test(text))?.[1] ?? null;
  const setNo = (text.match(/\b(?:practice|test) set\s*(\d+)\b/i) || [])[1] ?? null;
  if (!level && !year && !paper) return titleCase(src);
  // what is left after the known tokens is the school (or nothing)
  const leftover = text
    .replace(/\b(am|amath|a ?math|additional math(ematics)?|em|emath|e ?math|elementary math(ematics)?|h[12]|math|maths|mathematics)\b/gi, ' ')
    .replace(/\b(tys|gce|o ?level|a ?level|level|prelims?|promo(tional)?|eoy|end[- ]of[- ]year|mye|mid[- ]year|sa[12]|wa[12]|ca[12]|practice set|test set|mock|sec(ondary)?|s[1-4]|paper|set)\b/gi, ' ')
    .replace(/\b20\d\d\b|\b[1-4]\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const school = leftover ? schoolCase(leftover) : null;
  const parts: string[] = [];
  if (level) parts.push(level);
  if (exam === 'GCE') parts.push(year ? `GCE ${year}` : 'GCE');
  else if (exam && (setNo || year || school)) parts.push([school, exam, setNo ?? year].filter(Boolean).join(' '));
  else if (school || year) parts.push([school, year].filter(Boolean).join(' '));
  if (paper) parts.push(`Paper ${paper}`);
  const name = parts.join(' · ');
  return isPracticeAgain ? `Practice Again · ${name}` : name;
}

/**
 * One name for a Practice Again hand-in (Adrian, 8 Sep 2026: "why are Practice
 * Again named differently for different students?"). The sheet's title was
 * worded three ways across a week of releases — "from your A Math 2021 Paper 1",
 * "A Math 2021 Paper 1", "AM TYS 2022 P1" — and the hand-in copied whichever it
 * got. Given the SOURCE paper's own name when the assignment is known, else the
 * title's tail, the result is always "Practice Again — <display name>".
 * Anything that is not a Practice Again name comes back untouched.
 */
export function practiceAgainHandinName(sent: string | null | undefined, sourcePaperName?: string | null, studentName?: string | null): string {
  const raw = String(sent ?? '').trim();
  const m = raw.match(/^practice\s+again\s*(?:[—–-]\s*)?(.*)$/i);
  if (!m && !sourcePaperName) return raw;
  const src = String(sourcePaperName ?? '').trim();
  let tail = src || (m ? m[1] : '');
  tail = tail.replace(/^(?:from\s+your|learn\s+from|from)\s+/i, '').replace(/\s+paper\s*$/i, '').replace(/^your\s+/i, '').trim();
  const shown = tail ? displayPaperName(tail, studentName) : '';
  return shown ? `Practice Again — ${shown}` : 'Practice Again';
}
