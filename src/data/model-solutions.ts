// ── Annotated model solutions — the public library's content source ──────────
//
// File-based on purpose: this is curated editorial content (the math analogue of
// a model-essay library), not student data, so it lives in the repo, ships with
// the deploy and is statically rendered. NO database. Adrian curates entries by
// editing this file; `published: false` keeps a draft off the public site.
//
// House rules for authoring an entry:
//   • Questions must be ORIGINAL — written fresh, never copied from a school or
//     national paper. The whole point is proof-of-teaching-quality we own.
//   • Every step carries a `why_md`: not what was done (the step already shows
//     that) but *why it earns its mark* — the examiner's reason.
//   • `mark` uses the O-Level marking vocabulary: M1 = method, A1 = accuracy,
//     B1 = independent/stand-alone mark. Omit it when a step is scaffolding
//     rather than a scoring line.
//   • Markdown + LaTeX (`$…$` inline, `$$…$$` display) — rendered through
//     `lib/math-markdown.tsx`, the single math pipeline in this repo.
//   • Display math (`$$…$$`) must start its own line with a BLANK line before
//     it. `**(c)** $$…$$` on one line renders as literal dollar signs — remark
//     needs a block boundary, and the newline `fixMathFences` inserts is only a
//     soft break inside the paragraph. There is a test for this.
//   • `title` and `seo.description` are PLAIN TEXT, no LaTeX: they go straight
//     into <title>, the meta description and the OG card, none of which render
//     math. Write "the range of k", not "$k$".

export type SolutionLevel = 'S3_AM' | 'S3_EM' | 'S4_AM' | 'S4_EM' | 'JC_H2';

/** Display labels for the level codes, used by the index and the SEO copy. */
export const LEVEL_LABELS: Record<SolutionLevel, string> = {
  S3_AM: 'Secondary 3 A Math',
  S3_EM: 'Secondary 3 E Math',
  S4_AM: 'Secondary 4 A Math',
  S4_EM: 'Secondary 4 E Math',
  JC_H2: 'JC H2 Math',
};

/** Order levels appear in on the index, easiest first. */
export const LEVEL_ORDER: SolutionLevel[] = ['S3_EM', 'S3_AM', 'S4_EM', 'S4_AM', 'JC_H2'];

export type MarkCode = 'M1' | 'A1' | 'B1' | (string & {});

export interface SolutionStep {
  /** The working itself, in markdown + LaTeX. */
  step_md: string;
  /** Why this line earns its mark — the annotation shown beside the step. */
  why_md: string;
  /** Marking-scheme code, when the step is a scoring line. */
  mark?: MarkCode;
}

export interface ModelSolution {
  slug: string;
  title: string;
  level: SolutionLevel;
  topic: string;
  published: boolean;
  question_md: string;
  steps: SolutionStep[];
  answer_md: string;
  seo: { description: string };
}

export const MODEL_SOLUTIONS: ModelSolution[] = [
  {
    slug: 'discriminant-two-distinct-roots-range-of-k',
    title: 'Discriminant: the range of k for two distinct real roots',
    level: 'S3_AM',
    topic: 'Quadratic Functions',
    published: true,
    seo: {
      description:
        'A fully annotated O-Level A Math model solution: using the discriminant to find the range of values of k for which x² + (k + 2)x + (2k + 1) = 0 has two distinct real roots — with the reason each line earns its mark.',
    },
    question_md: [
      'The equation',
      '',
      '$$x^2 + (k + 2)x + (2k + 1) = 0$$',
      '',
      'has two distinct real roots. Find the range of values of $k$.',
      '',
      '*(4 marks)*',
    ].join('\n'),
    steps: [
      {
        step_md:
          'Comparing with $ax^2 + bx + c = 0$: $\\; a = 1$, $\\; b = k + 2$, $\\; c = 2k + 1$.',
        why_md:
          'Write the coefficients down before touching the discriminant. Nearly every lost mark here starts with $b = k$ instead of $b = k + 2$ — the bracket is part of the coefficient.',
      },
      {
        step_md: 'Two distinct real roots $\\;\\Rightarrow\\; b^2 - 4ac > 0$',
        why_md:
          'This is the mark for translating the *words* into a condition. "Two distinct real roots" is strictly greater than zero — $\\geq$ would allow the repeated root the question has excluded. State the condition explicitly; an examiner cannot award this from working alone.',
        mark: 'M1',
      },
      {
        step_md: '$$(k + 2)^2 - 4(1)(2k + 1) > 0$$',
        why_md:
          'Substitution done in one clean line, brackets intact. Keep the $4(1)(2k+1)$ unexpanded for a moment — expanding and substituting in the same breath is where sign slips happen.',
        mark: 'M1',
      },
      {
        step_md: [
          '$$k^2 + 4k + 4 - 8k - 4 > 0$$',
          '',
          '$$k^2 - 4k > 0$$',
        ].join('\n'),
        why_md:
          'Expand and simplify. Note $-4(2k + 1) = -8k - 4$: the $4$ must be distributed across *both* terms. The constants cancel, which is a good sign you have expanded $(k+2)^2$ correctly.',
      },
      {
        step_md: '$$k(k - 4) > 0$$',
        why_md:
          'Factorise rather than reaching for the quadratic formula. A quadratic inequality is solved from its roots, so getting to factored form *is* the method — here the critical values are $k = 0$ and $k = 4$.',
        mark: 'M1',
      },
      {
        step_md: [
          'The curve $y = k(k - 4)$ is a $\\cup$-shaped parabola cutting the axis at $0$ and $4$, so it is **above** the axis outside the roots:',
          '',
          '$$k < 0 \\quad \\text{or} \\quad k > 4$$',
        ].join('\n'),
        why_md:
          'The accuracy mark. Sketch the parabola — positive $k^2$ coefficient means $\\cup$, and $> 0$ means the parts above the axis, which are the two outer branches. Writing $0 < k < 4$ (the inside) is the single most common error in this question, and $k < 0$ **or** $k > 4$ must be joined by *or*, never by a chain like $4 < k < 0$, which describes nothing.',
        mark: 'A1',
      },
    ],
    answer_md: '$$k < 0 \\quad \\text{or} \\quad k > 4$$',
  },
  {
    slug: 'non-right-angled-triangle-cosine-rule-sine-rule-area',
    title: 'Cosine rule, sine rule and area of a non-right-angled triangle',
    level: 'S3_EM',
    topic: 'Trigonometry',
    published: true,
    seo: {
      description:
        'A fully annotated O-Level E Math model solution: solving a non-right-angled triangle with the cosine rule, the sine rule and the ½ab sin C area formula — with the reason each line earns its mark.',
    },
    question_md: [
      'In triangle $ABC$, $AB = 9.4\\ \\text{cm}$, $BC = 12.7\\ \\text{cm}$ and $\\angle ABC = 108^\\circ$.',
      '',
      '(a) Calculate $AC$. *(3 marks)*',
      '',
      '(b) Calculate $\\angle BAC$. *(3 marks)*',
      '',
      '(c) Calculate the area of triangle $ABC$. *(2 marks)*',
      '',
      'Give each answer correct to 3 significant figures.',
    ].join('\n'),
    steps: [
      {
        step_md:
          '**(a)** Two sides and the angle *between* them are given, so use the cosine rule with $AC$ opposite the known angle $B$:\n\n$$AC^2 = AB^2 + BC^2 - 2(AB)(BC)\\cos B$$',
        why_md:
          'Choosing the rule is the first decision an examiner looks for. The sine rule needs a side paired with its opposite angle, and there is no such pair here — SAS with the angle sandwiched between the two sides is always the cosine rule.',
        mark: 'M1',
      },
      {
        step_md:
          '$$AC^2 = 9.4^2 + 12.7^2 - 2(9.4)(12.7)\\cos 108^\\circ$$\n\n$$AC^2 = 88.36 + 161.29 + 73.779\\ldots = 323.42\\ldots$$',
        why_md:
          'Substitute, then let the calculator finish. Because $108^\\circ$ is obtuse, $\\cos 108^\\circ$ is **negative**, so the last term *adds*. Sanity check: an obtuse angle at $B$ must make $AC$ longer than either given side, and it does.',
        mark: 'M1',
      },
      {
        step_md: '$$AC = \\sqrt{323.42\\ldots} = 17.983\\ldots \\approx 18.0\\ \\text{cm}$$',
        why_md:
          'Accuracy mark. Take the square root — forgetting it leaves $AC^2$ on the answer line. Round only here, to 3 s.f. as asked, and keep the unrounded value in the calculator for part (b).',
        mark: 'A1',
      },
      {
        step_md:
          '**(b)** Now a side and its opposite angle are known ($AC$ opposite $B$), so the sine rule applies:\n\n$$\\frac{\\sin \\angle BAC}{BC} = \\frac{\\sin B}{AC}$$',
        why_md:
          'Pair each side with the angle facing it. $\\angle BAC$ faces $BC$, and $B$ faces $AC$ — mismatching the pairs is the classic sine-rule error and loses the method mark even when the arithmetic is faultless.',
        mark: 'M1',
      },
      {
        step_md:
          '$$\\sin \\angle BAC = \\frac{12.7 \\sin 108^\\circ}{17.983\\ldots} = 0.67161\\ldots$$',
        why_md:
          'Use the **unrounded** $AC$, not $18.0$. Rounding twice is what turns a correct method into an answer that misses the mark scheme’s tolerance.',
        mark: 'M1',
      },
      {
        step_md: '$$\\angle BAC = \\sin^{-1}(0.67161\\ldots) = 42.19\\ldots^\\circ \\approx 42.2^\\circ$$',
        why_md:
          'Accuracy mark. The ambiguous case does not bite here: a triangle can hold only one obtuse angle and $B = 108^\\circ$ has already used it, so the acute value from the calculator is the only possibility. Check: $42.2^\\circ + 108^\\circ < 180^\\circ$. ✓',
        mark: 'A1',
      },
      {
        step_md:
          '**(c)** Use the included-angle area formula:\n\n$$\\text{Area} = \\tfrac{1}{2}(AB)(BC)\\sin B = \\tfrac{1}{2}(9.4)(12.7)\\sin 108^\\circ$$',
        why_md:
          'Use the two *given* sides and the angle between them, not the values you calculated — this way part (c) cannot inherit an error from parts (a) or (b). $\\tfrac12 \\times \\text{base} \\times \\text{height}$ does not apply: $9.4$ and $12.7$ are not perpendicular.',
        mark: 'M1',
      },
      {
        step_md: '$$\\text{Area} = 56.76\\ldots \\approx 56.8\\ \\text{cm}^2$$',
        why_md:
          'Accuracy mark, and the unit changes to $\\text{cm}^2$ — an area written in $\\text{cm}$ is routinely penalised.',
        mark: 'A1',
      },
    ],
    answer_md: [
      '**(a)** $AC = 18.0\\ \\text{cm}$',
      '',
      '**(b)** $\\angle BAC = 42.2^\\circ$',
      '',
      '**(c)** Area $= 56.8\\ \\text{cm}^2$',
    ].join('\n'),
  },
];

// ── Pure selectors (unit-tested in model-solutions.test.ts) ───────────────────

/** Every entry cleared for the public site, in file order. */
export function publishedSolutions(all: ModelSolution[] = MODEL_SOLUTIONS): ModelSolution[] {
  return all.filter((s) => s.published);
}

/** Look up one published entry. Drafts return undefined so the page 404s. */
export function findPublishedSolution(
  slug: string,
  all: ModelSolution[] = MODEL_SOLUTIONS,
): ModelSolution | undefined {
  return publishedSolutions(all).find((s) => s.slug === slug);
}

export interface SolutionGroup {
  level: SolutionLevel;
  label: string;
  topics: { topic: string; solutions: ModelSolution[] }[];
}

/**
 * Published entries grouped level → topic, levels in LEVEL_ORDER and topics
 * alphabetical. Empty levels are dropped so the index never shows a bare heading.
 */
export function groupSolutions(all: ModelSolution[] = MODEL_SOLUTIONS): SolutionGroup[] {
  const published = publishedSolutions(all);
  return LEVEL_ORDER.map((level) => {
    const forLevel = published.filter((s) => s.level === level);
    const topics = [...new Set(forLevel.map((s) => s.topic))]
      .sort((a, b) => a.localeCompare(b))
      .map((topic) => ({ topic, solutions: forLevel.filter((s) => s.topic === topic) }));
    return { level, label: LEVEL_LABELS[level], topics };
  }).filter((g) => g.topics.length > 0);
}
