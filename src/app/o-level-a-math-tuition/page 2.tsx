import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import {
  LandingNav,
  LandingHero,
  WhatsAppCTA,
  TopicGrid,
  HighlightBox,
  FAQItem,
  Section,
  SP,
} from '@/components/LandingPage';

export const metadata: Metadata = {
  title: "O-Level Additional Mathematics (A Math) Tuition Singapore | Adrian's Math Tuition",
  description:
    'Small group A Math tuition for Secondary 3 and 4 students in Kovan, Singapore. Personalised attention, proven results. Enquire now.',
  alternates: {
    canonical: 'https://adrianmathtuition.com/o-level-a-math-tuition',
  },
};

const topics = [
  'Algebra & Polynomials',
  'Exponential & Log Functions',
  'Trigonometry',
  'Differentiation',
  'Integration',
  'Binomial Theorem',
  'Coordinate Geometry',
  'Proofs in Plane Geometry',
];

const faqs = [
  {
    q: 'Is A Math tuition necessary for O-Level students?',
    a: 'Students aiming for science or engineering courses at university strongly benefit from A Math. Many find the jump from E Math steep, and early tuition support in Secondary 3 makes a significant difference to O-Level outcomes.',
  },
  {
    q: 'When should my child start A Math tuition?',
    a: 'Secondary 3 is the ideal time to start. The syllabus introduces many new concepts and starting early allows students to build a strong foundation before the O-Level year.',
  },
  {
    q: 'What is the class size?',
    a: 'Classes are kept very small (2–4 students) to ensure individual attention for every student.',
  },
  {
    q: 'Where are classes held?',
    a: 'Classes are held in the Kovan and Hougang area of Singapore.',
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

export default function OLevelAMathPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <LandingNav />
      <main className="pt-16">
        <LandingHero
          title="O-Level Additional Mathematics Tuition"
          subtitle="Small group tuition for Secondary 3 & 4 students in Kovan, Singapore. Personalised attention, proven results."
          ctaText="Enquire via WhatsApp"
        />

        <div className="max-w-[800px] mx-auto px-6 py-14">

          <Section title="What is O-Level Additional Mathematics?">
            <SP>
              Additional Mathematics (A Math) is taken alongside Elementary Mathematics (E Math) by
              Secondary 3 and 4 students pursuing the Singapore O-Level examinations. It covers
              significantly more advanced concepts than E Math, and is essential preparation for JC
              H2 Mathematics.
            </SP>
            <SP>Key topics include:</SP>
            <TopicGrid topics={topics} />
          </Section>

          <Section title="Who is this for?">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <HighlightBox title="Secondary 3 Students">
                Starting early gives you a strong foundation before the content builds. Sec 3 is the
                ideal entry point — the earlier, the better.
              </HighlightBox>
              <HighlightBox title="Secondary 4 Students">
                With O-Levels approaching, targeted exam preparation and gap-filling make a real
                difference to your final grade.
              </HighlightBox>
            </div>
          </Section>

          <Section title="What makes these classes different?">
            <SP>
              <strong>Very small groups.</strong> Classes are capped at 2–4 students, so you always
              get individual attention. No hiding at the back of a big class.
            </SP>
            <SP>
              <strong>Questions answered immediately.</strong> Every lesson is driven by what you
              find difficult — not a rigid schedule. If you&apos;re stuck, we stop and fix it.
            </SP>
            <SP>
              <strong>WhatsApp support between lessons.</strong> Got stuck on homework at 10pm? Send
              it over. Adrian replies personally.
            </SP>
            <SP>
              <strong>Materials provided.</strong> Notes, practice papers, and worked solutions are
              all included at no extra cost.
            </SP>
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
            <WhatsAppCTA text="Enquire via WhatsApp" size="lg" />
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
