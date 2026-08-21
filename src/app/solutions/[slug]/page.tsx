import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { WhatsAppCTA } from '@/components/LandingPage';
import { MathMarkdown } from '@/lib/math-markdown';
import { ogCard } from '@/lib/og';
import {
  LEVEL_LABELS,
  findPublishedSolution,
  publishedSolutions,
} from '@/data/model-solutions';

// One annotated model solution. Drafts (published: false) 404 by URL as well as
// being absent from the index — findPublishedSolution enforces both.

export const dynamicParams = false;

export function generateStaticParams() {
  return publishedSolutions().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sol = findPublishedSolution(slug);
  if (!sol) return { title: "Solution not found | Adrian's Math Tuition" };

  const level = LEVEL_LABELS[sol.level];
  const path = `/solutions/${sol.slug}`;
  return {
    title: `${sol.title} | ${level} Model Solution`,
    description: sol.seo.description,
    alternates: { canonical: `https://adrianmathtuition.com${path}` },
    ...ogCard({
      card: sol.title,
      cardSub: `${level} · ${sol.topic} — every step annotated with the mark it earns.`,
      tag: 'Annotated Model Solution',
      title: `${sol.title} — annotated model solution`,
      description: sol.seo.description,
      path,
      type: 'article',
    }),
  };
}

/** Marking-scheme chip. M = method, A = accuracy, B = independent. */
function MarkChip({ mark }: { mark: string }) {
  const kind = mark.trim().charAt(0).toUpperCase();
  const tone =
    kind === 'M'
      ? 'bg-[hsl(192,45%,93%)] border-[hsl(192,35%,72%)] text-[#2E7C8F]'
      : kind === 'A'
        ? 'bg-amber-light border-amber text-amber-dark'
        : 'bg-[hsl(345,45%,95%)] border-[hsl(345,35%,78%)] text-[#BC5A6E]';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${tone}`}
      title={
        kind === 'M'
          ? 'Method mark — awarded for the correct approach, even if the arithmetic slips'
          : kind === 'A'
            ? 'Accuracy mark — awarded for the correct value, and only if the method mark is earned'
            : 'Independent mark — awarded on its own, for a correct stated fact or result'
      }
    >
      {mark}
    </span>
  );
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sol = findPublishedSolution(slug);
  if (!sol) return notFound();

  const level = LEVEL_LABELS[sol.level];
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: sol.title,
    description: sol.seo.description,
    author: { '@type': 'Person', name: 'Adrian Fong' },
    publisher: { '@type': 'Organization', name: "Adrian's Math Tuition" },
    mainEntityOfPage: `https://adrianmathtuition.com/solutions/${sol.slug}`,
    about: `${sol.topic}, ${level}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <Nav />
      <main className="pt-16">
        <div className="max-w-[860px] mx-auto px-6 py-10">
          <Link
            href="/solutions"
            className="text-[13px] text-muted-foreground no-underline hover:text-navy transition-colors"
          >
            ← All model solutions
          </Link>

          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-amber-dark mt-6 mb-2">
            {level} · {sol.topic}
          </p>
          <h1 className="font-display text-[1.9rem] sm:text-[2.2rem] text-navy leading-[1.2] mb-6">
            {sol.title}
          </h1>

          {/* Question */}
          <section className="bg-card border border-border rounded-xl px-6 py-6 mb-10">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-3">
              The question
            </p>
            <div className="msol-md math-working">
              <MathMarkdown content={sol.question_md} />
            </div>
          </section>

          {/* Steps — working left, "why it earns the mark" beside it on desktop,
              under it on mobile. */}
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-4">
            The solution, line by line
          </p>
          <ol className="list-none p-0 m-0 mb-10">
            {sol.steps.map((step, i) => (
              <li
                key={i}
                className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-x-7 gap-y-3 border-t border-border py-6 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2.5 mb-2">
                    <span className="text-[12px] font-bold text-muted-foreground tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {step.mark && <MarkChip mark={step.mark} />}
                  </div>
                  <div className="msol-md math-working">
                    <MathMarkdown content={step.step_md} />
                  </div>
                </div>
                <aside className="md:pt-1 border-l-0 md:border-l-[3px] border-amber md:pl-5 bg-amber-light/50 md:bg-transparent rounded-lg md:rounded-none px-4 py-3 md:px-0 md:py-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-dark mb-1.5">
                    Why this earns the mark
                  </p>
                  <div className="msol-md msol-md--note math-working">
                    <MathMarkdown content={step.why_md} />
                  </div>
                </aside>
              </li>
            ))}
          </ol>

          {/* Final answer */}
          <section className="bg-navy text-[hsl(45,100%,96%)] rounded-xl px-7 py-6 mb-12">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] opacity-70 mb-3">
              Final answer
            </p>
            <div className="msol-md msol-md--on-dark math-working">
              <MathMarkdown content={sol.answer_md} />
            </div>
          </section>

          {/* Quiet CTA — same WhatsApp path as the rest of the marketing site. */}
          <div className="bg-amber-light border-[1.5px] border-amber rounded-xl px-7 py-6 text-center">
            <p className="text-navy text-[16px] font-medium leading-relaxed mb-2">
              This is how every piece of work gets marked in lessons.
            </p>
            <p className="text-muted-foreground text-[14.5px] leading-relaxed mb-4">
              Small groups of 2–4 in Kovan, Singapore. Send a question over WhatsApp and Adrian will
              tell you where the marks are going.
            </p>
            <WhatsAppCTA text="Ask Adrian a question" />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
