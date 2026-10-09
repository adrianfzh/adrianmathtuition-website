// The revision steps that exist (SPEC-SELF-LEARNING.md §5 — the first map is
// Sec 2 expansion and factorisation, eight steps). The four expansion steps are built so far.
// A question is written as its two brackets; the working and the answer are
// derived (lib/revise-step.ts), and revise-steps.test.ts checks every one.

import type { ReviseStep } from './revise-step';

const EXPAND_ONE_BRACKET: ReviseStep = {
  slug: 'expand-one-bracket',
  index: 1,
  of: 8,
  title: 'Expand one bracket',
  idea: [
    'The term outside multiplies every term inside the bracket.',
    'When the term outside is negative, every sign inside changes.',
  ],
  example: '2(a+3b)',
  tryOne: '5(2x-3)',
  // Each five climbs: a number outside → a minus inside → a negative outside → a letter outside → both.
  sets: [
    ['3(x+4)', '5(2a-3)', '-2(x+6)', 'x(x+7)', '2x(3x-5)'],
    ['4(y+9)', '7(3m-2)', '-3(2x-5)', 'a(a-8)', '3a(2a+b)'],
    ['6(2p+5)', '2(4x-7y)', '-5(a-3b)', 'y(2y+3)', '-x(x-4)'],
    ['8(x+3)', '9(2t-1)', '-4(3x+2)', 'm(5-m)', '4x(2x-3y)'],
  ],
  next: 'Expand two brackets',
  nextSlug: 'expand-two-brackets',
};

const EXPAND_TWO_BRACKETS: ReviseStep = {
  slug: 'expand-two-brackets',
  index: 2,
  of: 8,
  title: 'Expand two brackets',
  idea: [
    'Every term in the first bracket multiplies every term in the second.',
    'Two terms times two terms makes four pieces. Then collect the like terms.',
  ],
  clipSlug: 'expand-two-brackets-s2',
  example: '(x+3)(x-2)',
  tryOne: '(x-4)(x+6)',
  // Each five climbs: both plus → one minus → two minus → a number in front of x → both.
  sets: [
    ['(x+2)(x+7)', '(x+5)(x-3)', '(x-6)(x-2)', '(2x+1)(x+4)', '(3x-2)(x-5)'],
    ['(x+4)(x+9)', '(x-8)(x+3)', '(x-3)(x-7)', '(2x-3)(x+5)', '(4x+1)(2x-3)'],
    ['(a+6)(a+2)', '(y-5)(y+9)', '(m-9)(m-2)', '(3x+2)(x+6)', '(2x-5)(3x-1)'],
    ['(x+1)(x+8)', '(t+7)(t-4)', '(x-10)(x-3)', '(5x+2)(x-1)', '(2a-7)(3a+2)'],
  ],
  next: 'Perfect squares',
  nextSlug: 'perfect-squares',
};

const PERFECT_SQUARES: ReviseStep = {
  slug: 'perfect-squares',
  index: 3,
  of: 8,
  title: 'Perfect squares',
  idea: [
    'A bracket squared is the bracket times itself: (a + b)² = (a + b)(a + b).',
    'The two middle pieces are the same, so the answer has twice that piece.',
  ],
  example: '(x+3)^2',
  tryOne: '(x-4)^2',
  // Each five climbs: plus → minus → a number in front of x → both → two letters.
  sets: [
    ['(x+4)^2', '(x-5)^2', '(2x+1)^2', '(3x-2)^2', '(x+2y)^2'],
    ['(x+7)^2', '(a-3)^2', '(3x+4)^2', '(2a-5)^2', '(2x-y)^2'],
    ['(y+6)^2', '(x-9)^2', '(4x+1)^2', '(5x-2)^2', '(a+3b)^2'],
    ['(m+8)^2', '(t-1)^2', '(2x+7)^2', '(4a-3)^2', '(3x-2y)^2'],
  ],
  next: 'Difference of squares',
  nextSlug: 'difference-of-squares',
};

const DIFFERENCE_OF_SQUARES: ReviseStep = {
  slug: 'difference-of-squares',
  index: 4,
  of: 8,
  title: 'Difference of squares',
  idea: [
    'The two brackets are the same except for the sign in the middle.',
    'The two middle pieces cancel, leaving a square minus a square.',
  ],
  example: '(x+3)(x-3)',
  tryOne: '(x-6)(x+6)',
  // Each five climbs: plus first → minus first → a number in front of x → both → two letters.
  sets: [
    ['(x+5)(x-5)', '(x-8)(x+8)', '(2x+3)(2x-3)', '(3a-1)(3a+1)', '(x+2y)(x-2y)'],
    ['(x+2)(x-2)', '(y-7)(y+7)', '(4x+1)(4x-1)', '(5a-2)(5a+2)', '(3x+y)(3x-y)'],
    ['(a+9)(a-9)', '(m-6)(m+6)', '(2x+5)(2x-5)', '(7x-1)(7x+1)', '(a+4b)(a-4b)'],
    ['(x+10)(x-10)', '(t-3)(t+3)', '(3x+4)(3x-4)', '(6a-5)(6a+5)', '(2x+3y)(2x-3y)'],
  ],
  next: 'Take out a common factor',
};

export const REVISE_STEPS: readonly ReviseStep[] = [EXPAND_ONE_BRACKET, EXPAND_TWO_BRACKETS, PERFECT_SQUARES, DIFFERENCE_OF_SQUARES];

/** The revision step a clip belongs to, so the clip can hand the student on to it. */
export function reviseStepForClip(clipSlug: string): ReviseStep | null {
  return REVISE_STEPS.find(s => s.clipSlug === clipSlug) ?? null;
}

export function reviseStepBySlug(slug: string): ReviseStep | null {
  return REVISE_STEPS.find(s => s.slug === slug) ?? null;
}
