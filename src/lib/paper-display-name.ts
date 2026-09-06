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

/**
 * @param raw        the run's paper_name
 * @param studentName the student's display name — its words are dropped from the raw name
 */
export function displayPaperName(raw: string | null | undefined, studentName?: string | null): string {
  const src = String(raw || '').replace(/\.(pdf|jpe?g|png|heic)$/i, '').replace(/[_]+/g, ' ').trim();
  if (!src) return 'Marked paper';
  const drop = new Set(String(studentName || '').toLowerCase().split(/\s+/).filter(t => t.length >= 2));
  // separate "O2022" / "P1"-style glue so the tokens read
  const spaced = src.replace(/\b([oa])(20\d\d)\b/gi, '$1 level $2').replace(/\b(p|paper)\s*([1-4])\b/gi, 'paper $2');
  const tokens = spaced.split(/\s+/).filter(t => t && !drop.has(t.toLowerCase()));
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
  const school = leftover ? titleCase(leftover) : null;
  const parts: string[] = [];
  if (level) parts.push(level);
  if (exam === 'GCE') parts.push(year ? `GCE ${year}` : 'GCE');
  else if (exam && (setNo || year || school)) parts.push([school, exam, setNo ?? year].filter(Boolean).join(' '));
  else if (school || year) parts.push([school, year].filter(Boolean).join(' '));
  if (paper) parts.push(`Paper ${paper}`);
  return parts.join(' · ');
}
