// Whole listening papers, made AHEAD and checked, at three levels (Adrian, 14 Oct 2026: "yes" —
// more English listening papers, handed out by a "New paper" button). SPEC-ENGLISH-ORAL-LISTENING.md
// §More papers.
//
// A paper is the exam's Paper 3 (syllabus 1184): three Section A recordings (22 marks, heard twice)
// and one Section B talk (8 marks, heard once, notes to fill in). The exam format is the same at
// every level; what changes is the voice and how the answer is said:
//   • Easier   — slower speech, every answer said plainly, nothing to catch anyone out;
//   • Standard — like the exam: a wrong detail may be mentioned once;
//   • Harder   — normal speed, speakers change their minds, so the final answer must be caught.
//
// A paper is never written at the button press. It is written in a batch (a session, or the Fly
// worker overnight on the plan), passes every check here plus a blind reader who answers from the
// script's words alone and must match the key, gets its recordings, and only then is served.
// Pure: shapes, checks, the Singapore-word check, the copy check, choosing the next paper.
import { checkListening, listeningMarks, listeningProblems, norm, SECTION_MARKS, type ListeningSet } from './english-listening';
import { SG_SAY } from './sg-say.mjs';

export type ListeningLevel = 'easier' | 'standard' | 'harder';
export const LISTENING_LEVELS: { level: ListeningLevel; name: string; sub: string }[] = [
  { level: 'easier', name: 'Easier', sub: 'Slower, and every answer is said plainly' },
  { level: 'standard', name: 'Standard', sub: 'Like the exam' },
  { level: 'harder', name: 'Harder', sub: 'Faster, and people change their minds' },
];
export const isListeningLevel = (x: unknown): x is ListeningLevel => x === 'easier' || x === 'standard' || x === 'harder';

/** How the voice reads a level: speed (1 = MiniMax's normal), and the pause after each line, in seconds. */
export const LEVEL_VOICE: Record<ListeningLevel, { speed: number; gapTalk: number; gapSpeech: number }> = {
  easier: { speed: 0.85, gapTalk: 0.8, gapSpeech: 1.1 },
  standard: { speed: 0.95, gapTalk: 0.5, gapSpeech: 0.8 },
  harder: { speed: 1.05, gapTalk: 0.3, gapSpeech: 0.6 },
};

export interface ListeningPaper {
  id: string;                 // "lp001"
  level: ListeningLevel;
  /** Four parts: Section A ×3 (ids lp001-1 … lp001-3), then Section B (lp001-4). */
  parts: ListeningSet[];
}

export const partId = (paperId: string, i: number): string => `${paperId}-${i + 1}`;
export const paperOfPart = (id: string): string | null => (/^(lp\d{3})-[1-4]$/.exec(id)?.[1] ?? null);
const said = (s: ListeningSet): string => s.script.map(l => l.text).join(' ');
const traps = (s: ListeningSet): number => s.questions.filter(q => q.trap).length;

// ── The paper's checks: a paper with any problem is never served ────────────
export function paperProblems(p: ListeningPaper, opts: { dict?: Set<string> } = {}): string[] {
  const out: string[] = [];
  if (!/^lp\d{3}$/.test(p.id ?? '')) out.push('id like "lp001"');
  if (!isListeningLevel(p.level)) out.push('level is easier, standard or harder');
  const parts = Array.isArray(p.parts) ? p.parts : [];
  if (parts.length !== 4) return [...out, 'four parts: three in Section A, one in Section B'];
  parts.forEach((s, i) => {
    const at = `part ${i + 1}`;
    if (s.id !== partId(p.id, i)) out.push(`${at}: id is ${partId(p.id, i)}`);
    if (s.section !== (i < 3 ? 'A' : 'B')) out.push(`${at}: Section ${i < 3 ? 'A' : 'B'}`);
    for (const x of listeningProblems(s)) out.push(`${at}: ${x}`);
    const t = traps(s);
    if (p.level === 'easier' && t > 0) out.push(`${at}: Easier says every answer plainly — no wrong detail to catch (${t} trap${t === 1 ? '' : 's'})`);
    if (p.level === 'standard' && t > 2) out.push(`${at}: Standard has at most two traps a part (${t})`);
    if (p.level === 'harder' && t < 1) out.push(`${at}: Harder has a speaker change their mind at least once a part`);
  });
  const marks = (sec: 'A' | 'B') => parts.filter(s => s.section === sec).reduce((n, s) => n + listeningMarks(s), 0);
  if (marks('A') !== SECTION_MARKS.A) out.push(`Section A is ${marks('A')} marks (${SECTION_MARKS.A})`);
  if (marks('B') !== SECTION_MARKS.B) out.push(`Section B is ${marks('B')} marks (${SECTION_MARKS.B})`);
  if (!parts.slice(0, 3).some(s => s.textType === 'conversation')) out.push('Section A has a conversation');
  if (p.level === 'harder' && parts.reduce((n, s) => n + traps(s), 0) < 6) out.push('Harder has at least six traps in the paper');
  const words = sgUnlisted(parts.map(s => [s.intro, said(s)].join(' ')).join(' \n '), opts.dict);
  if (words.length) out.push(`Singapore words the voice has not been taught (src/lib/sg-say.mjs, or use another name): ${words.join(', ')}`);
  return out;
}

// ── Singapore words: every local name the voice reads must be in the list ───
// The voice reads a local name as an English word ("Tampines" → "tam-pines") unless
// src/lib/sg-say.mjs says how it sounds. A paper may use only local names in that list, and
// people's names the voice already says right (PLAIN_NAMES). Anything else is flagged, so a writer
// picks a listed name or Adrian listens and adds it (speaking-audio.mjs --check-sg).
export const PLAIN_NAMES = [
  // people: names the voice says right as they are
  'Priya', 'Aisha', 'Nadia', 'Farah', 'Ravi', 'Arjun', 'Daniel', 'Sarah', 'Rachel', 'Ethan', 'Ryan', 'Marcus', 'Grace',
  'Joshua', 'Chloe', 'Isaac', 'Amir', 'Zara', 'Hannah', 'Jasmine', 'Kevin', 'Melissa', 'Nathan', 'Samuel', 'Natalie',
  'Rahman', 'Tan', 'Lim', 'Lee', 'Wong', 'Ong', 'Koh', 'Goh', 'Teo', 'Chan', 'Kumar', 'Singh',
  // titles, peoples, languages, the country
  'Mr', 'Mrs', 'Ms', 'Mdm', 'Dr', 'Singapore', 'Singaporean', 'Singaporeans', 'Malay', 'Chinese', 'Indian', 'Tamil', 'English', 'Mandarin', 'Malaysia', 'Asia', 'Asian',
  // English words that name places here and are read as English
  'Orchard', 'Road', 'Street', 'Avenue', 'Park', 'Bay', 'Marina', 'East', 'West', 'North', 'South', 'Coast', 'Central', 'Botanic', 'Gardens', 'Garden',
  'Chinatown', 'Little', 'India', 'Hill', 'Reservoir', 'River', 'Island', 'Zoo', 'Museum', 'National', 'Library', 'Community', 'Club', 'Centre',
  'Sports', 'Hall', 'School', 'Secondary', 'Primary', 'Junior', 'College', 'Polytechnic', 'Hospital', 'Stadium', 'Science', 'Art', 'Arts', 'Gallery',
  // the calendar
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Secondary', 'Section', 'Paper', 'Questions', 'Question', 'Christmas', 'Hari', 'Raya', 'Deepavali', 'New', 'Year', 'Lunar',
];
/** Local everyday words written in small letters that the voice needs taught. A listed one is fine. */
export const LOCAL_WORDS = ['lah', 'leh', 'lor', 'meh', 'kopi', 'teh', 'makan', 'nasi', 'lemak', 'roti', 'prata', 'mee', 'goreng', 'kway', 'teow', 'laksa', 'satay', 'rojak', 'chendol', 'kaya', 'kiasu', 'shiok', 'paiseh', 'sian', 'chope', 'ang', 'pow', 'hongbao', 'tingkat', 'kampong', 'kampung', 'bak', 'kut', 'char', 'siew', 'popiah', 'otah', 'putu', 'piring', 'ondeh', 'kueh', 'kuih', 'briyani', 'biryani', 'murtabak', 'thosai', 'dosa', 'mamak', 'wah', 'alamak', 'aiyoh', 'aiyah'];
// laksa is said right by the voice (sg-say.mjs header), so it is fine though not listed there.
const SAID_RIGHT_LOCAL = new Set(['laksa']);

/** Words that may start a sentence in a script (so their capital is not a name). The machine's word list widens it. */
const STARTERS = new Set(`a about above after again ah all also although always an and another any anyone anything are as at be because before besides both but by can come could did do does don't down during each either even every everyone everything excuse finally first for from good great have he hello her here hi his how however i if in is it it's its just last let let's like look maybe me most my next no none not now of oh ok okay on once one only or other our out please right second see she should so some someone something sometimes sorry sure take than thank thanks that that's the their then there there's these they third this those though to today together tomorrow two um unless until up we well we'll we're what what's when where whether which while who why will with without would yes yesterday yet you you'll you're your actually anyway apart around back best better bring call check do don't each early either enough finally first five four great half hold just keep later many maybe more much never nine no oh only perhaps quick really remember right seven six so start still stop ten that three try twelve twenty two very wait wow yeah teenagers students parents people everybody nobody children kids teachers adults visitors anybody somebody`.split(/\s+/));

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SG_KEYS = Object.keys(SG_SAY as Record<string, string>).sort((a, b) => b.length - a.length);
const SG_RE = new RegExp(`\\b(${SG_KEYS.map(esc).join('|')})\\b`, 'gi');
const PLAIN = new Set(PLAIN_NAMES.map(w => w.toLowerCase()));
const LOCAL = new Set(LOCAL_WORDS);

/**
 * The words in `text` the voice may say wrong: capitalised words (names, places, food) that are not
 * in sg-say.mjs or PLAIN_NAMES, and small-letter local words not in sg-say.mjs. A capitalised word
 * that also appears in small letters, a short acronym (MRT, HDB), and a sentence's first word that
 * is an ordinary English word are fine. `dict` = an English word list (wordList()), when the
 * machine has one; without it only STARTERS clear a sentence's first word.
 */
export function sgUnlisted(text: string, dict?: Set<string>): string[] {
  const clean = String(text).replace(SG_RE, ' ').replace(/[‘’]/g, "'");
  const lower = new Set((clean.match(/\b[a-z][a-z']*\b/g) ?? []));
  const out = new Set<string>();
  // sentence by sentence, so a capital after a full stop is known
  for (const sentence of clean.split(/(?<=[.!?:;"“”])\s+|\n+/)) {
    const toks = sentence.match(/[A-Za-z][A-Za-z']*/g) ?? [];
    toks.forEach((w, i) => {
      const lw = w.toLowerCase().replace(/'(s|re|ve|ll|d|m|t)$/, '').replace(/n$/, m => (w.toLowerCase().endsWith("n't") ? '' : m));   // They're → they, Don't → do
      if (/^[a-z]/.test(w)) {
        if (LOCAL.has(lw) && !SAID_RIGHT_LOCAL.has(lw)) out.add(w);
        return;
      }
      if (w === 'I' || /^I'/.test(w)) return;
      if (/^[A-Z]{2,4}s?$/.test(w)) return;                       // MRT, HDB, CCA
      if (PLAIN.has(lw) || lower.has(lw)) return;
      if (LOCAL.has(lw) && !SAID_RIGHT_LOCAL.has(lw)) { out.add(w); return; }
      if (i === 0 && STARTERS.has(lw)) return;
      if (dict && [lw, lw.replace(/s$/, ''), lw.replace(/es$/, ''), lw.replace(/ed$/, ''), lw.replace(/ing$/, '')].some(x => dict.has(x))) return;   // an ordinary English word (Reservoir, Teenagers)
      out.add(w.replace(/'s$/, ''));
    });
  }
  return [...out].sort();
}

/** An English word list for sgUnlisted: the small-letter entries only (a capitalised entry is a name). */
export function wordList(text: string): Set<string> {
  return new Set(text.split('\n').map(w => w.trim()).filter(w => /^[a-z]+$/.test(w)));
}

// ── The copy check: our own words, and no paper repeats another ─────────────
const toks = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
export function grams(text: string, n: number): string[] {
  const t = toks(text); const out: string[] = [];
  for (let i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n).join(' '));
  return out;
}
/** The paper's spoken words, without the intros (their stock lines repeat by design). */
export const paperScript = (p: ListeningPaper): string => p.parts.map(said).join(' \n ');
/** Runs of 8 words this paper shares with `others` (other papers, the language bank). Must be none. */
export function sharedRuns(p: ListeningPaper, others: string[], n = 8): string[] {
  const seen = new Set<string>();
  for (const o of others) for (const g of grams(o, n)) seen.add(g);
  return [...new Set(grams(paperScript(p), n).filter(g => seen.has(g)))];
}

// ── The blind reader: answers from the script's words alone, must match the key ──
export type BlindAnswers = Record<string, Record<string, string>>;   // part id → question n → answer
export function blindMisses(p: ListeningPaper, blind: BlindAnswers): string[] {
  const misses: string[] = [];
  for (const s of p.parts) {
    const r = checkListening(s, blind[s.id] ?? {});
    for (const x of r.results) if (!x.ok || x.spelling) misses.push(`${s.id} Q${x.n}: blind reader said "${x.yours || '—'}", key "${x.correct}"`);
  }
  return misses;
}

/** The questions as the blind reader is given them: the script and the questions, no key, no reasons, no traps. */
export function blindPrompt(p: ListeningPaper): string {
  const parts = p.parts.map(s => {
    const script = s.script.map(l => `${l.who === 'narrator' ? 'NARRATOR' : (s.names?.[l.who] ?? l.who).toUpperCase()}: ${l.text}`).join('\n');
    const bank = s.bank?.length ? `List for matching:\n${s.bank.map(b => `${b.label}. ${b.text}`).join('\n')}\n` : '';
    const qs = s.questions.map(q => {
      const head = q.heading ? `${q.heading}\n` : '';
      if (q.type === 'choice') return `${head}${q.n}. ${q.text}\n${q.options.map(o => `   ${o.label}. ${o.text}`).join('\n')}`;
      if (q.type === 'match') return `${head}${q.n}. ${q.text}  (answer with one letter from the list)`;
      return `${head}${q.n}. ${q.text} ____ ${q.after ?? ''}  (one to three words or a number, as said)`;
    }).join('\n');
    return `### Part ${s.id}\n${s.intro}\n\nWHAT IS SAID:\n${script}\n\n${bank}QUESTIONS:\n${qs}`;
  }).join('\n\n');
  return `You are checking a listening test. For each part, read ONLY what is said and answer every question from those words alone — no outside knowledge. Where a speaker changes their mind, the final answer counts. For a fill-in, write the words exactly as said (one to three words or a number).

Reply with JSON only, no prose: {"<part id>": {"<question number>": "<answer>"}, ...} — a letter for choice and matching questions.

${parts}`;
}

// ── The writer's brief: what a writer (the worker on the plan, or a session) is given ─────
const LEVEL_BRIEF: Record<ListeningLevel, string> = {
  easier: `EASIER: every answer is said once, plainly, in words close to the question. No speaker changes their mind; nothing is mentioned that could be mistaken for an answer. Shorter sentences, everyday words. Give NO question a "trap". Scripts about 220–300 words a part (the voice is slow).`,
  standard: `STANDARD: like the real exam. Answers are said clearly but not always in the question's words (a paraphrase is fine). A wrong detail may be mentioned in passing for at most two questions a part — give those questions a "trap" (the wrong words, exactly as said). Scripts about 280–380 words a part.`,
  harder: `HARDER: like a demanding exam. In EVERY part, speakers change their minds or correct themselves ("Friday — no, sorry, Thursday"; "I was going to take the bus, but in the end we walked"), so the final answer must be caught. At least two questions a part carry a "trap" (the first thing said, exactly as said), and at least seven in the paper. Answers are often paraphrased. Scripts about 330–420 words a part.`,
};

/** The brief for one new paper at a level. `example` = one finished part to copy the shape from; `avoid` = titles already used. */
export function writerPrompt(level: ListeningLevel, example: ListeningSet, avoid: string[]): string {
  const sg = Object.keys(SG_SAY as Record<string, string>).join(', ');
  const people = PLAIN_NAMES.slice(0, PLAIN_NAMES.indexOf('Mr')).join(', ');
  return `Write ONE new English listening paper for Singapore Secondary 4 students: O-Level English 1184, Paper 3. Every word is our own — invented situations, nothing copied or reworded from any real exam, book or website.

THE PAPER (four parts, in this order):
1. Section A, part 1 — a talk or a recount by one speaker (textType "recount" or "explanation"), 6 questions.
2. Section A, part 2 — a conversation between two speakers (textType "conversation"), 7 questions; one set of questions is MATCHING (a shared list "bank" of 5–6 lettered options, two not used).
3. Section A, part 3 — an explanation or talk (textType "explanation"), 9 questions; include a GRAPHIC ORGANISER (fill-in questions with headings, like a chart or flow of steps).
4. Section B — an informational talk heard ONCE (textType "information"), exactly 8 fill-in note questions (type "fill") with headings.
Section A = 6 + 7 + 9 = 22 marks; Section B = 8 marks. Each question is one mark.

THE LEVEL — ${LEVEL_BRIEF[level]}

RULES FOR EVERY PART
- Settings a Singapore teenager knows: school, CCA, family, the neighbourhood, a community event, a trip, a hobby, health, the environment, a job talk. Suitable for a 15-year-old: no romance, alcohol, violence, brands, real public figures.
- Natural speech: contractions, short turns, the odd "well" or "actually". Never written prose read out.
- Questions follow the order of the recording. Every question has ONE clear answer in the script.
- A student who did NOT hear the recording must not be able to pick the answer by common sense: every option (and every matching letter) is equally likely until you listen — the right answer is not the most sensible, kindest or most typical one. A reader with no script is tried on every paper; more than half right and the paper is thrown away.
- Each speaker's lines are their own: never make a speaker answer or thank themselves for the other's idea.
- A fill-in answer is one to three words or a number, and its FIRST listed answer ("accept"[0]) appears word for word in the script. List other fair forms too (e.g. "ten", "10").
- "why": one line saying where the answer is heard, quoting the script.
- "trap" (only where the level allows): the wrong words exactly as said in the script; never an accepted answer.
- Choice questions have four options A–D. Matching questions take one letter from the part's "bank"; no letter is the answer twice.
- Singapore places, food and local words: ONLY these (the voice knows how to say them): ${sg}. English place words (Road, Park, Reservoir, Community Club, Orchard Road, East Coast) are fine.
- People: first names ONLY from ${people}; teachers as Mr / Mrs / Ms / Mdm with Tan, Lim, Lee, Wong, Ong, Koh, Goh, Teo, Chan, Kumar, Singh.
- "voices": a and b are each "girl", "woman", "boy" or "man"; two speakers in a conversation get different voices. A talk by one person uses speaker "a" (and may open with a line by "narrator").
- intro: one or two sentences read aloud before the recording: who speaks, which questions, and "You will hear the recording twice." (Section A) or "…once only." (Section B).
- No $ signs or symbols in the script — say "twelve dollars".
- Titles must be new. Already used: ${avoid.length ? avoid.join('; ') : 'none'}.

THE SHAPE — reply with ONE JSON object and nothing else:
{"level":"${level}","parts":[ <part 1>, <part 2>, <part 3>, <part 4> ]}
Each part has this shape (an example part, from another paper):
${JSON.stringify({ ...example, id: 'lp000-2' })}
Give the parts ids "lp000-1" … "lp000-4" (the real number is given later); "kind" is "listening"; "section" is "A" for parts 1–3 and "B" for part 4.`;
}

// ── The guesser: a reader with the questions but NO script must not do well ────
/** Choice and matching questions only, without the script: a test that can be passed without listening is no test. */
export function guessPrompt(p: ListeningPaper): string {
  const parts = p.parts.map(s => {
    const qs = s.questions.filter(q => q.type !== 'fill').map(q => q.type === 'choice'
      ? `${q.n}. ${q.text}\n${q.options.map(o => `   ${o.label}. ${o.text}`).join('\n')}`
      : `${q.n}. ${q.text}  (one letter from: ${(s.bank ?? []).map(b => `${b.label}. ${b.text}`).join(' / ')})`).join('\n');
    return qs ? `### Part ${s.id}\n${s.intro}\n${qs}` : '';
  }).filter(Boolean).join('\n\n');
  return `These are questions from a listening test, but you will NOT hear the recording. Make your best guess for every question from common sense alone.
Reply with JSON only: {"<part id>": {"<question number>": "<letter>"}, ...}

${parts}`;
}
/** How many choice and matching questions the guesser got right. */
export function guessScore(p: ListeningPaper, guess: BlindAnswers): { right: number; total: number } {
  let right = 0, total = 0;
  for (const s of p.parts) for (const q of s.questions) {
    if (q.type === 'fill') continue;
    total++;
    if (String(guess[s.id]?.[q.n] ?? '').trim().toUpperCase() === q.answer.toUpperCase()) right++;
  }
  return { right, total };
}

// ── The reviewer: a separate reader scores the paper against a checklist ─────
// Adrian, 14 Oct 2026: "can we review the papers to sift out the good quality ones automatically?"
// Only a paper that passes EVERY item is kept. Examples: SPEC-ENGLISH-ORAL-LISTENING.md §More papers.
export const REVIEW_ITEMS = [
  { key: 'real-task', ask: 'Each part feels like a real O-Level English Paper 3 (syllabus 1184) task: a recount, a conversation, an explanation or an informational talk with a clear purpose, and questions of the exam\'s kinds.' },
  { key: 'natural-speech', ask: 'The words sound like people speaking, not like written prose read out: contractions, short turns, the odd "well" or "actually"; no speech that only works on paper.' },
  { key: 'one-answer', ask: 'Every question has exactly one clear answer in the script, and the key gives it. No second option that could also be argued right.' },
  { key: 'fair-distractors', ask: 'Wrong options and traps are fair: each is mentioned or plausible, none is a trick of wording, and none needs knowledge from outside the recording.' },
  { key: 'level-fits', ask: 'The paper fits its level. Easier: answers said plainly, no changes of mind. Standard: like the exam, a wrong detail at most mentioned in passing. Harder: speakers change their minds and correct themselves, so the final answer must be caught.' },
  { key: 'length-timing', ask: 'Length and timing match the exam: each recording about 2–3 minutes at the level\'s pace — Easier is read slowly, so about 210–300 words a part is right; Standard about 280–380; Harder about 330–420 (these are rough: about 10% either side is fine). Questions follow the order of the recording; fill-in answers are one to three words or a number.' },
  { key: 'sg-words', ask: 'Every Singapore place, food or local word that is NOT plain English is one the voice has been taught (the list below); people\'s names are easy for an English voice to say. Fine without the list: place names made of English words (East Coast, Orchard Road, Botanic Gardens, void deck, hawker centre), short acronyms read letter by letter (CCA, MRT, HDB), and Mr / Mrs / Ms / Mdm (the voice says "Madam").' },
  { key: 'suitable', ask: 'Nothing awkward or unsuitable for a 15-year-old: no romance, alcohol, violence, money worries played for drama, brands, real public figures, or anything that would embarrass a student or school.' },
] as const;
export type ReviewKey = typeof REVIEW_ITEMS[number]['key'];
export interface Review { items: Record<ReviewKey, { pass: boolean; note: string }> }

/** What the reviewer is given: the whole paper with its key, the checklist, and the taught words. */
export function reviewPrompt(p: ListeningPaper): string {
  const sg = Object.keys(SG_SAY as Record<string, string>).join(', ');
  return `You are the reviewer for an English listening paper for Singapore Secondary 4 students (O-Level English 1184, Paper 3). Level: ${p.level.toUpperCase()}.
Judge it against EVERY item below. Be strict: a paper is only kept if every item passes; when in doubt, fail the item and say why in one short line.

CHECKLIST:
${REVIEW_ITEMS.map(i => `- ${i.key}: ${i.ask}`).join('\n')}

Singapore words the voice has been taught: ${sg}.

Reply with JSON only: {"items": {${REVIEW_ITEMS.map(i => `"${i.key}": {"pass": true|false, "note": "<one line>"}`).join(', ')}}}

THE PAPER (with its key):
${JSON.stringify(p.parts.map(s => ({ id: s.id, section: s.section, textType: s.textType, intro: s.intro, script: s.script, bank: s.bank, questions: s.questions })), null, 1)}`;
}

/** The reviewer's reply → the items that failed (empty = keep). A reply that is not the checklist fails as a whole. */
export function reviewFailures(r: unknown): string[] {
  const items = (r as Review | null)?.items;
  if (!items || typeof items !== 'object') return ['the reviewer gave no checklist'];
  return REVIEW_ITEMS.filter(i => !(items as Record<string, { pass?: unknown }>)[i.key] || (items as Record<string, { pass?: unknown }>)[i.key].pass !== true)
    .map(i => `${i.key}: ${String((items as Record<string, { note?: unknown }>)[i.key]?.note ?? 'no answer')}`);
}

// ── Which paper comes next ──────────────────────────────────────────────────
/** The first paper at the level (oldest first) the student has not started; null when all are started. */
export function nextPaper(ids: string[], started: Set<string>): string | null {
  return ids.find(id => !started.has(id)) ?? null;
}

// ── Keeping a pile ready, within the cost limits (Adrian, 14 Oct 2026: "yes") ──
// Every paper is shared by all students. Each level keeps a few papers READY so "New paper" is
// instant. A new one is made only when the keenest student at the level has two or fewer left, so
// the pile grows with the keenest student's use, not with the number of students. When a student
// takes a paper the next one is made straight away (the worker's one-minute look), ready minutes later.
export const READY_FLOOR = 3;                 // each level keeps at least this many (ready or being voiced)
export const KEENEST_LEFT = 2;                // make one more when the keenest student has this many left
export const PER_STUDENT_PER_DAY = 1;         // at most one new paper a day made because of one student
/** Most new papers made in a calendar month (Singapore), all levels. Adrian sets it; shown on /admin/listening-papers. */
export const MONTHLY_CAP = 30;
/** Recording new papers costs MiniMax money (about US$0.75 a paper). Off until Adrian agrees the cost;
 *  while off, a paper that passes every check waits as 'checked' and is never served. */
export const VOICE_NEW_PAPERS = false;

/**
 * How many papers a level needs now. `stock` = ready + checked (being voiced). `leftPerStudent` =
 * for each student who has used the level, the papers there they have not started.
 * The keenest student's day and the month's cap are applied by the caller (wantedWithinLimits).
 */
export function papersWanted(stock: number, leftPerStudent: number[]): number {
  if (stock < READY_FLOOR) return READY_FLOOR - stock;
  const fewest = leftPerStudent.length ? Math.min(...leftPerStudent) : Infinity;
  return fewest <= KEENEST_LEFT ? 1 : 0;
}

/** The limits: the month's cap, and one a day for the student whose use asked for it. */
export function wantedWithinLimits(wanted: number, o: { madeThisMonth: number; keenestMadeToday: number; byKeenest: boolean }): number {
  let n = Math.min(wanted, Math.max(0, MONTHLY_CAP - o.madeThisMonth));
  if (o.byKeenest && o.keenestMadeToday >= PER_STUDENT_PER_DAY) n = 0;
  return n;
}

// ── After use: student results retire weak papers ───────────────────────────
// A retired paper stops being served, goes on Adrian's list with the reason, and the pile refills.
export interface PartStats { id: string; tries: number; perQuestion: Record<string, { right: number; tries: number }> }
export interface PaperStats { level: ListeningLevel; parts: PartStats[]; started: number; finished: number }
export const RETIRE = { minTries: 8, nearlyAllWrong: 0.15, harderAllRight: 0.95, minStarters: 6, leftHalfway: 0.6 } as const;

/** Why a paper should be retired, or null. Needs enough tries before it judges anything. */
export function weakPaper(st: PaperStats): string | null {
  for (const p of st.parts) for (const [n, q] of Object.entries(p.perQuestion)) {
    if (q.tries >= RETIRE.minTries && q.right / q.tries <= RETIRE.nearlyAllWrong) return `${p.id} Q${n}: ${q.right} of ${q.tries} right — unclear, or the key is wrong`;
  }
  if (st.level === 'harder') {
    const qs = st.parts.flatMap(p => Object.values(p.perQuestion));
    if (qs.length && qs.every(q => q.tries >= RETIRE.minTries && q.right / q.tries >= RETIRE.harderAllRight)) return 'too easy for Harder: nearly everyone gets every question right';
  }
  if (st.started >= RETIRE.minStarters && (st.started - st.finished) / st.started >= RETIRE.leftHalfway) return `${st.started - st.finished} of ${st.started} students stopped halfway`;
  return null;
}

/** "lp001" → "lp002"; the next id after every one used. */
export function nextPaperId(used: string[]): string {
  const top = used.map(id => Number(/^lp(\d{3})$/.exec(id)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0);
  return `lp${String(top + 1).padStart(3, '0')}`;
}

/** The public URL of a part's recording (public bucket english-audio). */
export const LISTENING_BUCKET = 'english-audio';
export const partAudioKey = (id: string): string => `listening/${id}.mp3`;
export { norm };
