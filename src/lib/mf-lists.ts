// The A-Level formula lists, typeset by us: MF27 (from 2025) and MF26 (2017–2024).
//
// One source of truth for /formulas/mf27, /formulas/mf26 and their printable PDFs
// (scripts/formulas/build-mf-pdf.ts). Formulas are facts; the wording, grouping notes,
// "who uses it" tags and the must-memorise lists are ours. Every `tex` string is
// rendered by KaTeX at build time and checked by mf-lists.test.ts — a bad string fails
// the test, not the page.
//
// Facts checked against SEAB's own documents (5 Oct 2026):
//  - MF27 "List of Formulae and Results", 8 pages, for use from 2025 in all papers for
//    H1, H2, H3 Mathematics and H2 Further Mathematics.
//  - MF26 "List of Formulae and Statistical Tables", 12 pages, for use from 2017 (last
//    used 2024), same four syllabuses.
//  - MF26 → MF27: dropped the four factor formulae, the two-sample pooled variance and
//    all four statistical tables except Wilcoxon (normal, t, chi-squared); added arc
//    length, surface area of revolution, the two-variable quadratic approximation and a
//    "Mathematical Results" page (AM-GM, Cauchy-Schwarz, triangle inequality,
//    inclusion-exclusion).

export type MfItem = {
  /** Plain-words label shown above or beside the formula. */
  label?: string;
  /** KaTeX source, display style. */
  tex: string;
  /** Validity condition, KaTeX source, shown quietly after the formula. */
  cond?: string;
};

export type MfTable = {
  /** Column heads; a head starting with '$' is KaTeX (the $ are stripped). */
  head: string[];
  /** Cells; same rule as the head. */
  rows: string[][];
  /** Smaller type for wide numeric tables. */
  dense?: boolean;
};

export type MfBlock =
  | { kind: 'formulas'; items: MfItem[] }
  | { kind: 'table'; table: MfTable; caption?: string }
  /** One line per '\n'. */
  | { kind: 'text'; text: string };

/** Who sits papers that use the section. */
export type MfAudience = 'H1 & H2 Maths' | 'H2 Maths' | 'Further Maths' | 'Further Maths & H3';

export type MfSection = {
  id: string;
  title: string;
  audience: MfAudience;
  /** One plain line: when the section is used. */
  use: string;
  blocks: MfBlock[];
  /** Formulas in the same area that the list does NOT give — memorise these. */
  memorise?: MfItem[];
  /** Only for MF26 sections: what happened to it in MF27. */
  change?: string;
};

export type MfFaq = { q: string; a: string };

export type MfList = {
  code: 'MF27' | 'MF26';
  name: string;
  years: string;
  syllabuses: string;
  sections: MfSection[];
  faqs: MfFaq[];
};

const t = String.raw;

// ── Shared sections (identical in MF26 and MF27) ─────────────────────────────

const binomialAndMaclaurin: MfSection = {
  id: 'algebraic-series',
  title: 'Algebraic series',
  audience: 'H2 Maths',
  use: 'Binomial expansions and Maclaurin series — Sequences & Series and the small-x approximations.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        {
          label: 'Binomial expansion, n a positive integer',
          tex: t`\begin{aligned} (a+b)^n = a^n &+ \binom{n}{1}a^{n-1}b + \binom{n}{2}a^{n-2}b^2 \\ &+ \binom{n}{3}a^{n-3}b^3 + \dots + b^n \end{aligned}`,
        },
        { label: 'where', tex: t`\binom{n}{r} = \frac{n!}{r!\,(n-r)!}` },
        {
          label: 'Maclaurin series',
          tex: t`\begin{aligned} f(x) = f(0) &+ x f'(0) + \frac{x^2}{2!}f''(0) \\ &+ \dots + \frac{x^n}{n!}f^{(n)}(0) + \dots \end{aligned}`,
        },
        {
          label: 'Binomial series, any n',
          tex: t`\begin{aligned} (1+x)^n = 1 &+ nx + \frac{n(n-1)}{2!}x^2 + \dots \\ &+ \frac{n(n-1)\cdots(n-r+1)}{r!}x^r + \dots \end{aligned}`,
          cond: t`|x| < 1`,
        },
        { tex: t`\begin{aligned} e^x = 1 &+ x + \frac{x^2}{2!} + \frac{x^3}{3!} \\ &+ \dots + \frac{x^r}{r!} + \dots \end{aligned}`, cond: t`\text{all } x` },
        {
          tex: t`\begin{aligned} \sin x = x &- \frac{x^3}{3!} + \frac{x^5}{5!} - \dots \\ &+ \frac{(-1)^r x^{2r+1}}{(2r+1)!} + \dots \end{aligned}`,
          cond: t`\text{all } x`,
        },
        {
          tex: t`\begin{aligned} \cos x = 1 &- \frac{x^2}{2!} + \frac{x^4}{4!} - \dots \\ &+ \frac{(-1)^r x^{2r}}{(2r)!} + \dots \end{aligned}`,
          cond: t`\text{all } x`,
        },
        {
          tex: t`\begin{aligned} \ln(1+x) = x &- \frac{x^2}{2} + \frac{x^3}{3} - \dots \\ &+ \frac{(-1)^{r+1}x^r}{r} + \dots \end{aligned}`,
          cond: t`-1 < x \le 1`,
        },
      ],
    },
  ],
  memorise: [
    { label: 'AP: nth term and sum', tex: t`u_n = a + (n-1)d, \qquad S_n = \frac{n}{2}\big[2a + (n-1)d\big] = \frac{n}{2}(a + l)` },
    { label: 'GP: nth term and sum', tex: t`u_n = ar^{n-1}, \qquad S_n = \frac{a(1-r^n)}{1-r}` },
    { label: 'GP: sum to infinity', tex: t`S_\infty = \frac{a}{1-r}`, cond: t`|r| < 1` },
    { label: 'Sum and nth term', tex: t`u_n = S_n - S_{n-1}` },
    { label: 'Small-angle approximations (x in radians)', tex: t`\sin x \approx x, \qquad \cos x \approx 1 - \frac{x^2}{2}, \qquad \tan x \approx x` },
    { label: 'Expanding (a + bx)ⁿ: take out aⁿ first', tex: t`(a+bx)^n = a^n\left(1 + \frac{b}{a}x\right)^n`, cond: t`\left|\tfrac{b}{a}x\right| < 1` },
  ],
};

const partialFractions: MfSection = {
  id: 'partial-fractions',
  title: 'Partial fractions',
  audience: 'H2 Maths',
  use: 'Splitting a proper fraction before you integrate it or expand it as a series.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        { label: 'Distinct linear factors', tex: t`\frac{px+q}{(ax+b)(cx+d)} = \frac{A}{ax+b} + \frac{B}{cx+d}` },
        {
          label: 'A repeated linear factor',
          tex: t`\frac{px^2+qx+r}{(ax+b)(cx+d)^2} = \frac{A}{ax+b} + \frac{B}{cx+d} + \frac{C}{(cx+d)^2}`,
        },
        {
          label: 'A quadratic factor that does not factorise',
          tex: t`\frac{px^2+qx+r}{(ax+b)(x^2+c^2)} = \frac{A}{ax+b} + \frac{Bx+C}{x^2+c^2}`,
        },
      ],
    },
  ],
  memorise: [
    {
      label: 'Improper fraction (top degree ≥ bottom degree): divide first',
      tex: t`\frac{x^2+1}{(x-1)(x+2)} = 1 + \frac{-x+3}{(x-1)(x+2)}`,
    },
  ],
};

const trigCore: MfItem[] = [
  { tex: t`\sin(A \pm B) \equiv \sin A\cos B \pm \cos A\sin B` },
  { tex: t`\cos(A \pm B) \equiv \cos A\cos B \mp \sin A\sin B` },
  { tex: t`\tan(A \pm B) \equiv \frac{\tan A \pm \tan B}{1 \mp \tan A\tan B}` },
  { tex: t`\sin 2A \equiv 2\sin A\cos A` },
  { tex: t`\begin{aligned} \cos 2A &\equiv \cos^2 A - \sin^2 A \\ &\equiv 2\cos^2 A - 1 \\ &\equiv 1 - 2\sin^2 A \end{aligned}` },
  { tex: t`\tan 2A \equiv \frac{2\tan A}{1 - \tan^2 A}` },
];

const factorFormulae: MfItem[] = [
  { tex: t`\sin P + \sin Q \equiv 2\sin\tfrac12(P+Q)\cos\tfrac12(P-Q)` },
  { tex: t`\sin P - \sin Q \equiv 2\cos\tfrac12(P+Q)\sin\tfrac12(P-Q)` },
  { tex: t`\cos P + \cos Q \equiv 2\cos\tfrac12(P+Q)\cos\tfrac12(P-Q)` },
  { tex: t`\cos P - \cos Q \equiv -2\sin\tfrac12(P+Q)\sin\tfrac12(P-Q)` },
];

const principalValues: MfItem[] = [
  { tex: t`-\tfrac12\pi \le \sin^{-1}x \le \tfrac12\pi`, cond: t`|x| \le 1` },
  { tex: t`0 \le \cos^{-1}x \le \pi`, cond: t`|x| \le 1` },
  { tex: t`-\tfrac12\pi < \tan^{-1}x < \tfrac12\pi` },
];

const trigMemorise: MfItem[] = [
  { label: 'Pythagorean identities', tex: t`\sin^2 A + \cos^2 A \equiv 1, \qquad 1 + \tan^2 A \equiv \sec^2 A, \qquad 1 + \cot^2 A \equiv \operatorname{cosec}^2 A` },
  { label: 'R-formula', tex: t`a\sin\theta + b\cos\theta \equiv R\sin(\theta + \alpha), \qquad R = \sqrt{a^2+b^2}, \qquad \tan\alpha = \frac{b}{a}` },
  { label: 'cos 2A turned round (for integrating sin² and cos²)', tex: t`\sin^2 A \equiv \tfrac12(1 - \cos 2A), \qquad \cos^2 A \equiv \tfrac12(1 + \cos 2A)` },
];

const derivatives: MfSection = {
  id: 'derivatives',
  title: 'Derivatives',
  audience: 'H2 Maths',
  use: 'Only the five awkward derivatives are given. Everything else in differentiation is yours to remember.',
  blocks: [
    {
      kind: 'table',
      table: {
        head: ['$f(x)', "$f'(x)"],
        rows: [
          [t`$\sin^{-1}x`, t`$\dfrac{1}{\sqrt{1-x^2}}`],
          [t`$\cos^{-1}x`, t`$-\dfrac{1}{\sqrt{1-x^2}}`],
          [t`$\tan^{-1}x`, t`$\dfrac{1}{1+x^2}`],
          [t`$\operatorname{cosec} x`, t`$-\operatorname{cosec} x\cot x`],
          [t`$\sec x`, t`$\sec x\tan x`],
        ],
      },
    },
  ],
  memorise: [
    { label: 'Basic derivatives', tex: t`\frac{d}{dx}\sin x = \cos x, \qquad \frac{d}{dx}\cos x = -\sin x, \qquad \frac{d}{dx}\tan x = \sec^2 x, \qquad \frac{d}{dx}\cot x = -\operatorname{cosec}^2 x` },
    { tex: t`\frac{d}{dx}e^x = e^x, \qquad \frac{d}{dx}\ln x = \frac1x, \qquad \frac{d}{dx}a^x = a^x\ln a` },
    { label: 'Product and quotient rules', tex: t`\frac{d}{dx}(uv) = u\frac{dv}{dx} + v\frac{du}{dx}, \qquad \frac{d}{dx}\left(\frac{u}{v}\right) = \frac{v\frac{du}{dx} - u\frac{dv}{dx}}{v^2}` },
    { label: 'Chain rule and parametric form', tex: t`\frac{dy}{dx} = \frac{dy}{du}\cdot\frac{du}{dx}, \qquad \frac{dy}{dx} = \frac{dy/dt}{dx/dt}` },
  ],
};

const integralsTable: MfTable = {
  head: ['$f(x)', t`$\displaystyle\int f(x)\,dx`, 'Valid for'],
  rows: [
    [t`$\dfrac{1}{x^2+a^2}`, t`$\dfrac1a\tan^{-1}\!\left(\dfrac xa\right)`, ''],
    [t`$\dfrac{1}{\sqrt{a^2-x^2}}`, t`$\sin^{-1}\!\left(\dfrac xa\right)`, t`$|x|<a`],
    [t`$\dfrac{1}{x^2-a^2}`, t`$\dfrac{1}{2a}\ln\!\left(\dfrac{x-a}{x+a}\right)`, t`$x>a`],
    [t`$\dfrac{1}{a^2-x^2}`, t`$\dfrac{1}{2a}\ln\!\left(\dfrac{a+x}{a-x}\right)`, t`$|x|<a`],
    [t`$\tan x`, t`$\ln(\sec x)`, t`$|x|<\tfrac12\pi`],
    [t`$\cot x`, t`$\ln(\sin x)`, t`$0<x<\pi`],
    [t`$\operatorname{cosec} x`, t`$-\ln(\operatorname{cosec} x+\cot x)`, t`$0<x<\pi`],
    [t`$\sec x`, t`$\ln(\sec x+\tan x)`, t`$|x|<\tfrac12\pi`],
  ],
};

const integrals: MfSection = {
  id: 'integrals',
  title: 'Integrals',
  audience: 'H2 Maths',
  use: 'The eight standard forms. Constants of integration are left out and a is a positive constant.',
  blocks: [{ kind: 'table', table: integralsTable }],
  memorise: [
    { label: 'Basic integrals', tex: t`\int x^n\,dx = \frac{x^{n+1}}{n+1}\ (n \ne -1), \qquad \int \frac1x\,dx = \ln|x|, \qquad \int e^{ax}\,dx = \frac1a e^{ax}` },
    { tex: t`\int \sin ax\,dx = -\frac1a\cos ax, \qquad \int \cos ax\,dx = \frac1a\sin ax, \qquad \int \sec^2 ax\,dx = \frac1a\tan ax` },
    { label: 'Standard forms', tex: t`\int \frac{f'(x)}{f(x)}\,dx = \ln|f(x)|, \qquad \int [f(x)]^n f'(x)\,dx = \frac{[f(x)]^{n+1}}{n+1}` },
    { label: 'Integration by parts', tex: t`\int u\frac{dv}{dx}\,dx = uv - \int v\frac{du}{dx}\,dx` },
    { label: 'Volume of revolution', tex: t`V = \pi\int_a^b y^2\,dx \ \ (\text{about the } x\text{-axis}), \qquad V = \pi\int_c^d x^2\,dy \ \ (\text{about the } y\text{-axis})` },
  ],
};

const vectors: MfSection = {
  id: 'vectors',
  title: 'Vectors',
  audience: 'H2 Maths',
  use: 'The ratio theorem and the cross product. Lines, planes, angles and distances are not given.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        { label: 'The point dividing AB in the ratio λ : μ', tex: t`\frac{\mu\mathbf a + \lambda\mathbf b}{\lambda + \mu}` },
        {
          label: 'Vector (cross) product',
          tex: t`\mathbf a \times \mathbf b = \begin{pmatrix} a_1\\a_2\\a_3 \end{pmatrix} \times \begin{pmatrix} b_1\\b_2\\b_3 \end{pmatrix} = \begin{pmatrix} a_2b_3 - a_3b_2\\ a_3b_1 - a_1b_3\\ a_1b_2 - a_2b_1 \end{pmatrix}`,
        },
      ],
    },
  ],
  memorise: [
    { label: 'Scalar product', tex: t`\mathbf a\cdot\mathbf b = |\mathbf a||\mathbf b|\cos\theta = a_1b_1 + a_2b_2 + a_3b_3` },
    { label: 'Length of projection of a on b, and area of triangle', tex: t`|\mathbf a\cdot\hat{\mathbf b}|, \qquad \text{Area} = \tfrac12|\mathbf a\times\mathbf b|` },
    { label: 'Line and plane', tex: t`\mathbf r = \mathbf a + \lambda\mathbf d, \qquad \mathbf r\cdot\mathbf n = D` },
    { label: 'Distance from point P to the plane r·n = D', tex: t`\frac{|\mathbf p\cdot\mathbf n - D|}{|\mathbf n|}` },
    { label: 'Angle between line and plane, and between two planes', tex: t`\sin\theta = \frac{|\mathbf d\cdot\mathbf n|}{|\mathbf d||\mathbf n|}, \qquad \cos\theta = \frac{|\mathbf n_1\cdot\mathbf n_2|}{|\mathbf n_1||\mathbf n_2|}` },
  ],
};

const numericalMethods: MfSection = {
  id: 'numerical-methods',
  title: 'Numerical methods',
  audience: 'Further Maths',
  use: 'Further Maths: estimating an integral, a root, or a step of a differential equation. Not in H2 Maths.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        { label: 'Trapezium rule, one strip', tex: t`\int_a^b f(x)\,dx \approx \tfrac12(b-a)\big[f(a) + f(b)\big]` },
        { label: "Simpson's rule, two strips", tex: t`\int_a^b f(x)\,dx \approx \tfrac16(b-a)\left[f(a) + 4f\!\left(\frac{a+b}{2}\right) + f(b)\right]` },
        { label: 'Newton-Raphson, x₁ a first approximation to a root of f(x) = 0', tex: t`x_2 = x_1 - \frac{f(x_1)}{f'(x_1)}` },
        { label: 'Euler method, step size h', tex: t`y_2 = y_1 + h f(x_1, y_1)` },
        { label: 'Improved Euler method, step size h', tex: t`u_2 = y_1 + h f(x_1, y_1), \qquad y_2 = y_1 + \frac h2\big[f(x_1, y_1) + f(x_2, u_2)\big]` },
      ],
    },
  ],
};

const discreteTable: MfTable = {
  head: ['Distribution of X', '$P(X=x)', 'Mean', 'Variance'],
  rows: [
    ['Binomial B(n, p)', t`$\dbinom nx p^x(1-p)^{n-x}`, '$np', '$np(1-p)'],
    [t`Poisson Po(λ)`, t`$e^{-\lambda}\dfrac{\lambda^x}{x!}`, t`$\lambda`, t`$\lambda`],
    ['Geometric Geo(p)', t`$(1-p)^{x-1}p`, t`$\dfrac1p`, t`$\dfrac{1-p}{p^2}`],
  ],
};

const continuousTable: MfTable = {
  head: ['Distribution of X', 'p.d.f.', 'Mean', 'Variance'],
  rows: [['Exponential', t`$\lambda e^{-\lambda x}`, t`$\dfrac1\lambda`, t`$\dfrac1{\lambda^2}`]],
};

const distributions: MfSection = {
  id: 'distributions',
  title: 'Standard distributions',
  audience: 'H1 & H2 Maths',
  use: 'H1 and H2 Maths use the binomial row only. Poisson, geometric and exponential are Further Maths.',
  blocks: [
    { kind: 'table', table: discreteTable, caption: 'Discrete' },
    { kind: 'table', table: continuousTable, caption: 'Continuous' },
  ],
  memorise: [
    { label: 'Expectation and variance', tex: t`E(X) = \sum x\,P(X=x), \qquad \operatorname{Var}(X) = E(X^2) - [E(X)]^2` },
    { label: 'Linear combinations (X, Y independent for the variance)', tex: t`E(aX+b) = aE(X)+b, \qquad \operatorname{Var}(aX \pm bY) = a^2\operatorname{Var}(X) + b^2\operatorname{Var}(Y)` },
    { label: 'Sample mean (central limit theorem, n large)', tex: t`\bar X \sim N\!\left(\mu, \frac{\sigma^2}{n}\right) \text{ approximately}` },
    { label: 'Probability', tex: t`P(A\cup B) = P(A) + P(B) - P(A\cap B), \qquad P(A\mid B) = \frac{P(A\cap B)}{P(B)}` },
    { label: 'Independent events, and counting', tex: t`P(A\cap B) = P(A)P(B), \qquad {}^nP_r = \frac{n!}{(n-r)!}, \qquad {}^nC_r = \frac{n!}{r!\,(n-r)!}` },
  ],
};

const unbiasedVariance: MfItem = {
  label: 'Unbiased estimate of population variance',
  tex: t`\begin{aligned} s^2 &= \frac{n}{n-1}\left(\frac{\sum(x-\bar x)^2}{n}\right) \\ &= \frac{1}{n-1}\left(\sum x^2 - \frac{(\sum x)^2}{n}\right) \end{aligned}`,
};

const samplingMemorise: MfItem[] = [
  { label: 'Unbiased estimate of the mean', tex: t`\bar x = \frac{\sum x}{n}` },
  { label: 'z-test statistic for a mean', tex: t`Z = \frac{\bar X - \mu_0}{\sigma/\sqrt n}` },
];

const regression: MfSection = {
  id: 'regression-and-correlation',
  title: 'Regression and correlation',
  audience: 'H1 & H2 Maths',
  use: 'r and the y-on-x line. Your GC gives both; the formula is for questions that hand you summary totals.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        {
          label: 'Product moment correlation coefficient',
          tex: t`\begin{aligned} r &= \frac{\sum(x-\bar x)(y-\bar y)}{\sqrt{\sum(x-\bar x)^2\sum(y-\bar y)^2}} \\[4pt] &= \frac{\sum xy - \frac{\sum x\sum y}{n}}{\sqrt{\left(\sum x^2 - \frac{(\sum x)^2}{n}\right)\left(\sum y^2 - \frac{(\sum y)^2}{n}\right)}} \end{aligned}`,
        },
        { label: 'Regression line of y on x', tex: t`y - \bar y = b(x - \bar x), \qquad b = \frac{\sum(x-\bar x)(y-\bar y)}{\sum(x-\bar x)^2}` },
      ],
    },
  ],
  memorise: [
    { label: 'Regression line of x on y (not given — swap the roles)', tex: t`x - \bar x = d(y - \bar y), \qquad d = \frac{\sum(x-\bar x)(y-\bar y)}{\sum(y-\bar y)^2}` },
    { label: 'Both lines pass through the mean point', tex: t`(\bar x, \bar y)` },
  ],
};

const wilcoxonTable: MfTable = {
  dense: true,
  head: ['n', 'One-tail 0.05 · Two-tail 0.1', 'One-tail 0.025 · Two-tail 0.05', 'One-tail 0.01 · Two-tail 0.02', 'One-tail 0.005 · Two-tail 0.01'],
  rows: [
    ['6', '2', '0', '—', '—'],
    ['7', '3', '2', '0', '—'],
    ['8', '5', '3', '1', '0'],
    ['9', '8', '5', '3', '1'],
    ['10', '10', '8', '5', '3'],
    ['11', '13', '10', '7', '5'],
    ['12', '17', '13', '9', '7'],
    ['13', '21', '17', '12', '9'],
    ['14', '25', '21', '15', '12'],
    ['15', '30', '25', '19', '15'],
    ['16', '35', '29', '23', '19'],
    ['17', '41', '34', '27', '23'],
    ['18', '47', '40', '32', '27'],
    ['19', '53', '46', '37', '32'],
    ['20', '60', '52', '43', '37'],
  ],
};

const wilcoxon: MfSection = {
  id: 'wilcoxon',
  title: 'Wilcoxon signed rank test',
  audience: 'Further Maths',
  use: 'Further Maths non-parametric testing. Reject the null hypothesis when T is at most the value in the table.',
  blocks: [
    {
      kind: 'text',
      text: 'P = sum of the ranks of the positive differences.\nQ = sum of the ranks of the negative differences.\nT = the smaller of P and Q.\nEach entry is the LARGEST T that still rejects the null hypothesis at that level.\nA dash: no T can reject at that level for that n.',
    },
    { kind: 'table', table: wilcoxonTable, caption: 'Critical values of T' },
  ],
};

// ── MF27 only ────────────────────────────────────────────────────────────────

const appsOfIntegrals: MfSection = {
  id: 'applications-of-definite-integrals',
  title: 'Applications of definite integrals',
  audience: 'Further Maths',
  use: 'Further Maths: the length of a curve and the area of the surface it sweeps out. New in MF27.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        { label: 'Arc length, y as a function of x', tex: t`s = \int_a^b \sqrt{1 + \left(\frac{dy}{dx}\right)^2}\,dx` },
        { label: 'Surface area of revolution about the x-axis', tex: t`S = \int_a^b 2\pi y\sqrt{1 + \left(\frac{dy}{dx}\right)^2}\,dx` },
      ],
    },
  ],
};

const twoVariables: MfSection = {
  id: 'functions-of-two-variables',
  title: 'Functions of two variables',
  audience: 'Further Maths',
  use: 'Further Maths: approximating f(x, y) near a point (a, b), as Maclaurin does for one variable. New in MF27.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        {
          label: 'Quadratic approximation of f at (a, b)',
          tex: t`\begin{aligned} f(x,y) \approx{} & f(a,b) \\ & + f_x(a,b)(x-a) + f_y(a,b)(y-b) \\ & + \tfrac12 f_{xx}(a,b)(x-a)^2 \\ & + f_{xy}(a,b)(x-a)(y-b) \\ & + \tfrac12 f_{yy}(a,b)(y-b)^2 \end{aligned}`,
        },
      ],
    },
  ],
};

const mathematicalResults: MfSection = {
  id: 'mathematical-results',
  title: 'Mathematical results',
  audience: 'Further Maths & H3',
  use: 'Inequalities and counting for proofs in Further Maths and H3. A new page in MF27.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        {
          label: 'AM-GM inequality — x₁, …, xₙ ≥ 0; equal only when all the xᵢ are equal',
          tex: t`\frac{x_1 + x_2 + \dots + x_n}{n} \ge \sqrt[n]{x_1x_2\cdots x_n}`,
        },
        {
          label: 'Cauchy-Schwarz inequality — equal only when uᵢ = kvᵢ for every i, for some k ≠ 0',
          tex: t`\left(\sum_{i=1}^n u_iv_i\right)^2 \le \left(\sum_{i=1}^n u_i^2\right)\left(\sum_{i=1}^n v_i^2\right)`,
        },
        {
          label: 'Triangle inequality — equal when the xᵢ all have the same sign (or are zero)',
          tex: t`|x_1 + x_2 + \dots + x_n| \le |x_1| + |x_2| + \dots + |x_n|`,
        },
        {
          label: 'Inclusion-exclusion principle',
          tex: t`\begin{aligned} |A_1\cup\dots\cup A_n| ={} & \sum_i |A_i| - \sum_{i<j}|A_i\cap A_j| \\ & + \sum_{i<j<k}|A_i\cap A_j\cap A_k| \\ & - \dots \\ & + (-1)^{n-1}|A_1\cap\dots\cap A_n| \end{aligned}`,
        },
      ],
    },
  ],
};

// ── Complex numbers: on neither list ─────────────────────────────────────────

export const notOnEitherList: MfSection = {
  id: 'complex-numbers',
  title: 'Complex numbers (not on the list at all)',
  audience: 'H2 Maths',
  use: 'A whole H2 topic with nothing given. Since 2025 H2 Maths uses Cartesian form only — no polar or exponential form.',
  blocks: [
    {
      kind: 'formulas',
      items: [
        { label: 'Modulus and conjugate of z = x + iy', tex: t`|z| = \sqrt{x^2 + y^2}, \qquad z^* = x - iy, \qquad zz^* = |z|^2` },
        { label: 'Real and imaginary parts', tex: t`z + z^* = 2\operatorname{Re}(z), \qquad z - z^* = 2i\operatorname{Im}(z)` },
        { label: 'Dividing: multiply top and bottom by the conjugate', tex: t`\frac{1}{z} = \frac{z^*}{|z|^2}` },
        { label: 'Argument: tan of the angle, then check the quadrant on the Argand diagram', tex: t`\tan(\arg z) = \frac{y}{x}, \qquad -\pi < \arg z \le \pi` },
        { label: 'A polynomial with real coefficients', tex: t`p(z) = 0 \implies p(z^*) = 0` },
      ],
    },
  ],
};

// ── The two lists ────────────────────────────────────────────────────────────

export const MF27: MfList = {
  code: 'MF27',
  name: 'List of Formulae and Results',
  years: 'from 2025',
  syllabuses: 'H1 Mathematics (8865), H2 Mathematics (9758), H3 Mathematics and H2 Further Mathematics (9649)',
  sections: [
    binomialAndMaclaurin,
    partialFractions,
    {
      id: 'trigonometry',
      title: 'Trigonometry',
      audience: 'H2 Maths',
      use: 'Compound and double angles, and the principal values of the inverse functions. The factor formulae are gone from MF27.',
      blocks: [
        { kind: 'formulas', items: trigCore },
        { kind: 'text', text: 'Principal values:' },
        { kind: 'formulas', items: principalValues },
      ],
      memorise: [...trigMemorise, ...factorFormulae.map((f, i) => (i === 0 ? { ...f, label: 'Factor formulae (were on MF26, not on MF27)' } : f))],
    },
    derivatives,
    integrals,
    vectors,
    appsOfIntegrals,
    twoVariables,
    numericalMethods,
    distributions,
    {
      id: 'sampling-and-testing',
      title: 'Sampling and testing',
      audience: 'H1 & H2 Maths',
      use: 'The unbiased estimate of the population variance from a sample. MF27 no longer gives the two-sample pooled version.',
      blocks: [{ kind: 'formulas', items: [unbiasedVariance] }],
      memorise: samplingMemorise,
    },
    regression,
    wilcoxon,
    mathematicalResults,
  ],
  faqs: [
    {
      q: 'What is MF27?',
      a: 'MF27 is the List of Formulae and Results that SEAB gives you in Singapore-Cambridge A-Level maths exams. It is used from 2025 in every paper for H1 Mathematics, H2 Mathematics, H3 Mathematics and H2 Further Mathematics.',
    },
    {
      q: 'Is MF27 given in the exam?',
      a: 'Yes. A clean copy is handed out in every A-Level maths paper. You may not bring your own copy or write on one beforehand, so practise with a clean copy beside you.',
    },
    {
      q: 'What is the difference between MF26 and MF27?',
      a: 'MF27 replaced MF26 from 2025. It dropped the four factor formulae, the two-sample pooled variance, and the normal, t and chi-squared tables (you use your graphing calculator instead). It added arc length, surface area of revolution, the two-variable quadratic approximation, and a page of mathematical results: AM-GM, Cauchy-Schwarz, the triangle inequality and inclusion-exclusion.',
    },
    {
      q: 'Is MF27 the same for H2 Maths and H2 Further Maths?',
      a: 'Yes, it is one list for H1, H2 and H3 Mathematics and H2 Further Mathematics. H2 Maths students use the algebra, trigonometry, calculus, vectors, binomial, sampling and regression sections. Numerical methods, Poisson, geometric, exponential, Wilcoxon and the mathematical results are for Further Maths (and H3).',
    },
    {
      q: 'Which formulas must I memorise for H2 Maths?',
      a: 'Everything not on the list: AP and GP formulas, the small-angle approximations, the R-formula and Pythagorean identities, basic derivatives and integrals, integration by parts, volume of revolution, the scalar product and every line-and-plane result in vectors, all of complex numbers, the E(X) and Var(X) rules, standardising a normal variable, the sample-mean distribution and the z-test statistic. Each section on this page lists them under "Not on the list".',
    },
    {
      q: 'Does MF27 have the normal distribution table?',
      a: 'No. MF27 has no normal, t or chi-squared tables; you find normal probabilities and inverse-normal values on your graphing calculator. The only table left is the Wilcoxon signed rank test, which is for Further Maths.',
    },
    {
      q: 'Can I download MF27 as a PDF?',
      a: 'Yes. Our typeset PDF of every formula on the list, with the must-memorise formulas added under each section, is free to print from this page. The official booklet is published by SEAB with the A-Level syllabus documents.',
    },
  ],
};

export const MF26: MfList = {
  code: 'MF26',
  name: 'List of Formulae and Statistical Tables',
  years: '2017 to 2024',
  syllabuses: 'H1 Mathematics (8865), H2 Mathematics (9758), H3 Mathematics and H2 Further Mathematics (9649)',
  sections: [
    binomialAndMaclaurin,
    partialFractions,
    {
      id: 'trigonometry',
      title: 'Trigonometry',
      audience: 'H2 Maths',
      use: 'Compound and double angles, the factor formulae, and principal values.',
      change: 'MF27 keeps everything here except the four factor formulae.',
      blocks: [
        { kind: 'formulas', items: [...trigCore, ...factorFormulae.map((f, i) => (i === 0 ? { ...f, label: 'Factor formulae' } : f))] },
        { kind: 'text', text: 'Principal values:' },
        { kind: 'formulas', items: principalValues },
      ],
      memorise: trigMemorise,
    },
    { ...derivatives, change: 'Unchanged in MF27.' },
    { ...integrals, change: 'Unchanged in MF27.' },
    { ...vectors, change: 'Unchanged in MF27.' },
    { ...numericalMethods, change: 'Unchanged in MF27.' },
    { ...distributions, change: 'Unchanged in MF27.' },
    {
      id: 'sampling-and-testing',
      title: 'Sampling and testing',
      audience: 'H1 & H2 Maths',
      use: 'Estimating the population variance, from one sample or from two samples pooled.',
      change: 'MF27 keeps the one-sample formula and drops the pooled one.',
      blocks: [
        {
          kind: 'formulas',
          items: [
            unbiasedVariance,
            {
              label: 'Unbiased estimate of the common population variance from two samples',
              tex: t`s^2 = \frac{\sum(x_1 - \bar x_1)^2 + \sum(x_2 - \bar x_2)^2}{n_1 + n_2 - 2}`,
            },
          ],
        },
      ],
      memorise: samplingMemorise,
    },
    { ...regression, change: 'Unchanged in MF27.' },
    {
      id: 'statistical-tables',
      title: 'Statistical tables',
      audience: 'H1 & H2 Maths',
      use: 'MF26 printed four tables: the normal distribution function Φ(z), critical values of t, critical values of χ², and the Wilcoxon signed rank test.',
      change: 'MF27 keeps only the Wilcoxon table. Normal values now come from your graphing calculator.',
      blocks: [
        {
          kind: 'text',
          text: 'Old papers that say "use the tables in MF26" can be done on the graphing calculator.\nΦ(z): normalcdf. Its inverse: invNorm.\nThe t and χ² tables served Further Maths tests.',
        },
      ],
    },
    { ...wilcoxon, change: 'Unchanged in MF27.' },
  ],
  faqs: [
    {
      q: 'Is MF26 still used?',
      a: 'No. MF26 was used from 2017 to 2024. From 2025 every A-Level maths paper (H1, H2, H3 Mathematics and H2 Further Mathematics) comes with MF27 instead.',
    },
    {
      q: 'What changed from MF26 to MF27?',
      a: 'MF27 dropped the four factor formulae, the two-sample pooled variance and the normal, t and chi-squared tables. It added arc length, surface area of revolution, the two-variable quadratic approximation, and a page of mathematical results (AM-GM, Cauchy-Schwarz, the triangle inequality, inclusion-exclusion). The binomial, Maclaurin, partial fractions, trigonometry, derivatives, integrals, vectors and statistics formulas are the same.',
    },
    {
      q: 'Can I still practise with past papers that used MF26?',
      a: 'Yes. Papers from 2017 to 2024 are still good practice. Two things to watch: learn the factor formulae by heart if a question needs them, and use your graphing calculator wherever the paper expected the normal table.',
    },
    {
      q: 'Do I need to memorise the factor formulae now?',
      a: 'If your syllabus or school uses them, yes — they are no longer printed on MF27. They are listed under Trigonometry on our MF27 page, under "Not on the list".',
    },
  ],
};

/**
 * A formula joined by top-level \qquad is several results on one line. The web page
 * stacks them one a line (a phone has no room, and one idea a line reads better);
 * the PDF keeps them side by side.
 */
export function splitQquad(tex: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && tex.startsWith('\\qquad', i)) {
      out.push(tex.slice(start, i));
      start = i + 6;
      i += 5;
    }
  }
  out.push(tex.slice(start));
  return out.map(p => p.trim().replace(/,$/, '').trim()).filter(Boolean);
}

/** Every KaTeX string in a list, for the render test and the PDF. */
export function allTex(list: MfList): string[] {
  const out: string[] = [];
  const cell = (s: string) => (s.startsWith('$') ? [s.slice(1)] : []);
  for (const s of [...list.sections, notOnEitherList]) {
    for (const b of s.blocks) {
      if (b.kind === 'formulas') for (const it of b.items) out.push(it.tex, ...(it.cond ? [it.cond] : []));
      if (b.kind === 'table') {
        for (const h of b.table.head) out.push(...cell(h));
        for (const r of b.table.rows) for (const c of r) out.push(...cell(c));
      }
    }
    for (const it of s.memorise ?? []) out.push(it.tex, ...(it.cond ? [it.cond] : []));
  }
  return out;
}
