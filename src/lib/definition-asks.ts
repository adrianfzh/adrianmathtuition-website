// "Which definition does this question ask for?" and "what does its command
// word want?" (14 Oct 2026, Adrian: "#1 > do it", "#2 > do it"). Pure.
//
//   - The ⭐ "often asked" flags on the definitions lists were counted with
//     `askedTerms` over the science bank (scripts/definitions-often-asked.ts).
//   - A lost mark on a marked science paper links to the definition it asked
//     for, or to what its command word wants (`lostPartHelp`).
import type { Definition } from './science-definitions';
import { findInList, termKey } from './my-definitions';

// The words that lead into a definition: "Define X", "What is meant by X",
// "State the meaning of X", "What do you understand by X", "definition of X".
const LEAD = /\b(?:what\s+is\s+meant\s+by|what\s+do\s+you\s+understand\s+by|(?:state|give|write)\s+(?:down\s+)?(?:the|a)\s+(?:meaning|definition)\s+of|(?:the\s+)?meaning\s+of|definition\s+of|define[sd]?)\s+/gi;

// What may sit between the lead and the term: "the term", "the word 'X'".
const FILLER = /^(?:the\s+)?(?:(?:scientific\s+)?terms?|words?|phrases?)\s+/i;

/** The phrases a question asks to be defined, as written ("specific heat capacity of water"). */
export function definePhrases(text: string): string[] {
  // Markdown bold/italics and maths dollars are not words.
  const s = String(text ?? '').replace(/[*_$]/g, '').replace(/\s+/g, ' ');
  const out: string[] = [];
  for (const m of s.matchAll(LEAD)) {
    let rest = s.slice((m.index ?? 0) + m[0].length).replace(FILLER, '');
    rest = rest.replace(/^[\s'"‘’“”`*_]+/, '');
    // The phrase ends at the first stop, quote, bracket or clause break.
    // A full stop inside "e.m.f." or "a.c." is not the end.
    const cut = rest.search(/\.(?=\s|$)|[?!,;:()\[\]\n'"’”]|\s(?:and|in terms of|with reference to|for|as)\s/i);
    const phrase = (cut < 0 ? rest : rest.slice(0, cut)).trim().split(' ').slice(0, 8).join(' ');
    if (/[a-z]/i.test(phrase)) out.push(phrase);
  }
  return out;
}

// Single short words that would match too loosely as a list term on their own.
const TOO_LOOSE = new Set(['it', 'this', 'that', 'term', 'word']);

// Each list term, keyed without its bracket ("Electromotive force (e.m.f.)" →
// "electromotive force"), plus the bracket itself as a second name when it is
// long enough to be safe ("e.m.f." yes, "a.c." no).
function namesOf(list: readonly Definition[]): { d: Definition; k: string }[] {
  const out: { d: Definition; k: string }[] = [];
  for (const d of list) {
    const bare = d.term.replace(/\s*\(([^)]*)\)\s*/g, ' ').trim();
    out.push({ d, k: termKey(bare) });
    const inner = /\(([^)]*)\)/.exec(d.term)?.[1];
    if (inner && termKey(inner).length >= 5) out.push({ d, k: termKey(inner) });
  }
  return out;
}

/** The list definition a phrase names: the longest leading run of its words that the list knows. */
export function definitionForPhrase(phrase: string, list: readonly Definition[]): Definition | null {
  const words = String(phrase ?? '').split(/\s+/).filter(Boolean);
  const names = namesOf(list);
  const byKey = names.map(x => ({ ...x.d, term: x.k, id: x.d.id }));
  for (let n = Math.min(words.length, 6); n >= 1; n--) {
    const head = words.slice(0, n).join(' ');
    const k = termKey(head);
    if (!k || TOO_LOOSE.has(k)) continue;
    const hit = findInList(head, byKey);
    // A spelling slip is fine for a phrase; a one-word phrase must be the word itself.
    if (hit && (n > 1 || hit.term === k || hit.term.startsWith(`${k} `))) return list.find(d => d.id === hit.id) ?? null;
    // "exothermic" → "Exothermic reaction", "work" → "Work done": the only term that starts so.
    // Only when the whole phrase is that word run, never "X and Y" ("temperature" is not
    // "Temperature and particles").
    if (n === words.length && k.length >= 4) {
      const starts = [...new Set(names.filter(x => x.k.startsWith(`${k} `) && !x.k.startsWith(`${k} and `)).map(x => x.d))];
      if (starts.length === 1) return starts[0];
    }
  }
  return null;
}

/** Every list definition a question text asks for (each once, in order). */
export function askedTerms(text: string, list: readonly Definition[]): Definition[] {
  const seen = new Set<string>();
  const out: Definition[] = [];
  for (const p of definePhrases(text)) {
    const d = definitionForPhrase(p, list);
    if (d && !seen.has(d.id)) { seen.add(d.id); out.push(d); }
  }
  return out;
}

// ── Command words ────────────────────────────────────────────────────────────

/** The command words on /app/science/command-words, by the anchor each row carries. */
export const COMMAND_WORD_ANCHORS: Readonly<Record<string, string>> = {
  state: 'state', define: 'define', describe: 'describe', explain: 'explain', suggest: 'suggest',
  compare: 'compare', calculate: 'calculate', deduce: 'deduce-predict', predict: 'deduce-predict',
  identify: 'identify-name', name: 'identify-name', outline: 'outline',
};

/** The anchor id for a command word row ("Deduce / Predict" → "deduce-predict"). */
export const commandWordAnchor = (word: string) => String(word ?? '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

/**
 * The command word a question part starts with, lower-case, or null. Skips a
 * part label ("(b)(ii)"), a lead-in sentence ("Fig. 3.1 shows …. Explain why…")
 * by taking the LAST sentence that starts with a command word.
 */
export function commandWordOf(text: string): string | null {
  const s = String(text ?? '').replace(/\s+/g, ' ');
  const re = /(?:^|[.?!:]\s+|\)\s*)(state|define|describe|explain|suggest|compare|calculate|deduce|predict|identify|name|outline)\b/gi;
  let last: string | null = null;
  for (const m of s.matchAll(re)) last = m[1].toLowerCase();
  return last;
}

// The marker's note says the answer gave a reason when a description was asked
// (or the other way round), or missed what the word wants.
const SLIP = /\b(describ|explain|reason|why|trend|values?|state[ds]?|no\s+because|not\s+asked|instead|command\s+word|define|definition|key\s+word|compar|whereas|both)/i;

export interface LostPart {
  /** The question part's text, as the marker read it. */
  text: string;
  /** The marker's note on what went wrong (may be empty). */
  note?: string | null;
}

export type DefSubjectKey = 'physics' | 'biology' | 'chemistry';

export type LostPartLink =
  | { kind: 'definition'; label: string; href: string; term: string }
  | { kind: 'command'; label: string; href: string; word: string };

/** The page for a subject's definitions list, landing on one term. */
export function definitionHref(subject: DefSubjectKey, id: string): string {
  const s = subject === 'physics' ? '' : `s=${subject}&`;
  return `/app/science/definitions?${s}term=${encodeURIComponent(id)}#${id}`;
}

/**
 * At most ONE link for a part that lost marks on a science paper:
 *   1. it asks to define a term on the subject's list → "📖 Learn the definition";
 *   2. else it starts with a command word and lost marks → "📖 What 'explain' asks for".
 * `lists` carries only the subjects whose lists are open to this student.
 */
export function lostPartHelp(
  part: LostPart,
  subject: DefSubjectKey | null,
  lists: Partial<Record<DefSubjectKey, readonly Definition[]>>,
  commandWordsOpen: boolean,
): LostPartLink | null {
  if (!subject) return null;
  const list = lists[subject];
  if (list) {
    const d = askedTerms(part.text, list)[0];
    if (d) return { kind: 'definition', label: 'Learn the definition', href: definitionHref(subject, d.id), term: d.term };
  }
  if (!commandWordsOpen) return null;
  const word = commandWordOf(part.text);
  if (!word) return null;
  // "Calculate" and "name" lose marks for maths or recall, not for the word.
  if (word === 'calculate' || word === 'name' || word === 'identify') return null;
  // "State" is a short fact: only worth a link when the note shows the slip.
  if (word === 'state' && !SLIP.test(String(part.note ?? ''))) return null;
  const anchor = COMMAND_WORD_ANCHORS[word];
  return { kind: 'command', label: `What ‘${word}’ asks for`, href: `/app/science/command-words#${anchor}`, word };
}

// ── A lost part's own words, out of the question as the marker read it ──────

/** "(b)(ii)", "b(ii)", "b ii" → "b.ii". Empty when there is no label. */
export function normLabel(label: string | null | undefined): string {
  const toks = String(label ?? '').toLowerCase().match(/[a-h](?![a-z])|[ivx]{1,4}/g) ?? [];
  return toks.join('.');
}

/**
 * The words of one part of a question prompt: from its label to the next one.
 * Handles one part a line ("(a) Define …\n(b) …") and the marker's one-line
 * summaries ("(a) define centre of gravity [1]; (b)(i) …"). The stem before
 * the first label is not part of any part. Null when the label is not found.
 */
export function partText(prompt: string | null | undefined, label: string | null | undefined): string | null {
  const s = String(prompt ?? '');
  const want = normLabel(label);
  if (!s || !want) return null;
  const tokens = [...s.matchAll(/\(([a-h]|[ivx]{1,4})\)/g)];
  let letter = '';
  const spans: { key: string; from: number; to: number }[] = [];
  tokens.forEach((m, i) => {
    const t = m[1];
    // A roman numeral is a sub-part of the letter before it; a letter starts a new part.
    let key = t;
    if (/^[ivx]+$/.test(t) && letter) key = `${letter}.${t}`;
    else letter = t;
    const from = (m.index ?? 0) + m[0].length;
    const to = i + 1 < tokens.length ? (tokens[i + 1].index ?? s.length) : s.length;
    spans.push({ key, from, to });
  });
  const hits = spans.filter(x => x.key === want || x.key.startsWith(`${want}.`));
  if (!hits.length) return null;
  const text = hits.map(x => s.slice(x.from, x.to)).join(' ').replace(/\[\d+\]/g, ' ').replace(/[;\s]+$/g, '').replace(/\s+/g, ' ').trim();
  return text || null;
}

/** What the paper page needs from one lost-marks question. */
export interface LostQuestion {
  prompt: string | null;
  lostParts?: { label: string | null; why: string | null }[];
}

/**
 * The study links for a science question that lost marks: at most one per lost
 * part, each link once per question. A part with no label uses the whole question.
 */
export function lostPartLinks(
  q: LostQuestion,
  subject: DefSubjectKey | null,
  lists: Partial<Record<DefSubjectKey, readonly Definition[]>>,
  commandWordsOpen: boolean,
): { label: string; href: string; part: string | null }[] {
  if (!subject || !q.prompt) return [];
  const out: { label: string; href: string; part: string | null }[] = [];
  for (const p of q.lostParts ?? []) {
    // A labelled part we cannot find in the prompt gets no link: the whole
    // question might name another part's term.
    const text = p.label ? partText(q.prompt, p.label) : q.prompt;
    if (!text) continue;
    const link = lostPartHelp({ text, note: p.why }, subject, lists, commandWordsOpen);
    if (!link || out.some(x => x.href === link.href)) continue;
    const label = link.kind === 'definition' ? `${link.label}: ${link.term}` : link.label;
    out.push({ label, href: link.href, part: p.label });
  }
  return out;
}
