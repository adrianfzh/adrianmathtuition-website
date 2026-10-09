// The LEARN steps that exist (SPEC-SELF-LEARNING.md §4a). The first chapter is
// Sec 2 "Algebra 1: Expansion", in the order of Adrian's own notes
// (Dropbox/1 ONLINE LESSONS/1 NOTES/4 Notes S2 Math G3/S2 MATH 01 Algebra 1
// Expansion.pdf) — his examples, his methods, his margin words; the first set of
// five in a step is his own Practice where the notes have one. Built so far:
// all eleven ideas.
// learn-step.test.ts checks every question, every written line and his printed answers.

import {
  evaluateSquare, foldIntoSquare as fold, henceProduct, henceSquare, squareFromSumAndProduct as sq,
  sumFromSquareAndProduct as sm, type LearnStep,
} from './learn-step';

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
  clipSlug: 'expand-and-simplify-s2',
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
  clipSlug: 'number-in-front-s2',
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
  clipSlug: 'further-expansion-s2',
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
  next: 'Expansion with fractions',
  nextSlug: 'expansion-with-fractions',
};

const WITH_FRACTIONS: LearnStep = {
  slug: 'expansion-with-fractions',
  index: 6,
  of: OF,
  title: 'Expansion with fractions',
  ask: 'Expand and simplify',
  idea: [
    'Expand as usual, with the Rainbow. Just that you multiply with fractions now.',
    'Multiply the tops, multiply the bottoms, then simplify: ¼ × 4b = b.',
  ],
  trap: 'Multiply the fraction into every term, and simplify each piece.',
  // His Practice 3 a and c; d and the squares from Practice 4 and Assignment 1 are in the fives.
  example: '1/4(2a-4b)',
  tryOne: '5/2(6x+8y)',
  sets: [
    ['3/4(8x-12)', '2/3(9a+6b)', '(1/2x+1/3y)(2/3x-1/2y)', '(2x-1/2)^2', '(1/4a+b)^2'],
    ['1/2(4x+10)', '-1/3(6a-9b)', '(x+1/2)(x-1/2)', '(3a-2/5b)^2', '(2/5a+1/6b)^2'],
    ['3/5(10m-15n)', '1/6(12x+18y)', '(1/2x+3)(4x-2)', '(x+1/3)^2', '(1/2a-4)^2'],
    ['5/4(8p+4q)', '-1/2(6x-3)', '(2/3x-1)(3x+6)', '(1/3x+3y)^2', '(x-3/2)^2'],
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
  clipSlug: 'special-products-s2',
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
  nextSlug: 'special-products-mixed',
};

const SPECIAL_PRODUCTS_MIXED: LearnStep = {
  slug: 'special-products-mixed',
  index: 8,
  of: OF,
  title: 'Special products with other terms',
  ask: 'Expand and simplify',
  idea: [
    'Use the formula on each square first. Then add up like terms.',
    'A square that is subtracted goes in a bracket first: every sign in it changes.',
  ],
  trap: 'A minus sign in front of a square changes every sign in its expansion.',
  example: {
    q: '(3a+1)+(3a-1)^2',
    lines: [
      { tex: '(3a + 1) + (3a - 1)^{2}' },
      { tex: '= (3a + 1) + (3a)^{2} - 2(3a)(1) + 1^{2}', why: '(a − b)² = a² − 2ab + b²' },
      { tex: '= 3a + 1 + 9a^{2} - 6a + 1' },
      { tex: '= 9a^{2} + 3a - 6a + 1 + 1', why: 'Group like terms together' },
      { tex: '= 9a^{2} - 3a + 2', why: 'Add up like terms' },
    ],
  },
  tryOne: {
    q: '(x-3y)^2-(x+y)^2',
    lines: [
      { tex: '(x - 3y)^{2} - (x + y)^{2}' },
      { tex: '= x^{2} - 2(x)(3y) + (3y)^{2} - (x^{2} + 2(x)(y) + y^{2})', why: 'The second square stays in a bracket' },
      { tex: '= x^{2} - 6xy + 9y^{2} - (x^{2} + 2xy + y^{2})' },
      { tex: '= x^{2} - 6xy + 9y^{2} - x^{2} - 2xy - y^{2}', why: 'Every sign in the bracket changes' },
      { tex: '= x^{2} - x^{2} - 6xy - 2xy + 9y^{2} - y^{2}', why: 'Group like terms together' },
      { tex: '= -8xy + 8y^{2}', why: 'Add up like terms' },
    ],
  },
  sets: [
    // His Practice 4, Q4: the questions with the smiley faces (c, d, f, g, h).
    ['(2y-3)^2+(2y+3)^2', '(7a-2b)^2-(5a+4b)^2', '(x+2y)(3x-5y)-4(x-y)^2', '(a+b)(5a+3b)+(a+b)^2', '10m^2-(7m^2-n)-(m-n)^2'],
    // His Assignment 1, Q2 a–e.
    ['(2x+1)(x-3)-2(x+3)^2', '(3y+1)^2+2(3y-1)^2', '(a+4)^2-(a-4)^2', '(6m-3n)^2-(2m+5n)^2', '4a(a+4)-(a+1)^2'],
    // His Assignment 1, Q2 f and Practice 4, Q4 e, then three like them.
    ['3(2a-3)^2-2(2a-3)(2a+3)', '(3-m)(m+3)-2m+6(m+1)^2', '(x+1)^2+(x-1)^2', '(x+5)^2-x(x+3)', '2(a-1)^2+(a+2)^2'],
    ['(y+2)^2-(y-3)^2', '(2x-1)^2+3x(x+2)', '(a+b)^2-(a-b)^2', '5-(x-2)^2', '(3p+q)^2-(p-3q)^2'],
  ],
  next: 'Using the identity',
  nextSlug: 'using-the-identity',
};

const USING_THE_IDENTITY: LearnStep = {
  slug: 'using-the-identity',
  index: 9,
  of: OF,
  title: 'Using the identity',
  ask: 'Find the value',
  idea: [
    '(a + b)² = a² + 2ab + b² joins three things: the square, a² + b², and ab.',
    'Know any two of them and the formula gives the third.',
  ],
  trap: 'Write the formula first. Then put in the two values you are given: 2ab is twice the value of ab.',
  // His Example 5a, and Example 5b with ab given directly.
  example: sq('a', 'b', 30, -6, '+'),
  tryOne: sm('a', 'b', 9, 12, '-'),
  sets: [
    // The first three are his Practice 5a, Q1 and Q2, and Assignment 1, Q6 written with its square.
    [sq('x', 'y', 29, 10, '-'), sm('x', 'y', 58, 6, '-'), sm('x', 'y', 100, 2, '-'), sq('p', 'q', 20, 8, '+'), sm('a', 'b', 49, 12, '+')],
    [sq('a', 'b', 34, 15, '+'), sq('x', 'y', 41, 20, '-'), sm('x', 'y', 64, 15, '+'), sm('p', 'q', 4, 21, '-'), sq('m', 'n', 13, -6, '+')],
    [sq('x', 'y', 25, 12, '+'), sq('a', 'b', 50, 7, '-'), sm('a', 'b', 81, 20, '+'), sm('x', 'y', 16, 6, '-'), sq('p', 'q', 45, -18, '-')],
    [sq('m', 'n', 52, 24, '+'), sq('x', 'y', 61, 30, '-'), sm('p', 'q', 121, 30, '+'), sm('a', 'b', 25, 14, '-'), sm('x', 'y', 36, -8, '+')],
  ],
  next: 'Without a calculator',
  nextSlug: 'without-a-calculator',
};

const WITHOUT_A_CALCULATOR: LearnStep = {
  slug: 'without-a-calculator',
  index: 10,
  of: OF,
  title: 'Without a calculator',
  ask: 'Find the value',
  idea: [
    'Rewrite the number as a round number plus or minus a small one: 399 = 400 − 1.',
    'Then it is a special product, and the formula does the rest.',
  ],
  trap: 'The middle term is twice the product of the two numbers: 2 × round number × small number.',
  // His Example 5c.
  example: evaluateSquare(399),
  tryOne: evaluateSquare(702),
  sets: [
    // His Practice 5b, Q1 and Q2, and Assignment 1, Q7 a and b.
    [evaluateSquare(1001), evaluateSquare(997), evaluateSquare(3999), evaluateSquare(204), evaluateSquare(98)],
    [evaluateSquare(101), evaluateSquare(199), evaluateSquare(502), evaluateSquare(298), evaluateSquare(1003)],
    [evaluateSquare(201), evaluateSquare(99), evaluateSquare(603), evaluateSquare(798), evaluateSquare(2001)],
    [evaluateSquare(301), evaluateSquare(49), evaluateSquare(405), evaluateSquare(999), evaluateSquare(5002)],
  ],
  next: '"Hence" questions',
  nextSlug: 'hence-questions',
};

const HENCE_QUESTIONS: LearnStep = {
  slug: 'hence-questions',
  index: 11,
  of: OF,
  title: '"Hence" questions',
  ask: 'Find the value',
  idea: [
    '"Hence" means: use what you have just found. Do not start again.',
    'Compare the numbers with the letters in part (a), and work out what each letter stands for.',
  ],
  trap: 'Compare the numbers with the letters first. Then use the answer to part (a) — do not multiply the big numbers out.',
  // His Practice 5b, Q3 and Q4.
  example: henceProduct(2018, 5),
  tryOne: henceSquare(300),
  sets: [
    // The first two are his Practice 5b, Q6 and Q7.
    [fold(65, 5, '+'), fold(213, 113, '-'), henceProduct(100, 3), henceSquare(200), fold(47, 3, '+')],
    [fold(98, 2, '+'), fold(105, 5, '-'), henceProduct(250, 4), henceSquare(500), fold(321, 121, '-')],
    [fold(36, 4, '+'), fold(57, 7, '-'), henceProduct(1000, 6), henceSquare(400), fold(88, 12, '+')],
    [fold(75, 5, '+'), fold(109, 9, '-'), henceProduct(3000, 7), henceSquare(1000), fold(456, 256, '-')],
  ],
};

export const LEARN_STEPS: readonly LearnStep[] = [
  ONE_BRACKET, EXPAND_AND_SIMPLIFY, TWO_BRACKETS, NUMBER_IN_FRONT, FURTHER_EXPANSION, WITH_FRACTIONS, SPECIAL_PRODUCTS,
  SPECIAL_PRODUCTS_MIXED, USING_THE_IDENTITY, WITHOUT_A_CALCULATOR, HENCE_QUESTIONS,
];

/** The step a clip belongs to, so the clip can hand the student on to it. */
export function learnStepForClip(clipSlug: string): LearnStep | null {
  return LEARN_STEPS.find(s => s.clipSlug === clipSlug) ?? null;
}

export function learnStepBySlug(slug: string): LearnStep | null {
  return LEARN_STEPS.find(s => s.slug === slug) ?? null;
}
