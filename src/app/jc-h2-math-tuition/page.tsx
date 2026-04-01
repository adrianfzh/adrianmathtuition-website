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
  title: "JC H2 Mathematics Tuition Singapore | Adrian's Math Tuition",
  description:
    'Small group H2 Math tuition for JC1 and JC2 students in Kovan, Singapore. A-Level focused, personalised coaching. Enquire now.',
  alternates: {
    canonical: 'https://adrianmathtuition.com/jc-h2-math-tuition',
  },
};

const topics = [
  'Functions & Graphs',
  'Sequences & Series',
  'Vectors',
  'Complex Numbers',
  'Calculus (Differentiation)',
  'Calculus (Integration)',
  'Differential Equations',
  'Probability & Statistics',
];

const faqs = [
  {
    q: 'How is H2 Math different from O-Level Math?',
    a: 'H2 Math is significantly more abstract and proof-based than O-Level. Topics like Calculus, Vectors, and Statistics are covered in much greater depth. Many students benefit from tuition to consolidate concepts and build exam technique.',
  },
  {
    q: 'When should JC students start tuition?',
    a: 'JC1 is the best time to start. Building a strong foundation early prevents the common JC2 panic when content volume increases dramatically.',
  },
  {
    q: 'What is the class size?',
    a: 'Classes are kept very small (2–3 students for JC) to ensure each student gets focused attention.',
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

export default function JCH2MathPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <LandingNav />
      <main className="pt-16">
        <LandingHero
          title="JC H2 Mathematics Tuition"
          subtitle="Small group A-Level coaching for JC1 & JC2 students in Kovan, Singapore. Personalised, focused, results-driven."
          ctaText="Enquire via WhatsApp"
        />

        <div className="max-w-[800px] mx-auto px-6 py-14">

          <Section title="What is H2 Mathematics?">
            <SP>
              H2 Mathematics is one of the most demanding A-Level subjects in Singapore. It is taken
              by students aiming for STEM-related university courses and requires strong conceptual
              understanding as well as consistent exam technique.
            </SP>
            <SP>Key topics include:</SP>
            <TopicGrid topics={topics} />
          </Section>

          <Section title="Who is this for?">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <HighlightBox title="JC1 Students">
                Start early and build a solid foundation before JC2. Students who start in JC1
                consistently avoid the last-minute panic that trips up so many A-Level students.
              </HighlightBox>
              <HighlightBox title="JC2 Students">
                A-Levels are around the corner. Focused exam preparation, gap-filling, and timed
                practice make a real difference in the final stretch.
              </HighlightBox>
            </div>
          </Section>

          <Section title="What makes these classes different?">
            <SP>
              <strong>Tiny groups — maximum 3 students for JC.</strong> Every student gets direct
              attention, not just a seat in the room.
            </SP>
            <SP>
              <strong>Concept-first approach.</strong> H2 Math rewards deep understanding. We build
              that understanding first, then apply it to exam questions.
            </SP>
            <SP>
              <strong>WhatsApp support.</strong> Stuck on a problem between lessons? Send it over.
              Adrian replies personally.
            </SP>
            <SP>
              <strong>All materials included.</strong> Notes, practice papers, past-year worked
              solutions — everything you need, at no extra cost.
            </SP>
          </Section>

          <Section title="Location">
            <SP>
              Classes are held in the <strong>Kovan / Hougang area</strong> of Singapore, accessible
              via Kovan MRT (NE Line).
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
