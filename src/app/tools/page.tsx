import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { ogCard } from '@/lib/og';

const TOOLS_DESC =
  'Free interactive visualisations for O-Level and JC math — trig graphs, graph transformations, Argand diagrams, 3D vectors, curve sketching, calculus drills and more.';

export const metadata: Metadata = {
  title: "Interactive Math Tools | Adrian's Math Tuition",
  description: TOOLS_DESC,
  alternates: { canonical: 'https://adrianmathtuition.com/tools' },
  ...ogCard({
    card: 'Interactive Math Tools',
    cardSub: 'Drag, play and explore the concepts that are hard to see on paper. Free, no sign-up.',
    tag: 'O-Level & JC',
    title: 'Interactive Math Tools',
    description: TOOLS_DESC,
    path: '/tools',
  }),
};

// Each tool is a self-contained static HTML page served from public/tools/<slug>.html.
const TOOLS: { slug: string; icon: string; title: string; desc: string }[] = [
  { slug: 'trig-graphs', icon: '〰️', title: 'Trigonometric Graphs Explorer',
    desc: 'Plot y = a·sin(bx + c) and friends — drag, scale and shift to see how each parameter reshapes the wave.' },
  { slug: 'graph-transformations', icon: '↔️', title: 'Graph Transformations',
    desc: 'Translations, stretches and reflections in real time — plus the JC set: |f(x)|, f(|x|), 1/f(x) and f′(x). Type your own y = f(x), or snap a photo of a printed graph and transform that.' },
  { slug: 'curve-sketcher', icon: '✏️', title: 'Curve Sketching Pad',
    desc: 'Sketch polynomials and rational curves; find the turning points, asymptotes and intercepts.' },
  { slug: 'argand-diagram', icon: '🧭', title: 'Argand Diagram & Complex Numbers',
    desc: 'Plot complex numbers, add and multiply them, and watch modulus–argument geometry come alive.' },
  { slug: 'vectors-3d', icon: '🧊', title: '3D Vector & Plane Visualiser',
    desc: 'Rotate vectors, lines and planes in 3D to build intuition for H2 vectors.' },
  { slug: 'calculus-drill', icon: '⚡', title: 'Calculus Drill',
    desc: 'Rapid-fire differentiation and integration practice with instant feedback.' },
  { slug: 'mental-math', icon: '🧮', title: 'Mental Math Sprint',
    desc: 'Timed arithmetic drills to sharpen speed and accuracy.' },
  { slug: 'area-ratios', icon: '🔺', title: 'Ratio of Areas',
    desc: 'Same height ⇒ areas follow the bases; similar figures ⇒ k, k², k³. Drag the figures and watch the exam ratios — including the trapezium-diagonals classic — hold live.' },
  { slug: 'linear-law', icon: '📈', title: 'Linear Law',
    desc: 'Why plot lg y against x? Watch a curve straighten under the right axes, then recover a and b from the gradient and intercept. Snap a photo of the question’s data table and it reads, fits and solves it for you.' },
  { slug: 'solution-stepper', icon: '🎞️', title: 'Animated Worked Solutions',
    desc: 'Watch an equation solve itself one operation at a time — each step glows with what was done to both sides, including the ± everyone forgets.' },
  { slug: 'first-principles', icon: '🎢', title: 'Differentiation from First Principles',
    desc: 'A guided animated lesson: the secant line visibly swings into the tangent as h shrinks to 0 — then the algebra says the same thing.' },
  { slug: 'completing-square', icon: '🟧', title: 'Completing the Square, with Actual Squares',
    desc: 'A guided animated lesson: x² + 8x drawn as real squares and rectangles that split, wrap and patch into (x + 4)² − 16 — then straight to the turning point.' },
  { slug: 'r-formula', icon: '🌊', title: 'The R-Formula — Two Waves Become One',
    desc: 'A guided animated lesson: a sin θ + b cos θ visibly collapses into one wave R sin(θ + α), with the 3-4-5 triangle showing where R and α come from. Sliders included.' },
  { slug: 'triangle-solver', icon: '📐', title: 'Triangle Solver & the Ambiguous Case',
    desc: 'Give it any three parts (SSS, SAS, ASA, SSA) — see the triangle drawn to scale, which rule applies, and BOTH triangles when sine gives two answers.' },
  { slug: 'circle-theorems', icon: '⭕', title: 'Circle Geometry Theorem Explorer',
    desc: 'Drag points around a circle and watch angle-at-centre, same-segment, semicircle, cyclic quad, tangent and alternate-segment theorems hold live.' },
  { slug: 'clips', icon: '🎬', title: 'Bite-size Video Clips',
    desc: 'Narrated 20-second explainers made for WhatsApp — watch once, remember the idea. First up: why tan blows up at 90°.' },
  { slug: 'sincos-unwrap', icon: '🔄', title: 'Unit Circle → Sine, Cosine & Tangent',
    desc: 'The unit circle with the classic tangent-line construction, tracing all three graphs live beside it — drag the dot, jump to special angles, see exact values and why tan blows up at 90°. 3D unwrap view included.' },
  { slug: 'spot-the-error', icon: '🕵️', title: 'Spot the Error',
    desc: 'Real exam working with exactly one illegal line hidden inside — tap it, then see why. Trained on the slips that actually cost marks: signs, logs, illegal cancelling, the forgotten ±.' },
  { slug: 'probability-tree', icon: '🌳', title: 'Probability Tree Builder',
    desc: 'Fill in every branch, then multiply along the path and add across paths — with and without replacement, plus the trees where the second branch depends on the first.' },
  { slug: 'draw-the-line', icon: '📏', title: 'Draw the Line',
    desc: 'The classic "add a suitable straight line to solve…" question, live: work out the line, drag it onto the drawn curve, read the roots off the graph like the real paper.' },
  { slug: 'sign-table', icon: '🚦', title: 'Inequalities: the Sign Test',
    desc: 'Critical values → signs → answer. Solve quadratic, rational and modulus inequalities the systematic way — including the denominator values you must never include.' },
  { slug: 'hypothesis-conclusion', icon: '⚖️', title: 'Hypothesis Tests: the Conclusion Mark',
    desc: 'Every H2 test ends with one sentence worth one mark. Assemble it — the comparison, the decision, the strength, the claim in context — and never say "accept H₀".' },
  { slug: 'trig-proofs', icon: '✍️', title: 'Prove It: Trig Identities',
    desc: 'Proving is choosing the right next move. Build ten proofs line by line and learn the five moves that crack almost every identity — Pythagoras in disguise, the conjugate, and friends.' },
  { slug: 'speed-time', icon: '🚗', title: 'Speed-Time Graphs',
    desc: 'The whole topic is two facts: gradient is acceleration, area is distance. Draw the journey from the story, then make the graph pay — trapezium areas, unknown times and all.' },
  { slug: 'bar-model', icon: '🧱', title: 'Bar Model Builder',
    desc: 'Draw the problem before you solve it: units, stubs and brackets for ratio, percentage and before-after problems — then see the algebra your bars secretly were. Sec 1–2, and the PSLE bridge.' },
  { slug: 'constructions', icon: '🧭', title: 'Constructions, Drawn For You',
    desc: 'Watch the compass actually swing: the perpendicular bisector and the angle bisector built arc by arc, like a video you can pause and scrub. Then drag the points and it rebuilds on your figure — plus the loci question where you shade the region.' },
  { slug: 'ratio-drill', icon: '⚖️', title: 'Ratio of Areas — Endless Practice',
    desc: 'A fresh figure every time with the ratios marked: key in the area ratio, and the working builds itself step by step over the diagram. Every family that shows up in E-Math vectors, congruence and similarity.' },
];

export default function ToolsPage() {
  return (
    <>
      <Nav />
      <main className="pt-16 min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <header className="text-center mb-10 md:mb-12">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-navy tracking-tight">Interactive Math Tools</h1>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto text-[15px] md:text-base leading-relaxed">
              Free, hands-on visualisations for O-Level and JC math — drag, play and explore the
              concepts that are hard to see on paper.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {TOOLS.map((t) => (
              <a
                key={t.slug}
                href={`/tools/${t.slug}.html`}
                className="group flex flex-col bg-card border border-border rounded-2xl p-5 md:p-6 hover:border-amber hover:shadow-lg transition-all"
              >
                <div className="text-3xl mb-3" aria-hidden>{t.icon}</div>
                <h2 className="font-semibold text-[17px] text-navy group-hover:text-amber-dark transition-colors">{t.title}</h2>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed flex-1">{t.desc}</p>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-navy mt-4 group-hover:gap-2 transition-all">
                  Open <span aria-hidden>→</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
