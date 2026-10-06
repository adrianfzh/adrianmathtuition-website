// Situational writing formats for O-Level English 1184 (6 Oct 2026) — the
// students' "Formats" page (/app/languages/formats). Our own words, from
// docs/english-guidance-draft.md Part 1, checked against the SEAB syllabus:
// Section B is 30 marks (Task Fulfilment 10 + Language 20), 250–350 words.
// **bold** = what the reader must find. No model essays, no phrase bank. Pure data.

export interface TextFormat {
  key: string;
  name: string;
  /** One line: who it is for and how it sounds. */
  feel: string;
  /** Top to bottom, the way it sits on the page. */
  layout: readonly string[];
  /** What goes in the body. */
  body: readonly string[];
}

/** What earns the marks — the three things Task Fulfilment looks at. */
export const WHAT_SCORES: readonly string[] = [
  '**Every point** the task asks for, each one developed.',
  'The **reader**, the **reason** for writing and the **tone** all fit.',
  'The **given information** (the picture, poster or webpage) is used.',
];

/** Four questions to answer before writing a word. */
export const BEFORE_WRITING: readonly string[] = [
  '**Who** am I, and **who** reads this?',
  '**Why** am I writing? Say it in the first paragraph.',
  '**What points** does the task ask for? Number them on the paper.',
  '**What text type** does the task name? Use the task’s own word.',
];

/** Greeting and close go in pairs. */
export const PAIRS: readonly { greeting: string; close: string; when: string }[] = [
  { greeting: 'Dear Sir or Madam,', close: 'Yours faithfully,', when: 'You do not know the reader’s name' },
  { greeting: 'Dear Mr Tan,', close: 'Yours sincerely,', when: 'You know the reader’s name' },
  { greeting: 'Dear Wei Ling,', close: 'Best wishes,', when: 'A friend or relative' },
];

export const FORMATS: readonly TextFormat[] = [
  {
    key: 'formal-letter', name: 'Formal letter', feel: 'To an organisation or someone you do not know well. Polite and clear.',
    layout: ['Your address', 'The date in full (6 October 2026)', 'The reader’s name or title, and address', 'Greeting', 'A short line saying **what the letter is about**', 'Close, then your **full name**'],
    body: ['Paragraph 1: **who you are** and **why you are writing**.', 'One required point per paragraph, each developed.', 'Last paragraph: **what you want to happen next**.'],
  },
  {
    key: 'informal-letter', name: 'Informal letter', feel: 'To a friend or relative. Warm, but still full sentences.',
    layout: ['Your address', 'The date', 'Greeting with the **first name**', 'A friendly close, then your **first name only**'],
    body: ['A warm first line, then the **reason for writing**.', 'The required points, still one per paragraph.', 'No text-message spelling.'],
  },
  {
    key: 'email', name: 'E-mail', feel: 'Formal or informal — the reader decides. No addresses.',
    layout: ['To', 'From', '**Subject**: the purpose in a few words', 'Greeting', 'Close, then your name (add your role if the reader does not know you)'],
    body: ['Formal: write it like a formal letter.', 'Informal: write it like an informal letter.', 'Paragraph 1 still says **why you are writing**.'],
  },
  {
    key: 'speech', name: 'Speech or talk', feel: 'Spoken to an audience in front of you.',
    layout: ['**Greet the audience** by who they are (“Good morning, Mr Lim, teachers and fellow students.”)', 'No address, no “Yours sincerely”', 'End by **thanking** them'],
    body: ['Say **who you are** and **what you will talk about**.', 'Speak to them: “you”, “we”, a question now and then.', 'One required point per section, with a clear move to the next.', 'Finish with **what you want them to do**.'],
  },
  {
    key: 'report', name: 'Report', feel: 'To someone in charge. Facts, in a neutral tone.',
    layout: ['To', 'From', 'Date', 'A **title** saying what the report is about', 'Your name and role at the end — no “Yours sincerely”'],
    body: ['Paragraph 1: **why the report is written**.', 'Facts in order (what, when, where, who), or one heading per required point.', 'No chatty lines.', 'A **recommendation** at the end if the task asks for one.'],
  },
  {
    key: 'proposal', name: 'Proposal', feel: 'To someone who decides. You are asking for a yes.',
    layout: ['To', 'From', 'Date', 'A **title**', 'Your name and role at the end'],
    body: ['**What you propose** and why it is needed.', 'The details the task asks for (what, who, when, cost, benefits).', 'Why this choice is the **best one**, using the given information.', 'A polite closing line asking for approval.'],
  },
  {
    key: 'article', name: 'Article', feel: 'For readers of a newsletter, magazine or website.',
    layout: ['A **title**', '“Written by” and your name, under the title or at the end', 'No greeting, no close'],
    body: ['An opening that tells the reader **why this matters to them**.', 'One required point per paragraph.', 'Written for the readers the task names (schoolmates, the public).', 'A closing thought.'],
  },
];

/** Slips that cost marks most often. */
export const COMMON_SLIPS: readonly string[] = [
  'Answering two of the three points and forgetting the third.',
  'Writing to a principal the way you would text a friend.',
  'Not saying why you are writing until the last paragraph.',
  'Ignoring the dates, costs or choices the task gives you.',
  'Writing a letter when the task says “proposal”, or a speech with “Yours sincerely”.',
  'Going far past 350 words.',
];
