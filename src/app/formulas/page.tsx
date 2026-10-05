import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { FORMULA_PAGES, type FormulaLevel } from '@/lib/formula-pages';
import { ogCard } from '@/lib/og';

const DESC =
  'Free math formula sheets for Singapore students: the A-Level MF27 and MF26 lists typeset, plus H2 Maths, O-Level A Math and E Math formulas by topic.';

export const metadata: Metadata = {
  title: 'Math Formula Sheets: MF27, H2 Maths, A Math, E Math',
  description: DESC,
  alternates: { canonical: 'https://www.adrianmathtuition.com/formulas' },
  ...ogCard({
    card: 'Math Formula Sheets',
    cardSub: 'MF27, H2 Maths, O-Level A Math and E Math — by topic.',
    tag: 'Free',
    title: 'Math formula sheets — MF27, H2 Maths, A Math, E Math',
    description: DESC,
    path: '/formulas',
  }),
};

const LEVELS: { level: FormulaLevel; blurb: string }[] = [
  { level: 'A-Level H2 Maths', blurb: 'Topic sheets for JC1 and JC2.' },
  { level: 'O-Level A Math', blurb: 'Additional Mathematics (4049).' },
  { level: 'O-Level E Math', blurb: 'Mathematics (4052).' },
];

const SITE = 'https://www.adrianmathtuition.com';
const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Formulas', item: `${SITE}/formulas` },
  ],
};

export default function FormulasIndex() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <Nav />
      <main className="pt-16">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-amber-dark mb-2">Free · Singapore syllabus</p>
          <h1 className="font-display text-[1.9rem] sm:text-[2.2rem] text-navy leading-[1.2] mb-4">Math formula sheets</h1>
          <p className="text-[16px] leading-relaxed mb-6">Every formula, typeset, one topic a page.</p>

          <h2 className="font-display text-[1.35rem] text-navy mb-3">A-Level formula lists</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-9">
            <Link href="/formulas/mf27" className="block rounded-xl border-[1.5px] border-amber bg-amber-light px-5 py-4 no-underline hover:shadow-sm">
              <p className="font-display text-[1.2rem] text-navy">MF27 formula list</p>
              <p className="text-[14px] text-muted-foreground">H1 · H2 · Further Maths, from 2025 — and what is not on it.</p>
            </Link>
            <Link href="/formulas/mf26" className="block rounded-xl border border-border bg-card px-5 py-4 no-underline hover:shadow-sm">
              <p className="font-display text-[1.2rem] text-navy">MF26 formula list</p>
              <p className="text-[14px] text-muted-foreground">2017–2024, and what changed in MF27.</p>
            </Link>
          </div>

          {LEVELS.map(({ level, blurb }) => (
            <section key={level} className="mb-8">
              <h2 className="font-display text-[1.35rem] text-navy mb-1">{level}</h2>
              <p className="text-[14px] text-muted-foreground mb-3">{blurb}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0">
                {FORMULA_PAGES.filter(p => p.level === level).map(p => (
                  <li key={p.slug}>
                    <Link href={`/formulas/${p.slug}`} className="block rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] text-navy no-underline hover:border-navy">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
