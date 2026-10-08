// English listening practice on our OWN recordings (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026):
// Paper 3 of syllabus 1184 — Section A (22 marks, each recording heard twice: multiple choice,
// matching, a graphic organiser) and Section B (8 marks, heard once: note-taking).
//
// A set is one JSON file in data/english/listening/; scripts/english-own/build-speaking.ts checks
// every set with listeningProblems() and merges them into data/english/speaking-sets.json.
// Pure: shapes, the checks, the public view (no script, no key) and the marking — by the key,
// no model. Closed: ENGLISH_LISTENING_OPEN_TO_STUDENTS.

export type Speaker = 'narrator' | 'a' | 'b';
export type SpeakerVoice = 'girl' | 'woman' | 'boy' | 'man';
export interface ListeningLine { who: Speaker; text: string }
export type ListeningQuestion =
  | { n: string; type: 'choice'; heading?: string; text: string; options: { label: string; text: string }[]; answer: string; why: string }
  | { n: string; type: 'match'; heading?: string; text: string; answer: string; why: string }
  | { n: string; type: 'fill'; heading?: string; text: string; after?: string; accept: string[]; why: string };

export interface ListeningSet {
  id: string;                    // "ls01"
  kind: 'listening';
  section: 'A' | 'B';
  title: string;
  textType: 'recount' | 'conversation' | 'explanation' | 'information';
  /** Read aloud before the recording and shown on the page: who is speaking and what to do. */
  intro: string;
  /** The names shown beside "What was said" (speaker a / b). */
  names?: { a?: string; b?: string };
  /** Who each speaker sounds like — picks the voice (scripts/english-own/speaking-audio.mjs). */
  voices?: { a?: SpeakerVoice; b?: SpeakerVoice };
  script: ListeningLine[];
  /** The shared list a `match` question picks a letter from. */
  bank?: { label: string; text: string }[];
  questions: ListeningQuestion[];
}

/** Every question is one mark, as in the paper. */
export const listeningMarks = (s: Pick<ListeningSet, 'questions'>): number => s.questions.length;
/** Section A is heard twice, Section B once (syllabus 1184, Paper 3). */
export const playsAllowed = (s: Pick<ListeningSet, 'section'>): number => (s.section === 'A' ? 2 : 1);
export const SECTION_MARKS = { A: 22, B: 8 } as const;

const words = (s: string): string[] => s.trim().match(/\S+/g) ?? [];
export const scriptWords = (s: Pick<ListeningSet, 'script'>): number => s.script.reduce((n, l) => n + words(l.text).length, 0);

// ── The checks: a set with any problem is not built into the app ────────────
export function listeningProblems(s: ListeningSet): string[] {
  const out: string[] = [];
  if (!/^ls\d{2}$/.test(s.id ?? '')) out.push('id like "ls01"');
  if (s.section !== 'A' && s.section !== 'B') out.push('section is A or B');
  if (!s.title || s.title.length < 3 || s.title.length > 60) out.push('title: 3–60 characters');
  if (!s.intro || s.intro.length < 20) out.push('an intro to read aloud');
  if (!Array.isArray(s.script) || s.script.length === 0) return [...out, 'no script'];
  const n = scriptWords(s);
  if (n < 180 || n > 480) out.push(`the script is ${n} words (180–480)`);
  for (const [i, l] of s.script.entries()) {
    if (!['narrator', 'a', 'b'].includes(l.who)) out.push(`line ${i + 1}: who is narrator, a or b`);
    if (!l.text?.trim()) out.push(`line ${i + 1}: empty`);
    if (/[$\\]|\*\*/.test(l.text ?? '')) out.push(`line ${i + 1}: plain spoken words only`);
  }
  if (s.script.some(l => l.who === 'b') && !(s.names?.a && s.names?.b)) out.push('a conversation names both speakers');
  for (const who of ['a', 'b'] as const) {
    if (s.script.some(l => l.who === who) && !['girl', 'woman', 'boy', 'man'].includes(s.voices?.[who] ?? '')) out.push(`speaker ${who}: voices.${who} is girl, woman, boy or man`);
  }
  const qs = s.questions ?? [];
  if (qs.length < 5 || qs.length > 10) out.push(`${qs.length} questions (5–10)`);
  if (s.section === 'B' && (qs.length !== SECTION_MARKS.B || qs.some(q => q.type !== 'fill'))) out.push('Section B is 8 notes to fill in');
  const said = norm(s.script.map(l => l.text).join(' '));
  const seen = new Set<string>();
  for (const q of qs) {
    const at = `Q${q.n}`;
    if (!/^\d{1,2}$/.test(q.n ?? '') || seen.has(q.n)) out.push(`${at}: a number of its own`);
    seen.add(q.n);
    if (!q.text || q.text.length < 3) out.push(`${at}: no question`);
    if (!q.why || q.why.length < 10) out.push(`${at}: say where the answer was heard`);
    if (q.type === 'choice') {
      const labels = (q.options ?? []).map(o => o.label);
      if (labels.length < 3 || labels.length > 4 || new Set(labels).size !== labels.length) out.push(`${at}: three or four options, each its own letter`);
      if (!labels.includes(q.answer)) out.push(`${at}: the answer is one of the letters`);
    } else if (q.type === 'match') {
      const labels = (s.bank ?? []).map(o => o.label);
      if (labels.length < 4) out.push(`${at}: a matching question needs the set's list of at least four`);
      if (!labels.includes(q.answer)) out.push(`${at}: the answer is one of the list's letters`);
    } else if (q.type === 'fill') {
      const acc = (q.accept ?? []).map(a => a.trim()).filter(Boolean);
      if (acc.length === 0) out.push(`${at}: no answer listed`);
      if (acc.some(a => words(a).length > 4)) out.push(`${at}: an answer is at most four words`);
      // the first listed answer is the one shown, and it must really be in the recording
      if (acc[0] && !said.includes(norm(acc[0]))) out.push(`${at}: "${acc[0]}" is not said in the recording`);
    } else out.push(`${at}: type is choice, match or fill`);
  }
  const matchAnswers = qs.filter(q => q.type === 'match').map(q => q.answer);
  if (new Set(matchAnswers).size !== matchAnswers.length) out.push('each letter of the list is the answer to at most one matching question');
  return out;
}

// ── What the page gets before the check: no script, no key, no "why" ────────
export type PublicListeningQuestion =
  | { n: string; type: 'choice'; heading?: string; text: string; options: { label: string; text: string }[] }
  | { n: string; type: 'match'; heading?: string; text: string }
  | { n: string; type: 'fill'; heading?: string; text: string; after?: string };
export interface PublicListening {
  id: string; section: 'A' | 'B'; title: string; intro: string; plays: number; marks: number;
  bank: { label: string; text: string }[] | null; questions: PublicListeningQuestion[];
}

export function publicListening(s: ListeningSet): PublicListening {
  return {
    id: s.id, section: s.section, title: s.title, intro: s.intro, plays: playsAllowed(s), marks: listeningMarks(s),
    bank: s.bank?.length ? s.bank.map(o => ({ label: o.label, text: o.text })) : null,
    questions: s.questions.map((q): PublicListeningQuestion =>
      q.type === 'choice' ? { n: q.n, type: 'choice', heading: q.heading, text: q.text, options: q.options.map(o => ({ label: o.label, text: o.text })) }
      : q.type === 'match' ? { n: q.n, type: 'match', heading: q.heading, text: q.text }
      : { n: q.n, type: 'fill', heading: q.heading, text: q.text, after: q.after }),
  };
}

// ── Marking, by the key ─────────────────────────────────────────────────────
/** Tidy an answer for comparing: case, punctuation, spaces, a leading a / an / the. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[‘’“”"'`.,;:!?()]/g, '').replace(/[-–—/]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(a|an|the)\s+/, '');
}

/** One letter added, dropped, swapped for another, or two neighbours the wrong way round. */
export function oneSlipApart(a: string, b: string): boolean {
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** 'right' · 'spelling' (a long word one letter out — given the mark, shown the spelling) · 'wrong'. */
export function fillVerdict(answer: string, accept: string[]): 'right' | 'spelling' | 'wrong' {
  const a = norm(answer);
  if (!a) return 'wrong';
  const targets = accept.map(norm).filter(Boolean);
  if (targets.includes(a)) return 'right';
  // never forgive a number, and never a short word (night / eight)
  if (/\d/.test(a)) return 'wrong';
  return targets.some(t => t.length >= 6 && !/\d/.test(t) && oneSlipApart(a, t)) ? 'spelling' : 'wrong';
}

export interface ListeningResult { n: string; ok: boolean; yours: string; correct: string; spelling: boolean; why: string }
export interface ListeningChecked { results: ListeningResult[]; right: number; total: number }

export function checkListening(s: ListeningSet, answers: Record<string, unknown>): ListeningChecked {
  const letter = (labels: { label: string; text: string }[], l: string): string => {
    const o = labels.find(x => x.label === l);
    return o ? `${o.label} — ${o.text}` : l;
  };
  const results = s.questions.map((q): ListeningResult => {
    const raw = answers[q.n];
    const yours = (typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '').trim().slice(0, 80);
    if (q.type === 'fill') {
      const v = fillVerdict(yours, q.accept);
      return { n: q.n, ok: v !== 'wrong', yours, correct: q.accept[0], spelling: v === 'spelling', why: q.why };
    }
    const labels = q.type === 'choice' ? q.options : (s.bank ?? []);
    return { n: q.n, ok: yours !== '' && yours.toUpperCase() === q.answer.toUpperCase(), yours: yours ? letter(labels, yours.toUpperCase()) : '', correct: letter(labels, q.answer), spelling: false, why: q.why };
  });
  return { results, right: results.filter(r => r.ok).length, total: results.length };
}

/** The script as shown AFTER the check, with the speakers' names. */
export function scriptShown(s: ListeningSet): { who: string | null; text: string }[] {
  return s.script.map(l => ({ who: l.who === 'narrator' ? null : (s.names?.[l.who] ?? (l.who === 'a' ? 'Speaker 1' : 'Speaker 2')), text: l.text }));
}

/** The list line: "Section A · heard twice · 6 marks". */
export function listeningLine(s: Pick<ListeningSet, 'section' | 'questions'>): string {
  const m = listeningMarks(s);
  return `Section ${s.section} · heard ${playsAllowed(s) === 2 ? 'twice' : 'once'} · ${m} mark${m === 1 ? '' : 's'}`;
}
