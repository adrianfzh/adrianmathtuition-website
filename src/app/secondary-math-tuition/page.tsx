import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import {
  LandingNav,
  LandingHero,
  WhatsAppCTA,
  TopicGrid,
  HighlightBox,
  FAQItem,
  Callout,
  Section,
  SP,
} from '@/components/LandingPage';

export const metadata: Metadata = {
  title: "Secondary 1 & 2 Mathematics Tuition Singapore | Adrian's Math Tuition",
  description:
    'Build a strong math foundation in Secondary 1 and 2. Small group E Math tuition in Kovan, Singapore. Early start, better results.',
  alternates: {
    canonical: 'https://adrianmathtuition.com/secondary-math-tuition',
  },
};

const topics = [
  'Algebra & Equations',
  'Indices & Surds',
  'Number Theory',
  'Geometry & Mensuration',
  'Coordinate Geometry',
  'Trigonometry Basics',
  'Statistics & Probability',
  'Graphs & Functions',
];

const faqs = [
  {
    q: 'Is tuition necessary for Sec 1 and Sec 2 students?',
    a: 'Starting tuition early in Sec 1 or Sec 2 allows students to build a strong foundation before the syllabus becomes more demanding. Students who start early consistently perform better at O-Levels compared to those who start in Sec 3 or 4.',
  },
  {
    q: 'What topics are covered for Sec 1 and 2?',
    a: 'We cover the full MOE E Math syllabus including algebra, geometry, statistics, and number theory — building the exact foundation needed for Sec 3 A Math and O-Level success.',
  },
  {
    q: 'How small are the classes?',
    a: 'Classes are kept at 2–4 students so every student gets personal attention and can ask questions freely.',
  },
  {
    q: 'My child is struggling in school — is it too late to start?',
    a: 'It is never too late. Many students who join in Sec 2 after struggling in Sec 1 make significant improvements within a few months with the right support.',
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default function SecondaryMathPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <LandingNav />
      <main className="pt-16">
        <LandingHero
          title="Secondary 1 & 2 Mathematics Tuition"
          subtitle="Build a strong foundation early. Small group E Math tuition in Kovan, Singapore — because the earlier you start, the better your O-Level results."
          ctaText="Start early, finish strong. Enquire via WhatsApp"
        />

        <div className="max-w-[800px] mx-auto px-6 py-14">

          <Callout>
            📈 Students who start tuition in Sec 1 or Sec 2 consistently outperform those who only
            begin in Sec 3 or 4. The foundation built early makes everything that follows
            significantly easier.
          </Callout>

          <Section title="Why start in Secondary 1 or 2?">
            <SP>
              The transition from primary school maths to secondary school maths is bigger than most
              students expect. Algebra, geometry, and number theory arrive all at once — and gaps
              formed in Sec 1 compound into bigger problems by the time O-Levels come around.
            </SP>
            <SP>
              Students who get the right support early don&apos;t just do better in Sec 1 and 2 —
              they arrive at Sec 3 with the confidence and foundation to tackle A Math with ease,
              giving them a decisive advantage over their peers.
            </SP>
            <SP>
              The earlier a student builds a strong relationship with their tutor, the more
              personalised and effective the guidance becomes over time. We understand how each
              student thinks, where they get stuck, and how to explain things in a way that clicks
              for them.
            </SP>
          </Section>

          <Section title="What topics are covered?">
            <SP>We follow the full MOE E Math syllabus for Sec 1 and 2:</SP>
            <TopicGrid topics={topics} />
          </Section>

          <Section title="What makes these classes different?">
            <div className="flex flex-col gap-4">
              <HighlightBox title="Very small groups">
                Classes are capped at 2–4 students. Every student can ask questions freely — no
                hiding, no getting left behind.
              </HighlightBox>
              <HighlightBox title="Long-term relationship with your tutor">
                Students who start in Sec 1 benefit from years of consistent support from the same
                tutor who knows exactly how they learn. This continuity is invaluable as the
                syllabus grows more challenging.
              </HighlightBox>
              <HighlightBox title="WhatsApp support between lessons">
                Stuck on homework? Send it over. Adrian replies personally — usually within the same
                evening.
              </HighlightBox>
              <HighlightBox title="All materials included">
                Notes, worksheets, and practice papers are provided at no extra cost.
              </HighlightBox>
            </div>
          </Section>

          <Section title="Location">
            <SP>
              Classes are held in the <strong>Kovan / Hougang area</strong> of Singapore,
              conveniently accessible by MRT (Kovan station, NE Line).
            </SP>
          </Section>

          <Section title="Frequently Asked Questions">
            {faqs.map(({ q, a }) => (
              <FAQItem key={q} question={q} answer={a} />
            ))}
          </Section>

          <div className="text-center pt-6 pb-2">
            <WhatsAppCTA text="Start early, finish strong. Enquire via WhatsApp" size="lg" />
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
