// The P&C LEARN steps (SPEC-SELF-LEARNING.md §4c), JC H2 "Permutations and
// Combinations 1: Basic Techniques", in the order and with the examples of Adrian's
// notes (Dropbox "1 ONLINE LESSONS/1 NOTES/10 Notes H2 MATH/12 Permutations and
// Combinations 1.pdf"). Built 28 Oct 2026 (Adrian: "Yes, go"): the first four steps.
//
// A question is its words plus its SPEC (lib/pc-count): the answer is COUNTED from the
// spec, never typed in here, and pc-steps.test.ts checks every question's method
// against the exact counter and every printed answer of his against the count.
// The "Stuck? Next step" lines are his extracted method (teaching_knowledge(), matched
// by `method`), the "watch out" line his extracted pitfall (`pitfall`); the fallback
// text here is the same wording, used only when the knowledge layer cannot be reached.

import type { PcSpec } from './pc-count';
import type { ExplainLine } from './pc-explain';

export interface PcQuestion {
  prompt: string;
  spec: PcSpec;
  /** His own working, when the notes write it differently from the generated method. Its last number is checked. */
  lines?: ExplainLine[];
  /** The positions picture (his ↑ boxes), when the notes draw one. */
  boxes?: { label: string; ways: number }[];
  /** Where it comes from in his notes: "Example 1c", "Practice 5". */
  from?: string;
}

export interface PcStep {
  slug: string;
  index: number;
  of: number;
  title: string;
  idea: [string, string];
  /** The teaching_knowledge() method row (question_type) whose lines are the hints. */
  method: { level: 'AM' | 'JC2'; questionType: string; fallback: string };
  /** The pitfall row (context) said under a wrong answer no counted slip explains. */
  pitfall?: { level: 'AM' | 'JC2'; context: string; fallback: string };
  example: PcQuestion;
  tryOne: PcQuestion;
  sets: PcQuestion[][];
  next?: string;
  nextSlug?: string;
}

/** His chapter, in order: the steps still to build are named so "step 2 of 9" is honest. */
export const PC1_CHAPTER = [
  'Fill the boxes', 'Arrange r of n', 'Choose r of n', 'Identical letters', 'Choosing groups',
  'Grouping (together)', 'Slotting (apart)', 'Round a table', 'Empty seats',
] as const;
/** Steps not in his P&C 1 notes, to come at the END, marked as extra. */
export const PC1_EXTRAS = ['Shortest routes on a grid (extra)'] as const;

const L = (w: string) => w.split('');
const P = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const AZ = L('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const D10 = L('0123456789');
const D19 = L('123456789');
const nth = (n: number, what: string) => Array.from({ length: n }, (_, i) => `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} ${what}`);
const boxes = (n: number, what: string, items: string[], repeat = true): PcSpec => ({ mode: 'boxes', items, r: n, labels: nth(n, what), ...(repeat ? {} : { repeat: false }) });
const row = (items: string[], r?: number): PcSpec => ({ mode: 'row', items, ...(r !== undefined ? { r } : {}) });
const choose = (items: string[], r: number, rules?: PcSpec['rules']): PcSpec => ({ mode: 'choose', items, r, ...(rules ? { rules } : {}) });

const STEPS: PcStep[] = [
  {
    slug: 'pc-boxes', index: 1, of: PC1_CHAPTER.length,
    title: 'Fill the boxes: AND means multiply',
    idea: ['One box for each position. Write how many ways each box can be filled.', 'This box AND that box → multiply. This route OR that route → add.'],
    method: {
      level: 'AM', questionType: 'Counting with the multiplication rule (with or without repetition)',
      fallback: '1. Draw one box for each position.\n2. Write in each box how many choices are left for it. With repetition, every box has the full count.\n3. Fill a box with a condition first (e.g. "cannot start with 0").\n4. Multiply the boxes.',
    },
    pitfall: { level: 'AM', context: 'Combining the steps or cases of a count', fallback: '"This AND that" → multiply. "This case OR that case" → add.' },
    example: { from: 'Example 1a(iii)', prompt: 'Find the number of 4-letter words, when the letters are allowed to repeat.', spec: boxes(4, 'letter', AZ) },
    tryOne: { prompt: 'How many 3-digit codes can be made from the digits 0 to 9, if the digits may repeat?', spec: boxes(3, 'digit', D10) },
    sets: [
      [
        { from: 'Example 1a(ii)', prompt: 'There are 4 roads from A to B and 3 roads from B to C. How many ways are there to travel from A to C?', spec: { mode: 'boxes', items: [], positions: [P('r', 4), P('s', 3)], labels: ['A to B', 'B to C'] } },
        { from: 'Example 1a(iv)', prompt: 'Find the total number of 8-digit telephone numbers (each digit can be any digit from 0 to 9).', spec: boxes(8, 'digit', D10) },
        { from: 'Example 1a(v)', prompt: 'An NRIC number starts with S, T, F, G or M, followed by a 7-digit number, and ends with a letter (A to Z). Find the total number of NRIC numbers.', spec: { mode: 'boxes', items: [], positions: [L('STFGM'), ...Array<string[]>(7).fill(D10), AZ], labels: ['S/T/F/G/M', ...Array<string>(7).fill('Number'), 'Letter'] } },
        { prompt: 'A PIN has 4 digits, each from 0 to 9. Digits may repeat. How many PINs are there?', spec: boxes(4, 'digit', D10) },
        { prompt: 'How many 4-digit numbers are there? (A number cannot start with 0. Digits may repeat.)', spec: { mode: 'boxes', items: [], positions: [D19, D10, D10, D10], labels: nth(4, 'digit') } },
      ],
      [
        { prompt: 'Find the number of 3-letter words, when the letters are allowed to repeat.', spec: boxes(3, 'letter', AZ) },
        { prompt: 'A code is one letter from A, B or C, followed by two digits from 0 to 9. How many codes are there?', spec: { mode: 'boxes', items: [], positions: [L('ABC'), D10, D10], labels: ['Letter', 'Digit', 'Digit'] } },
        { prompt: 'A quiz has 5 true-or-false questions. In how many ways can all 5 be answered?', spec: { mode: 'boxes', items: L('TF'), r: 5, labels: nth(5, 'answer') } },
        { prompt: 'A die is rolled 3 times. How many different results (in order) are there?', spec: boxes(3, 'roll', L('123456')) },
        { prompt: 'A menu has 3 starters, 4 mains and 2 desserts. In how many ways can you choose one starter, one main and one dessert?', spec: { mode: 'boxes', items: [], positions: [P('s', 3), P('m', 4), P('d', 2)], labels: ['Starter', 'Main', 'Dessert'] } },
      ],
      [
        { prompt: 'A password is 2 letters (A to Z) followed by 3 digits (0 to 9). Letters and digits may repeat. How many passwords are there?', spec: { mode: 'boxes', items: [], positions: [AZ, AZ, D10, D10, D10], labels: ['Letter', 'Letter', 'Digit', 'Digit', 'Digit'] } },
        { prompt: 'How many 6-letter words can be made from the letters A, B, C, D and E, if letters may repeat?', spec: boxes(6, 'letter', L('ABCDE')) },
        { prompt: 'A coin is tossed 4 times. How many different results (in order) are there?', spec: boxes(4, 'toss', L('HT')) },
        { prompt: 'How many odd 3-digit numbers are there? (Digits may repeat.)', spec: { mode: 'boxes', items: [], positions: [D19, D10, L('13579')], labels: ['1st digit', '2nd digit', '3rd digit (odd)'] } },
        { prompt: 'You have 5 shirts, 3 pairs of pants and 2 pairs of shoes. How many different outfits can you wear?', spec: { mode: 'boxes', items: [], positions: [P('t', 5), P('p', 3), P('s', 2)], labels: ['Shirt', 'Pants', 'Shoes'] } },
      ],
    ],
    next: 'Arrange r of n: ⁿPᵣ', nextSlug: 'pc-arrange-r',
  },
  {
    slug: 'pc-arrange-r', index: 2, of: PC1_CHAPTER.length,
    title: 'Arrange r of n: ⁿPᵣ',
    idea: ['No repeats: each box has one fewer way than the box before.', 'Arranging r objects out of n in a row: ⁿPᵣ = n! / (n − r)!.'],
    method: {
      level: 'AM', questionType: 'Arranging r objects chosen from n different objects (order matters)',
      fallback: '1. Check that order matters: a different order gives a different outcome (codes, seats, first/second/third).\n2. Number of ways = nPr = n! / (n − r)!.',
    },
    pitfall: { level: 'AM', context: 'Deciding between nPr and nCr', fallback: 'Ask: does swapping two chosen items give a new outcome? Yes → nPr. No → nCr.' },
    example: {
      from: 'Example 1c',
      prompt: 'Find the total number of 3-letter words formed from the letters A, B, C, D and E, if the letters cannot repeat.',
      spec: row(L('ABCDE'), 3),
      boxes: [{ label: '1st letter', ways: 5 }, { label: '2nd letter', ways: 4 }, { label: '3rd letter', ways: 3 }],
      lines: [
        { tex: '5 \\times 4 \\times 3', why: 'one fewer letter for each box' },
        { tex: '= \\frac{5 \\times 4 \\times 3 \\times 2 \\times 1}{2 \\times 1} = \\frac{5!}{(5-3)!}', why: 'which we can write as this' },
        { tex: '= {}^{5}P_{3}', why: 'reads "5 P 3"' },
        { tex: '= 60' },
      ],
    },
    tryOne: { from: 'Example 1d(ii)', prompt: 'In how many ways can 10 people be arranged in a row, taking 7 people at a time?', spec: row(P('P', 10), 7) },
    sets: [
      [
        { from: 'Practice 5', prompt: 'There are 3 seats in a row. In how many ways can 5 boys occupy them?', spec: row(P('B', 5), 3) },
        { prompt: 'How many 4-letter words can be formed from the letters A, B, C, D, E and F, if no letter is repeated?', spec: row(L('ABCDEF'), 4) },
        { from: 'Example 2d', prompt: '20 people took part in a competition. In how many ways can 3 winners be selected, with 1st, 2nd and 3rd positions?', spec: row(P('P', 20), 3) },
        { prompt: 'In how many ways can 6 different books be arranged on a shelf?', spec: row(P('B', 6)) },
        { prompt: 'A 4-digit code uses the digits 1 to 9, with no digit repeated. How many codes are there?', spec: row(D19, 4) },
      ],
      [
        { from: 'Practice 7(ii)', prompt: 'Given six balls, all of different colours, in how many ways can you select three balls and arrange them in a row?', spec: row(P('b', 6), 3) },
        { prompt: '8 runners are in a race. In how many ways can the gold, silver and bronze medals be given out?', spec: row(P('R', 8), 3) },
        { prompt: 'How many 2-letter words can be formed from the letters A to G, if no letter is repeated?', spec: row(L('ABCDEFG'), 2) },
        { prompt: 'In how many ways can 5 of 6 people sit in a row of 5 chairs?', spec: row(P('P', 6), 5) },
        { prompt: 'A club of 9 members chooses a president, a vice-president and a secretary. In how many ways can this be done?', spec: row(P('M', 9), 3) },
      ],
      [
        { prompt: 'In how many ways can 7 people sit in a row of 7 chairs?', spec: row(P('P', 7)) },
        { prompt: 'How many 3-digit numbers can be formed from the digits 1, 2, 3, 4, 5 and 6, with no digit repeated?', spec: row(L('123456'), 3) },
        { prompt: '9 runners want lanes 1 to 4. In how many ways can 4 of them be put in the four lanes?', spec: row(P('R', 9), 4) },
        { prompt: 'In how many ways can a 1st prize and a 2nd prize be given to 2 of 12 students?', spec: row(P('S', 12), 2) },
        { prompt: 'How many 5-letter words can be formed from 8 different letters, if no letter is repeated?', spec: row(L('ABCDEFGH'), 5) },
      ],
    ],
    next: 'Choose r of n: ⁿCᵣ', nextSlug: 'pc-choose',
  },
  {
    slug: 'pc-choose', index: 3, of: PC1_CHAPTER.length,
    title: 'Choose r of n: ⁿCᵣ',
    idea: ['"Choose" → order does not matter. Think of putting the objects in a bag.', 'ⁿCᵣ = ⁿPᵣ / r!: divide by r! to "disarrange" the r chosen.'],
    method: {
      level: 'AM', questionType: 'Choosing r objects from n (a committee, a team, a hand of cards)',
      fallback: '1. Order does not matter, so use nCr = n! / (r! (n − r)!).\n2. Choosing from separate groups (e.g. 3 boys from 7 and 2 girls from 5): choose from each group and multiply, 7C3 × 5C2.\n3. "At least one" questions: total − none, or add the separate cases.',
    },
    pitfall: { level: 'AM', context: 'Deciding between nPr and nCr', fallback: 'In a selection, the same people in a different order are the same committee. Ask: does swapping two chosen items give a new outcome? Yes → nPr. No → nCr.' },
    example: {
      from: 'Example 1f',
      prompt: 'How many ways are there to choose 3 objects out of 4 objects, A, B, C and D?',
      spec: choose(L('ABCD'), 3),
      lines: [
        { tex: '\\frac{{}^{4}P_{3}}{3!}', why: 'why divide by 3!: ⁴P₃ counts ABC, ACB, BAC, BCA, CAB, CBA as 6 — in a bag they are one' },
        { tex: '= {}^{4}C_{3}', why: 'which we can write as this' },
        { tex: '= 4' },
      ],
    },
    tryOne: { from: 'Example 1g', prompt: '20 people took part in a competition. How many ways can 3 winners be selected?', spec: choose(P('P', 20), 3) },
    sets: [
      [
        { from: 'Example 1h', prompt: 'How many ways can a committee of 4 men and 5 ladies be selected from 8 men and 7 ladies?', spec: choose([...P('M', 8), ...P('L', 7)], 9, [{ t: 'count', items: P('M', 8), min: 4, max: 4 }]) },
        { from: 'Example 1i(i)', prompt: 'How many ways can 4 girls be selected from 10 girls, if the eldest girl must be included?', spec: choose(P('G', 10), 4, [{ t: 'count', items: ['G1'], min: 1 }]) },
        { from: 'Example 1i(ii)', prompt: 'How many ways can 4 girls be selected from 10 girls, if the eldest girl must be excluded?', spec: choose(P('G', 10), 4, [{ t: 'count', items: ['G1'], max: 0 }]) },
        { from: 'Example 1j(a)', prompt: 'In how many ways can 4 consolation prizes (all the same) be awarded to a class of 20 students?', spec: choose(P('S', 20), 4) },
        { from: 'Practice 6(a)', prompt: 'A team of 4 is to be chosen from Bobby, Anna, 3 female and 2 male students. In how many ways can this be done if there are no restrictions?', spec: choose(['Bob', 'Ann', 'F1', 'F2', 'F3', 'M1', 'M2'], 4) },
      ],
      [
        { from: 'Practice 6(b)', prompt: 'A team of 4 is to be chosen from Bobby, Anna, 3 female and 2 male students. In how many ways can this be done if Bobby must be in the team?', spec: choose(['Bob', 'Ann', 'F1', 'F2', 'F3', 'M1', 'M2'], 4, [{ t: 'count', items: ['Bob'], min: 1 }]) },
        { from: 'Practice 6(c)', prompt: 'A team of 4 is to be chosen from Bobby, Anna, 3 female and 2 male students. In how many ways can this be done if both Bobby and Anna must be in the team?', spec: choose(['Bob', 'Ann', 'F1', 'F2', 'F3', 'M1', 'M2'], 4, [{ t: 'count', items: ['Bob'], min: 1 }, { t: 'count', items: ['Ann'], min: 1 }]) },
        { from: 'Practice 7(i)', prompt: 'Given six balls, all of different colours, how many ways are there to select four balls?', spec: choose(P('b', 6), 4) },
        { prompt: 'In how many ways can 2 students be chosen from 10 students?', spec: choose(P('S', 10), 2) },
        { prompt: 'A team of 2 boys and 2 girls is chosen from 5 boys and 4 girls. In how many ways can this be done?', spec: choose([...P('B', 5), ...P('G', 4)], 4, [{ t: 'count', items: P('B', 5), min: 2, max: 2 }]) },
      ],
      [
        { prompt: 'In how many ways can 3 books be chosen from 7 different books?', spec: choose(P('B', 7), 3) },
        { prompt: 'A committee of 3 is chosen from 12 people. In how many ways can this be done?', spec: choose(P('P', 12), 3) },
        { prompt: 'A student must answer 5 of the 8 questions in a test. In how many ways can she choose the questions?', spec: choose(P('Q', 8), 5) },
        { prompt: 'A committee of 2 men and 3 women is chosen from 6 men and 5 women. In how many ways can this be done?', spec: choose([...P('M', 6), ...P('W', 5)], 5, [{ t: 'count', items: P('M', 6), min: 2, max: 2 }]) },
        { prompt: '4 people are chosen from 9, but one particular person refuses to go. In how many ways can the 4 be chosen?', spec: choose(P('P', 9), 4, [{ t: 'count', items: ['P1'], max: 0 }]) },
      ],
    ],
    next: 'Identical letters', nextSlug: 'pc-identical',
  },
  {
    slug: 'pc-identical', index: 4, of: PC1_CHAPTER.length,
    title: 'Identical letters: divide by p!',
    idea: ['Arrange as usual: n!.', 'Then "disarrange" the similar objects: divide by p! for each letter that appears p times.'],
    method: {
      level: 'AM', questionType: 'Arranging n objects when some are identical (e.g. the letters of SUCCESS)',
      fallback: '1. Count all the objects: n.\n2. Count each repeated letter or object: p, q, …\n3. Number of arrangements = n! / (p! q! …).',
    },
    pitfall: { level: 'AM', context: 'Arranging letters of a word with repeated letters', fallback: 'Divide by p! for each letter that appears p times.' },
    example: {
      from: 'Example 1l(a)',
      prompt: "How many ways can the letters of the word 'APPLE' be arranged?",
      spec: row(L('APPLE')),
      lines: [
        { tex: '5!', why: 'the number of ways to arrange 5 objects' },
        { tex: '\\text{A P}_1\\text{ P}_2\\text{ L E and A P}_2\\text{ P}_1\\text{ L E}', why: '5! treats the two P’s as different: the same word is counted twice' },
        { tex: '\\frac{5!}{2!} = 60', why: 'divide by 2!, the arrangements of P₁ P₂' },
      ],
    },
    tryOne: { from: 'Example 1l(b)', prompt: "How many ways can the letters of the word 'PINEAPPLE' be arranged?", spec: row(L('PINEAPPLE')) },
    sets: [
      [
        { from: 'Practice 1', prompt: 'Find the number of arrangements of the letters of the word MAMMAL.', spec: row(L('MAMMAL')) },
        { from: 'Example 1k(b)', prompt: 'How many ways can we arrange the letters A, B, B in a row?', spec: row(L('ABB')) },
        { from: 'Example 1k(c)', prompt: 'How many ways can we arrange the letters A, B, C, C, C in a row?', spec: row(L('ABCCC')) },
        { from: 'Practice 3', prompt: 'Three pairs of identical twins sit in a row of 6 chairs. Each pair of twins cannot be told apart. In how many ways can this be arranged?', spec: row(L('AABBCC')) },
        { from: 'Example 2c(i)', prompt: 'Find the number of ways the letters of the word REARRANGE can be arranged.', spec: row(L('REARRANGE')) },
      ],
      [
        { prompt: 'Find the number of arrangements of the letters of the word LEVEL.', spec: row(L('LEVEL')) },
        { prompt: 'Find the number of arrangements of the letters of the word BANANA.', spec: row(L('BANANA')) },
        { from: 'Practice 8(i)', prompt: 'Find the number of arrangements of the letters of the word SCIENCE.', spec: row(L('SCIENCE')) },
        { prompt: '3 identical red flags and 2 identical blue flags are hung in a row. How many different rows are there?', spec: row(L('RRRBB')) },
        { prompt: 'Find the number of arrangements of the letters of the word COFFEE.', spec: row(L('COFFEE')) },
      ],
      [
        { prompt: 'Find the number of arrangements of the letters of the word ASSESS.', spec: row(L('ASSESS')) },
        { prompt: 'Find the number of arrangements of the letters of the word STATISTICS.', spec: row(L('STATISTICS')) },
        { prompt: 'Find the number of arrangements of the letters of the word PEPPER.', spec: row(L('PEPPER')) },
        { prompt: '4 identical red balls and 3 identical white balls are put in a row. How many different rows are there?', spec: row(L('RRRRWWW')) },
        { prompt: 'Find the number of arrangements of the letters of the word MISSISSIPPI.', spec: row(L('MISSISSIPPI')) },
      ],
    ],
    next: 'Choosing groups (his next idea; not built yet)',
  },
];

export const PC_STEPS: readonly PcStep[] = STEPS;
export function pcStepBySlug(slug: string): PcStep | null { return STEPS.find(s => s.slug === slug) ?? null; }
export function pcAllQuestions(step: PcStep): PcQuestion[] { return [step.example, step.tryOne, ...step.sets.flat()]; }

/** His printed answers, checked by the test against the count (a slip is listed with the right number). */
export const HIS_PRINTED: { where: string; printed: number; spec: PcSpec }[] = [
  { where: 'Example 1a(iii)', printed: 26 ** 4, spec: boxes(4, 'letter', AZ) },
  { where: 'Example 1c', printed: 60, spec: row(L('ABCDE'), 3) },
  { where: 'Example 1d(ii)', printed: 604800, spec: row(P('P', 10), 7) },
  { where: 'Example 1f', printed: 4, spec: choose(L('ABCD'), 3) },
  { where: 'Example 1g', printed: 1140, spec: choose(P('P', 20), 3) },
  { where: 'Example 1h', printed: 1470, spec: choose([...P('M', 8), ...P('L', 7)], 9, [{ t: 'count', items: P('M', 8), min: 4, max: 4 }]) },
  { where: 'Example 1i(i)', printed: 84, spec: choose(P('G', 10), 4, [{ t: 'count', items: ['G1'], min: 1 }]) },
  { where: 'Example 1i(ii)', printed: 126, spec: choose(P('G', 10), 4, [{ t: 'count', items: ['G1'], max: 0 }]) },
  { where: 'Example 1j(a)', printed: 4845, spec: choose(P('S', 20), 4) },
  { where: 'Example 1k(c)', printed: 20, spec: row(L('ABCCC')) },
  { where: 'Example 1l(b)', printed: 30240, spec: row(L('PINEAPPLE')) },
  { where: 'Example 2c(i)', printed: 15120, spec: row(L('REARRANGE')) },
  { where: 'Practice 1', printed: 60, spec: row(L('MAMMAL')) },
  { where: 'Practice 3', printed: 90, spec: row(L('AABBCC')) },
  { where: 'Practice 5', printed: 60, spec: row(P('B', 5), 3) },
  { where: 'Practice 6(a)', printed: 35, spec: choose(P('x', 7), 4) },
  { where: 'Practice 7(i)', printed: 15, spec: choose(P('b', 6), 4) },
  { where: 'Practice 7(ii)', printed: 120, spec: row(P('b', 6), 3) },
  { where: 'Practice 8(i)', printed: 1260, spec: row(L('SCIENCE')) },
];

/** Slips in his notes the count disagrees with (told to him; the app uses the right number; his file is unchanged). */
export const HIS_SLIPS: { where: string; printed: string; right: string }[] = [
  { where: 'Example 1l(a), APPLE', printed: '5!/2! = 40 ways', right: '5!/2! = 60 ways' },
  { where: 'Example 1m(iii), 12 people into three groups of 4', printed: '5575', right: '5775' },
  { where: 'Example 2c, REARRANGE', printed: '"the eleven letters"', right: 'nine letters' },
  { where: 'Example 2c(iii), vowels separated', printed: '⁶C₃ (three times in the box)', right: '⁶C₄ — choose 4 of the 6 slots (his 1800 is right)' },
  { where: 'Example 3c, numbered seats (ii)', printed: '(7 − 1)! × 3! × 9 = 38800', right: '38880' },
  { where: 'Example 3c(ii)', printed: '"To arrange 7 groups in a circle: 7!"', right: '(7 − 1)! (his answer line is right)' },
  { where: 'Example 1l(b), PINEAPPLE', printed: 'P₃ P₃ P₁ in the list of six', right: 'P₃ P₂ P₁' },
];
