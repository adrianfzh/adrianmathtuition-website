// The revision steps that exist (SPEC-SELF-LEARNING.md §5 — the first map is
// Sec 2 expansion and factorisation, eight steps). One step is built so far.
// A question is written as its two brackets; the working and the answer are
// derived (lib/revise-step.ts), and revise-steps.test.ts checks every one.

import type { ReviseStep } from './revise-step';

const EXPAND_TWO_BRACKETS: ReviseStep = {
  slug: 'expand-two-brackets',
  index: 2,
  of: 8,
  title: 'Expand two brackets',
  idea: [
    'Every term in the first bracket multiplies every term in the second.',
    'Two terms times two terms makes four pieces. Then collect the like terms.',
  ],
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
};

export const REVISE_STEPS: readonly ReviseStep[] = [EXPAND_TWO_BRACKETS];

export function reviseStepBySlug(slug: string): ReviseStep | null {
  return REVISE_STEPS.find(s => s.slug === slug) ?? null;
}
