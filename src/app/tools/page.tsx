import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: "Interactive Math Tools | Adrian's Math Tuition",
  description:
    'Free interactive visualisations for O-Level and JC math — trig graphs, graph transformations, Argand diagrams, 3D vectors, curve sketching, calculus drills and more.',
};

// Each tool is a self-contained static HTML page served from public/tools/<slug>.html.
const TOOLS: { slug: string; icon: string; title: string; desc: string }[] = [
  { slug: 'trig-graphs', icon: '〰️', title: 'Trigonometric Graphs Explorer',
    desc: 'Plot y = a·sin(bx + c) and friends — drag, scale and shift to see how each parameter reshapes the wave.' },
  { slug: 'graph-transformations', icon: '↔️', title: 'Graph Transformations',
    desc: 'See how translations, stretches and reflections reshape any graph in real time.' },
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
  { slug: 'sincos-unwrap', icon: '🔄', title: 'Unit Circle → Sine & Cosine',
    desc: "Watch a point circle the unit circle and unroll into the sine and cosine waves — see why they're the same motion, a quarter-turn apart." },
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
