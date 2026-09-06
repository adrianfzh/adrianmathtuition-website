// Portal onboarding — the step list for the first-login tour and the stages of
// the "you are here" flow strip. Pure data-building only (no React, no
// next/headers), so both the client components and the tests can import it.
//
// The whole point of keeping this here: during the marking-only beta
// (lib/portal-beta.ts) a student can reach only Practise / Submit / Marked +
// Settings, and a tour step that points at a tab the student does not have is
// worse than no tour at all. Callers pass what is actually live for THIS
// viewer (server-resolved) and every step that comes back lands on something
// tappable right now.

/** What the logged-in viewer can actually reach inside /app. */
export type PortalSurfaces = {
  /** /app/practice — open to students during the beta. */
  practice: boolean;
  /** /app/learn — admin-only while LEARN_OPEN_TO_STUDENTS is false. */
  learn: boolean;
  /** /app/notes → the revision-notes reader — hidden during the beta. */
  notes: boolean;
};

export type TourStep = {
  key: string;
  emoji: string;
  title: string;
  body: string;
  /**
   * `data-tour` value of the nav item (or region) to ring. Null = no
   * highlight, just the card — used by the welcome step.
   */
  target: string | null;
};

/** localStorage: set once the tour has been seen or skipped on this device. */
export const PORTAL_TOUR_KEY = 'portal_tour_v1';

/**
 * Steps for the first-login tour, trimmed to what this viewer can use. 4 steps
 * in the marking-only beta with Practise closed, 5 with it open, and still 5
 * on the full portal (Learn/Notes ride along in the last step rather than
 * pushing the tour to six taps on a phone).
 */
export function buildTourSteps(s: PortalSurfaces): TourStep[] {
  // One screen (Adrian, 7 Sep 2026: "shorten the welcome tour to one screen"):
  // what the app is for, in one sentence, and the one thing to do first. The
  // surfaces argument stays so a fuller tour can return later without changing callers.
  void s;
  return [{
    key: 'welcome',
    emoji: '👋',
    title: 'This is your AdrianMath app',
    body: 'Hand in a paper, get it back marked with a cover page that shows where your marks went, then practise exactly that. Start with Papers.',
    target: 'marking',
  }];
}

export type FlowStageKey = 'practice' | 'submit' | 'marking' | 'notes';

export type FlowStage = {
  key: FlowStageKey;
  label: string;
  emoji: string;
  href: string;
  /** One-line "how this fits", shown only while this stage is the current one. */
  hint: string;
  current: boolean;
};

const STAGES: Record<FlowStageKey, Omit<FlowStage, 'current'>> = {
  practice: {
    key: 'practice',
    label: 'Practise',
    emoji: '✏️',
    href: '/app/practice',
    hint: 'Single questions, marked as you go. Hand in a whole paper when you want the full thing checked.',
  },
  submit: {
    key: 'submit',
    label: 'Hand in',
    emoji: '📷',
    href: '/app/submit',
    hint: 'Snap the pages here — the marked script comes back under Marked work.',
  },
  marking: {
    key: 'marking',
    label: 'Marked work',
    emoji: '📄',
    href: '/app/marking',
    hint: 'This is where a paper you handed in ends up. Weak topic? Tap it and practise it.',
  },
  notes: {
    key: 'notes',
    label: 'Notes',
    emoji: '📚',
    href: '/app/notes',
    hint: 'Read the notes first, then practise the topic.',
  },
};

/**
 * The journey, in order, with `current` marked. Stages the viewer cannot reach
 * are dropped — no dead links in the strip. Notes leads the journey when it is
 * live (read → practise → hand in → marked).
 */
export function buildFlowStages(s: PortalSurfaces, current: FlowStageKey): FlowStage[] {
  const order: FlowStageKey[] = [
    ...(s.notes ? (['notes'] as FlowStageKey[]) : []),
    ...(s.practice ? (['practice'] as FlowStageKey[]) : []),
    'submit',
    'marking',
  ];
  return order.map(key => ({ ...STAGES[key], current: key === current }));
}

/** localStorage key for the per-page dismissal of the flow strip. */
export function flowStripKey(current: FlowStageKey): string {
  return `portal_flow_v1_${current}`;
}
