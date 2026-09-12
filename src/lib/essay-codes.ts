// The essay error taxonomy (SPEC-ESSAY-MARKING.md §The error taxonomy, 12 Sep
// 2026). FIXED codes so that counts per essay per student are comparable across
// essays and across markers — the trend card and the parent digest's line both
// read them. The marker may not invent one: a slip that fits nothing is marked
// in place with a plain reason and counted under no code (bot lib/essay-report).
// The website owns this list and sends it to the bot with every essay.

export interface EssayCode {
  code: string;
  label: string;
  /** What the marker should count under it — one line, in the student's words. */
  hint: string;
}

export const ENGLISH_ESSAY_CODES: readonly EssayCode[] = [
  { code: 'tense', label: 'Tense', hint: 'the wrong tense, or the tense drifting mid-story ("he walks" in a past-tense recount)' },
  { code: 'sva', label: 'Subject–verb agreement', hint: 'the verb does not match its subject ("the waves was")' },
  { code: 'article', label: 'Articles', hint: 'a/an/the missing, extra or wrong' },
  { code: 'preposition', label: 'Prepositions', hint: 'the wrong preposition, or one missing ("arrived to school")' },
  { code: 'word_form', label: 'Word form', hint: 'the wrong form of the word ("she was very anger")' },
  { code: 'collocation', label: 'Collocation', hint: 'words that do not go together in English ("make a photo", "do a mistake")' },
  { code: 'spelling', label: 'Spelling', hint: 'a misspelt word' },
  { code: 'punctuation', label: 'Punctuation', hint: 'a missing or wrong full stop, comma, apostrophe, capital letter or speech mark — other than a comma splice' },
  { code: 'comma_splice', label: 'Comma splice / run-on', hint: 'two sentences joined by a comma or by nothing' },
  { code: 'fragment', label: 'Sentence fragment', hint: 'a group of words with no main verb standing as a sentence' },
  { code: 'pronoun_ref', label: 'Unclear pronoun', hint: 'it/they/this with no clear thing it refers to' },
  { code: 'register', label: 'Register', hint: 'the wrong tone for the audience or text type — slang in a formal letter, stiff formality in a story' },
  { code: 'vague', label: 'Vague or empty phrase', hint: 'a cliché or filler that says nothing ("it was very nice", "in a nutshell", "last but not least")' },
  { code: 'paragraph', label: 'Paragraphing', hint: 'a paragraph with no controlling idea, two ideas in one paragraph, or no paragraphs at all' },
  { code: 'off_task', label: 'Off task', hint: 'a point the question asked for is missing, or the essay drifts from the topic set' },
  { code: 'length', label: 'Length', hint: 'well short of, or well over, the word range the paper sets' },
];

export function essayCodesFor(subject: string): readonly EssayCode[] {
  return subject === 'english' ? ENGLISH_ESSAY_CODES : [];
}

export function codeLabel(subject: string, code: string | null | undefined): string {
  if (!code) return 'Other';
  return essayCodesFor(subject).find(c => c.code === code)?.label ?? code.replace(/_/g, ' ');
}
