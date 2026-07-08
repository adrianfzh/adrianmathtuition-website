// In-code fixture used as a fallback when learning_units has no rows the caller
// can see (e.g. before the compiler pass has populated the table). One topic,
// one unit of every kind, so the player is fully demonstrable on an empty DB.
// Mirrors the Polynomials · Identities prototype (public/prototype-step-player.html).
import type { LearnUnit, LearnTopic, UnitSummary } from './learn-types';

const SUBJECT = 'AM';
const TOPIC = 'Polynomials';
const SPINE_ORDER = 6;

const IDENTITY = '3x^3 + Ax^2 - 17x - 12 \\equiv (x+1)(x-3)(Bx+C)';

export const FIXTURE_UNITS: LearnUnit[] = [
  {
    id: 'fixture-poly-core',
    subject: SUBJECT, topic: TOPIC, kind: 'core',
    title: 'What an identity means', unit_order: 601, status: 'approved',
    payload: {
      summary_md:
        'An **identity** ($\\equiv$) holds for *every* value of $x$ — not just for a few solutions. ' +
        'That freedom gives you two tools: **substitute any value of $x$**, or **compare coefficients** of matching powers.',
      formula_md: `$$${IDENTITY}$$`,
      remember_md: 'Sub values that make a bracket **zero** — that kills terms and isolates one unknown at a time.',
    },
  },
  {
    id: 'fixture-poly-example',
    subject: SUBJECT, topic: TOPIC, kind: 'example',
    title: 'Finding A, B and C', unit_order: 602.1, status: 'approved',
    payload: {
      problem_md:
        `Find the constants $A$, $B$ and $C$ such that $$${IDENTITY}$$`,
      steps: [
        {
          label: 'Start from the identity',
          math: IDENTITY,
          annotation_md: 'Two tools for identities: **sub in suitable values**, or **compare coefficients**.',
        },
        {
          label: 'Sub $x = -1$:',
          math: '\\begin{aligned} 3(-1)^3 + A(-1)^2 - 17(-1) - 12 &= 0 \\\\ -3 + A + 17 - 12 &= 0 \\\\ A &= -2 \\end{aligned}',
          annotation_md: 'Notice that when we sub $x = -1$, the factor $x+1$ becomes $0$ — the whole right-hand side collapses to $0$.',
        },
        {
          label: 'Sub $x = 0$:',
          math: '\\begin{aligned} -12 &= (0+1)(0-3)(0+C) \\\\ -12 &= -3C \\\\ C &= 4 \\end{aligned}',
          annotation_md: 'We can sub any value we like — but we usually sub values that **make things $0$**. That is the whole trick.',
        },
        {
          label: 'Compare the coefficient of $x^3$:',
          math: '3 = (1)(1)(B) \\;\\Rightarrow\\; B = 3',
          annotation_md: 'Nothing left to make zero — so switch tools and **compare coefficients**.',
        },
      ],
      decisions: [
        {
          after_step: 2,
          context_strip_md: `$${IDENTITY}$`,
          prompt_md: '$A = -2$ found. We can sub *any* value — which one hands us $C$ most directly?',
          options: [
            { label_md: 'Sub $x = 0$', ok: true, feedback_md: 'Right — the RHS becomes $(1)(-3)(C)$, so only $C$ survives.' },
            { label_md: 'Sub $x = 3$', feedback_md: 'That makes the RHS $0$ again — it only re-confirms $A=-2$. No new constant.' },
            { label_md: 'Sub $x = 7$', feedback_md: 'It works, but the arithmetic is ugly. Sub values that make things $0$ (or simple).' },
          ],
        },
      ],
      answer_md: 'So $A = -2$, $B = 3$ and $C = 4$.',
    },
  },
  {
    id: 'fixture-poly-check',
    subject: SUBJECT, topic: TOPIC, kind: 'check',
    title: 'Which value makes it vanish?', unit_order: 603.1, status: 'approved',
    payload: {
      prompt_md: 'An identity has the factor $(x+5)$. Which substitution makes it vanish?',
      options: [
        { label_md: '$x = -5$', ok: true, feedback_md: 'Yes — $x + 5 = 0$ when $x = -5$.' },
        { label_md: '$x = 5$', feedback_md: 'Sign flip — $(x+5)$ is zero when $x = -5$, not $+5$.' },
        { label_md: '$x = 2$', feedback_md: 'That would kill an $(x-2)$ factor, not $(x+5)$.' },
      ],
    },
  },
  {
    id: 'fixture-poly-autopsy',
    subject: SUBJECT, topic: TOPIC, kind: 'autopsy',
    title: 'Spot the slip', unit_order: 604.1, status: 'approved',
    payload: {
      problem_md: 'Find $A$ given $x^2 + Ax + 6 \\equiv (x+2)(x+3)$.',
      working: [
        '$x^2 + Ax + 6 \\equiv (x+2)(x+3)$',
        'Compare the constant term: $6 = 2 \\times 3$ ✓',
        'Compare the $x$ term: $A = 2 \\times 3 = 6$',
        'So $A = 6$.',
      ],
      wrong_line: 3,
      why_md: 'The coefficient of $x$ comes from the **sum** of the cross terms, not their product.',
      fix_md: 'Expanding, $(x+2)(x+3) = x^2 + 5x + 6$, so $A = 2 + 3 = 5$.',
    },
  },
  {
    id: 'fixture-poly-try',
    subject: SUBJECT, topic: TOPIC, kind: 'try',
    title: 'Your turn', unit_order: 605.1, status: 'approved',
    payload: {
      problem_md:
        'Given that $$3x^3 + x^2 - 4x + 3 = (Ax+B)(x-1)(x+2) + Cx - 1$$ for all real values of $x$, find $A$, $B$ and $C$.',
      answer_md: 'So $A = 3$, $B = -2$ and $C = 4$.',
      note_md: 'Snap a photo of your working in Practice — it gets marked line by line.',
    },
  },
];

function toSummary(u: LearnUnit): UnitSummary {
  return { id: u.id, kind: u.kind, title: u.title, unit_order: u.unit_order, status: u.status };
}

// The fixture topic, shaped exactly like a real overview topic.
export function fixtureTopic(): LearnTopic {
  return {
    subject: SUBJECT, topic: TOPIC, spine_order: SPINE_ORDER,
    units: FIXTURE_UNITS.map(toSummary),
  };
}

export function isFixtureId(id: string): boolean {
  return id.startsWith('fixture-');
}

export function getFixtureUnit(id: string): { unit: LearnUnit; siblings: UnitSummary[] } | null {
  const unit = FIXTURE_UNITS.find(u => u.id === id);
  if (!unit) return null;
  return { unit, siblings: FIXTURE_UNITS.map(toSummary) };
}
