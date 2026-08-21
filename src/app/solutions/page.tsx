import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { WhatsAppCTA } from '@/components/LandingPage';
import { ogCard } from '@/lib/og';
import { groupSolutions, publishedSolutions } from '@/data/model-solutions';

// The public annotated model-solutions library — the math analogue of a
// model-essay library. Static: content comes from src/data/model-solutions.ts.
//
// NOT linked from the site nav yet (deliberate): reachable by URL only until
// Adrian has reviewed the curated content.

const DESC =
  'Free annotated model solutions for O-Level E Math and A Math. Every line of working is marked up with the reason it earns its mark — the method marks, the accuracy marks, and the traps that lose them.';

export const metadata: Metadata = {
  title: "Annotated Model Solutions for O-Level Math | Adrian's Math Tuition",
  description: DESC,
  alternates: { canonical: 'https://adrianmathtuition.com/solutions' },
  ...ogCard({
    card: 'Annotated Model Solutions',
    cardSub: 'Every step marked up with the reason it earns its mark.',
    tag: 'O-Level E Math & A Math',
    title: 'Annotated Model Solutions for O-Level Math',
    description: DESC,
    path: '/solutions',
  }),
};

export default function SolutionsIndexPage() {
  const groups = groupSolutions();
  const count = publishedSolutions().length;

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Annotated Model Solutions',
    description: DESC,
    url: 'https://adrianmathtuition.com/solutions',
    isPartOf: { '@type': 'WebSite', name: "Adrian's Math Tuition" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <Nav />
      <main className="pt-16">
        {/* Cream on navy, spelled out: the repo has no `primary-foreground`
            token, so that utility renders as nothing. */}
        <div className="bg-navy text-[hsl(45,100%,96%)] py-14 px-6 text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] opacity-70 mb-3">
            O-Level E Math &amp; A Math
          </p>
          <h1 className="font-display text-[2rem] sm:text-[2.5rem] mb-4 leading-[1.2]">
            Annotated Model Solutions
          </h1>
          <p className="text-[17px] opacity-85 max-w-[620px] mx-auto leading-relaxed">
            Not just the answer — the reason each line earns its mark.
          </p>
        </div>

        <div className="max-w-[800px] mx-auto px-6 py-12">
          <p className="text-muted-foreground text-base mb-3 leading-relaxed">
            A worked answer tells you what to write. It does not tell you{' '}
            <em>why the examiner pays for it</em> — and that is the part students are actually
            marked on. Every solution here is written out the way it should appear in a script,
            with a note beside each line explaining what that line is worth: the method mark, the
            accuracy mark, and the trap that quietly costs it.
          </p>
          <p className="text-muted-foreground text-base mb-3 leading-relaxed">
            For students, it is a model of how full working should look. For parents, it is the
            clearest picture of how these lessons are taught — nothing is waved through as
            &ldquo;you just do this&rdquo;.
          </p>
          <p className="text-muted-foreground text-base mb-10 leading-relaxed">
            Free to read, no sign-up. Every question is written from scratch for this site.
          </p>

          {count === 0 ? (
            <p className="text-muted-foreground text-base">
              The first solutions are being written — check back shortly.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.level} className="mb-12">
                <h2 className="font-display text-[1.6rem] text-navy mb-1">{group.label}</h2>
                <div className="h-px bg-border mb-5" />
                {group.topics.map(({ topic, solutions }) => (
                  <div key={topic} className="mb-6">
                    <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-amber-dark mb-3">
                      {topic}
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      {solutions.map((s) => (
                        <Link
                          key={s.slug}
                          href={`/solutions/${s.slug}`}
                          className="block bg-card border border-border rounded-xl px-6 py-5 no-underline hover:border-navy transition-colors"
                        >
                          <h3 className="font-display text-[1.15rem] text-navy mb-1.5 leading-snug">
                            {s.title}
                          </h3>
                          <p className="text-muted-foreground text-[14.5px] leading-relaxed mb-3">
                            {s.seo.description}
                          </p>
                          <span className="text-[13px] font-semibold text-amber-dark">
                            Read the annotated solution →
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}

          <div className="bg-amber-light border-[1.5px] border-amber rounded-xl px-7 py-6 text-center">
            <p className="text-navy text-[16px] font-medium leading-relaxed mb-4">
              Want your child&apos;s own working marked this way, line by line?
            </p>
            <WhatsAppCTA text="Ask Adrian about a trial lesson" />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
