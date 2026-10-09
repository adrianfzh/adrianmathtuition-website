// The LEARN steps that exist (SPEC-SELF-LEARNING.md §4a). The first chapter is
// Sec 2 "Algebra 1: Expansion", in the order of Adrian's own notes
// (Dropbox/1 ONLINE LESSONS/1 NOTES/4 Notes S2 Math G3/S2 MATH 01 Algebra 1
// Expansion.pdf) — his examples, his methods, his margin words; the first set of
// five in a step is his own Practice where the notes have one. Built so far:
// ideas 1–5 and 7 of the eleven; 6 (fractions) and 8–11 are still to come.
// learn-step.test.ts checks every question, every written line and his printed answers.

import type { LearnStep } from './learn-step';

const OF = 11;

const ONE_BRACKET: LearnStep = {
  slug: 'expand-one-bracket',
  index: 1,
  of: OF,
  title: 'Expand one bracket',
  ask: 'Expand',
  idea: [
    'The term outside multiplies every term inside the bracket.',
    'When the term outside is negative, every sign inside changes.',
  ],
  clipSlug: 'expand-one-bracket-s2',
  example: '2(a+3b)',
  tryOne: '-2b(3-4b+6c)',
  // Each five climbs: a number outside → a minus inside → a negative outside → a letter outside → both.
  sets: [
    ['3(x+4)', '5(2a-3)', '-2(x+6)', 'x(x+7)', '2x(3x-5)'],
    ['4(y+9)', '7(3m-2)', '-3(2x-5)', 'a(a-8)', '3a(2a+b)'],
    ['6(2p+5)', '2(4x-7y)', '-5(a-3b)', 'y(2y+3)', '-x(x-4)'],
    ['8(x+3)', '9(2t-1)', '-4(3x+2)', 'm(5-m)', '2a(3-4a+5b)'],
  ],
  next: 'Expand and simplify',
  nextSlug: 'expand-and-simplify',
};

const EXPAND_AND_SIMPLIFY: LearnStep = {
  slug: 'expand-and-simplify',
  index: 2,
  of: OF,
  title: 'Expand and simplify',
  ask: 'Expand and simplify',
  idea: [
    'Expand the bracket first. Then add up like terms.',
    'The sign in front of the bracket goes with its number: − 2( … ) multiplies by −2.',
  ],
  trap: 'A minus in front of a bracket changes every sign inside it.',
  example: {
    q: '4a-2(4a+5b)',
    lines: [
      { tex: '4a - 2(4a + 5b)' },
      { tex: '= 4a - 8a - 10b', why: 'Expand' },
      { tex: '= -4a - 10b', why: 'Add up like terms' },
    ],
  },
  tryOne: {
    q: '5x+3(2x-4)',
    lines: [
      { tex: '5x + 3(2x - 4)' },
      { tex: '= 5x + 6x - 12', why: 'Expand' },
      { tex: '= 11x - 12', why: 'Add up like terms' },
    ],
  },
  // Each five climbs: plus in front → minus in front → bracket first → two letters → two brackets.
  sets: [
    ['3x+2(x+5)', '7a-3(a+2)', '2(3y-1)+4y', '6p-2(p-3q)', '5(x+2)-3(x-1)'],
    ['4a+3(a-2)', '9x-4(x+3)', '3(2m+5)-m', '8a-2(3a-b)', '2(x+4)-5(x-2)'],
    ['2y+5(y+1)', '10k-3(2k+1)', '4(2a-3)+7a', '5x-3(x-2y)', '3(a+2b)-2(a-b)'],
    ['x+6(x-2)', '12m-5(m+2)', '2(5t-1)-3t', '7a-4(2a-3b)', '4(x-1)-2(3x-5)'],
  ],
  next: 'Expand two brackets',
  nextSlug: 'expand-two-brackets',
};

const TWO_BRACKETS: LearnStep = {
  slug: 'expand-two-brackets',
  index: 3,
  of: OF,
  title: 'Expand two brackets',
  ask: 'Expand and simplify',
  idea: [
    'Every term in the first bracket multiplies every term in the second.',
    'Two terms times two terms makes four pieces. Then add up like terms.',
  ],
  clipSlug: 'expand-two-brackets-s2',
  example: '(a+b)(a-3b)',
  tryOne: '(3x-5)(2x-y)',
  sets: [
    // His Practice 1a, a–e.
    ['(a+b)(2a+3b)', '(3a-b)(4a-b)', '(3p+2)(5p-4)', '(3-k)(4+9k)', '(x^2+4x)(x^2-2)'],
    ['(x+2)(x+7)', '(x+5)(x-3)', '(x-6)(x-2)', '(2x+1)(x+4)', '(3x-2)(x-5)'],
    ['(x+4)(x+9)', '(y-5)(y+9)', '(m-9)(m-2)', '(2x-3)(x+5)', '(2x-5)(3x-y)'],
    ['(a+6)(a+2)', '(t+7)(t-4)', '(x-10)(x-3)', '(5x+2)(x-1)', '(2a-7b)(3a+2b)'],
  ],
  next: 'A number in front',
  nextSlug: 'number-in-front',
};

const NUMBER_IN_FRONT: LearnStep = {
  slug: 'number-in-front',
  index: 4,
  of: OF,
  title: 'A number in front',
  ask: 'Expand and simplify',
  idea: [
    'With three things multiplied together, do two of them first.',
    'The first two first, or the last two first: the answer is the same.',
  ],
  trap: 'The number in front multiplies once, into one bracket only. Then expand the two brackets.',
  example: {
    q: '2(p-3q)(r+3s)',
    lines: [
      { tex: '2(p - 3q)(r + 3s)' },
      { tex: '= (2p - 6q)(r + 3s)', why: 'Expand the first two first' },
      { tex: '= 2pr + 6ps - 6qr - 18qs', why: 'Then the two brackets' },
    ],
  },
  tryOne: {
    q: '3(2a+1)(2a+5)',
    lines: [
      { tex: '3(2a + 1)(2a + 5)' },
      { tex: '= (6a + 3)(2a + 5)', why: 'Expand the first two first' },
      { tex: '= 12a^{2} + 30a + 6a + 15', why: 'Then the two brackets' },
      { tex: '= 12a^{2} + 36a + 15', why: 'Add up like terms' },
    ],
  },
  sets: [
    // The first two are his Practice 1a, g and h.
    ['2(4+3u)(2-5u)', '-5(3m-2)(m+1)', '2(x+1)(x+3)', '3(a-2)(a+4)', '-2(x-3)(x+5)'],
    ['4(x+2)(x+5)', '2(3y-1)(y+4)', '-3(a+2)(a-6)', '5(2x-1)(x-3)', '-2(3p+q)(p-2q)'],
    ['3(x+1)(x+6)', '2(2a+3)(a-5)', '-4(m-1)(m+3)', '6(x-2)(2x+1)', '-3(a-2b)(2a+b)'],
    ['5(x+3)(x+4)', '3(4t-1)(t+2)', '-2(k+5)(k-1)', '4(3x-2)(x-1)', '-5(2x+y)(x-3y)'],
  ],
  next: 'Further expansion',
  nextSlug: 'further-expansion',
};

const FURTHER_EXPANSION: LearnStep = {
  slug: 'further-expansion',
  index: 5,
  of: OF,
  title: 'Further expansion',
  ask: 'Expand and simplify',
  idea: [
    'Expand each part that has brackets. Then group like terms together and add them up.',
    'Note a minus sign in front of an expansion: keep the expansion in a bracket, then expand again.',
  ],
  trap: 'A minus sign in front of an expansion changes every sign in it.',
  example: {
    q: '2(a+5)-(4a+3)(2a-7)',
    lines: [
      { tex: '2(a + 5) - (4a + 3)(2a - 7)' },
      { tex: '= 2a + 10 - (8a^{2} - 28a + 6a - 21)', why: 'Expand. Note the minus sign in front of the second expansion' },
      { tex: '= 2a + 10 - 8a^{2} + 28a - 6a + 21', why: 'Expand again' },
      { tex: '= -8a^{2} + 2a + 28a - 6a + 10 + 21', why: 'Group like terms together' },
      { tex: '= -8a^{2} + 24a + 31', why: 'Add up like terms' },
    ],
  },
  tryOne: {
    q: '(3x-8y)(2x+3y)-3xy',
    lines: [
      { tex: '(3x - 8y)(2x + 3y) - 3xy' },
      { tex: '= 6x^{2} + 9xy - 16xy - 24y^{2} - 3xy', why: 'Expand' },
      { tex: '= 6x^{2} + 9xy - 16xy - 3xy - 24y^{2}', why: 'Group like terms together' },
      { tex: '= 6x^{2} - 10xy - 24y^{2}', why: 'Add up like terms' },
    ],
  },
  sets: [
    // His Practice 1b, a–e.
    ['(x-6y)(2x+5y)+3xy', '(2x+4)(3x-5)-4(x+2)', '(x-4)(2x+1)+7(x+2)(x-1)', '7x-(2x-1)(4x+5)', '(9a-2b)(3a+2b)-(4a-3b)(3a-2b)'],
    // His Practice 1b f and Assignment 1, Q1 a, b, d.
    ['3(x+2)-(x+1)(x-4)', '9x-(2x-1)(4x+5)', '(x-6y)(2x+3y)+6xy', '(x-3)(2x+4)-3(x+5)(x-1)', '(x+3)(x-1)-3(2x+1)(4x-3)'],
    ['(x+2)(x+5)-4x', '5a-(a+3)(a-2)', '(2x-1)(x+3)+2(x-4)', '(a+2b)(a-b)-ab', '(x+4)(x-2)-(x-1)(x+3)'],
    ['(y-3)(y+6)+2y', '8m-(2m+1)(m-5)', '(3x+2)(x-1)-3(x+2)', '(2a-b)(a+3b)+5ab', '(x+1)(x+5)-(x-2)(x-3)'],
  ],
  next: 'Special products',
  nextSlug: 'special-products',
};

const SPECIAL_PRODUCTS: LearnStep = {
  slug: 'special-products',
  index: 7,
  of: OF,
  title: 'Special products',
  ask: 'Expand',
  idea: [
    '(a + b)² = a² + 2ab + b²   and   (a − b)² = a² − 2ab + b².',
    'Square the first, twice the product, square the last.',
  ],
  // 'perfect-squares-s2' was written with arrows; it is being redone his way (the formula) before it is joined.
  example: '(2p+3q)^2',
  tryOne: '(5m-2n)^2',
  sets: [
    // His Practice 4, Q1 a, b, c, e, g.
    ['(4a+2b)^2', '(x+7y)^2', '(5x+2)^2', '(2a-3b)^2', '(x-7y)^2'],
    // His Practice 4, Q1 d, f, h and Examples b, d.
    ['(8p+q)^2', '(4a-2b)^2', '(5x-2)^2', '(2x+7)^2', '(9w-4)^2'],
    ['(x+3)^2', '(x-5)^2', '(3x+4)^2', '(2a-5b)^2', '(6m+n)^2'],
    ['(y+6)^2', '(t-1)^2', '(4x+1)^2', '(3x-2y)^2', '(7a-3)^2'],
  ],
  next: 'Special products with other terms',
};

export const LEARN_STEPS: readonly LearnStep[] = [
  ONE_BRACKET, EXPAND_AND_SIMPLIFY, TWO_BRACKETS, NUMBER_IN_FRONT, FURTHER_EXPANSION, SPECIAL_PRODUCTS,
];

/** The step a clip belongs to, so the clip can hand the student on to it. */
export function learnStepForClip(clipSlug: string): LearnStep | null {
  return LEARN_STEPS.find(s => s.clipSlug === clipSlug) ?? null;
}

export function learnStepBySlug(slug: string): LearnStep | null {
  return LEARN_STEPS.find(s => s.slug === slug) ?? null;
}
