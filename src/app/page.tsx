import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ScheduleTable from '@/components/ScheduleTable';
import FAQ from '@/components/FAQ';
import { faqs } from '@/lib/faqs';
import Link from 'next/link';
import { Reveal, CountUp, MinutesBar } from '@/components/Motion';

// ── SEO structured data (JSON-LD) ────────────────────────────────────────────
// Server-rendered into the HTML so Google reads it without executing JS.
// LocalBusiness: connects the site to local-intent searches ("math tuition
// Singapore"). FAQPage: makes results eligible for expandable Q&A rich snippets.
const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': 'https://www.adrianmathtuition.com/#business',
  name: "Adrian's Math Tuition",
  description:
    'Personalized small-group math tuition in Singapore for Secondary (E Math, A Math) and JC (H1, H2 Math) students. Max 4 students per Secondary class, 3 per JC class, taught personally by Adrian.',
  url: 'https://www.adrianmathtuition.com',
  image: 'https://www.adrianmathtuition.com/adrian.jpg',
  telephone: '+6591397985',
  priceRange: '$320 - $360 per month',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Hougang',
    addressCountry: 'SG',
  },
  // Google Business Profile listing + its pin coordinates — ties the website
  // and the Maps listing together as one entity for local search.
  sameAs: ['https://maps.app.goo.gl/iyE8UwNJNRfF88Vr9'],
  geo: { '@type': 'GeoCoordinates', latitude: 1.3581182, longitude: 103.8844493 },
  areaServed: { '@type': 'Country', name: 'Singapore' },
  knowsAbout: ['O-Level E Math', 'O-Level A Math', 'JC H1 Math', 'JC H2 Math', 'Secondary Math Tuition', 'JC Math Tuition'],
  founder: { '@type': 'Person', name: 'Adrian' },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

const CheckIcon = () => (
  <svg className="w-4 h-4 text-amber flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg className="w-3 h-3 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const StarIcon = () => (
  <svg className="w-4 h-4 fill-amber text-amber" viewBox="0 0 24 24">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const Stars = () => <div className="flex gap-1">{Array(5).fill(0).map((_, i) => <StarIcon key={i}/>)}</div>;

const WA_SEC = "https://wa.me/6591397985?text=Hi%20Adrian%20I%27m%20interested%20in%20the%20free%20trial%20for%20secondary%20math%20lesson";
const WA_JC = "https://wa.me/6591397985?text=Hi%20Adrian%20I%27m%20interested%20in%20the%20free%20trial%20for%20JC%20math%20lesson";

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Nav />
      <main>

        {/* HERO + SCHEDULE */}
        <section className="relative overflow-hidden pt-24 pb-16 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <Reveal>
                <div className="inline-flex items-center gap-2 bg-amber-light text-[hsl(220,60%,15%)] px-4 py-1.5 rounded-full text-sm font-medium mb-7">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Small groups &middot; Sec: 4 students &middot; JC: 3 students
                </div>
              </Reveal>

              <Reveal delay={100}>
                <h1 className="font-display text-6xl md:text-7xl lg:text-8xl text-navy mb-5 leading-[1.05] tracking-tight">
                  Personalized Math<br />
                  <span className="text-amber">Coaching</span>
                </h1>
              </Reveal>

              <Reveal delay={200}>
                <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-9">
                  Learn exactly what you need, when you need it. No rigid syllabi &mdash; just your questions, answered immediately.
                </p>
              </Reveal>

              <Reveal delay={300}>
                <div className="inline-flex items-center gap-3.5 bg-card border border-border rounded-full py-2 pl-2 pr-6 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/adrian.jpg" alt="Adrian, Math Tutor" className="w-12 h-12 rounded-full object-cover border-2 border-amber" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-navy leading-tight">Taught personally by Adrian</p>
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5">10+ years teaching &middot; 500+ students coached</p>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal delay={150}>
              <ScheduleTable />
            </Reveal>
          </div>
        </section>

        {/* PRICING */}
        <section className="py-20 px-6 bg-muted/50">
          <div className="max-w-4xl mx-auto">
            <Reveal>
              <h2 className="font-display text-4xl md:text-5xl text-navy text-center mb-3">Simple, Transparent Pricing</h2>
              <p className="text-center text-muted-foreground mb-12">No material fees. No hidden costs. Just quality math tuition.</p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {/* Secondary - Featured */}
              <Reveal className="relative rounded-2xl p-8 bg-gradient-to-br from-navy to-navy-light border border-navy overflow-hidden shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <span className="absolute top-4 right-4 bg-amber text-[hsl(220,60%,15%)] text-xs font-bold px-3 py-1 rounded-full">Popular</span>
                <h3 className="text-[hsl(45,100%,96%)] text-lg font-semibold mb-1">Secondary</h3>
                <p className="text-[hsl(45,100%,96%)] opacity-60 text-sm mb-4">Lower Sec Math &middot; A-Math &middot; E-Math &middot; IP Math &middot; Max 4 students</p>
                <div className="mb-6">
                  <span className="text-[hsl(45,100%,96%)] text-4xl font-bold">$320</span>
                  <span className="text-[hsl(45,100%,96%)] opacity-60">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['1 lesson per week', '2 hours per lesson', 'Small group of max 4', 'Personalized worksheets', 'WhatsApp support', 'Free replacement lessons'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-[hsl(45,100%,96%)] text-sm"><CheckIcon />{f}</li>
                  ))}
                </ul>
                <a href={WA_SEC} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-amber text-[hsl(220,60%,15%)] py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Book Free Trial
                </a>
              </Reveal>

              {/* JC */}
              <Reveal delay={120} className="rounded-2xl p-8 bg-card border border-border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <h3 className="text-navy text-lg font-semibold mb-1">Junior College</h3>
                <p className="text-muted-foreground text-sm mb-4">H1 &amp; H2 Math &middot; Max 3 students</p>
                <div className="mb-6">
                  <span className="text-navy text-4xl font-bold">$360</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['1 lesson per week', '2 hours per lesson', 'Small group of max 3', 'Personalized worksheets', 'WhatsApp support', 'Free replacement lessons'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-foreground text-sm"><CheckIcon />{f}</li>
                  ))}
                </ul>
                <a href={WA_JC} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-navy text-[hsl(45,100%,96%)] py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Book Free Trial
                </a>
              </Reveal>
            </div>
          </div>
        </section>

        {/* WHY SMALL GROUPS */}
        <section className="py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 bg-amber-light text-[hsl(220,60%,15%)] px-4 py-1.5 rounded-full text-sm font-medium mb-6">
                  🎯 The Adrian&apos;s Math Difference
                </div>
                <h2 className="font-display text-4xl md:text-5xl text-navy mb-4">Why Small Groups Change Everything</h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">In large classes, you wait your turn. Here, learning happens at your speed.</p>
              </div>
            </Reveal>

            {/* 3 Why Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
              {[
                {
                  icon: <svg className="w-7 h-7 text-amber-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
                  title: 'Maximum Attention',
                  text: 'With only 3\u20134 students, you get over 30 minutes of personal attention every session. No waiting, no being overlooked.',
                },
                {
                  icon: <svg className="w-7 h-7 text-amber-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                  title: 'Collaborative, Not Crowded',
                  text: 'Learn alongside peers without the noise. Small enough to ask any question, big enough for motivation.',
                },
                {
                  icon: <svg className="w-7 h-7 text-amber-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                  title: 'Cost-Effective',
                  text: 'Get near-private tuition quality at a fraction of the cost. The best of both worlds.',
                },
              ].map((card, i) => (
                <Reveal key={card.title} delay={i * 120} className="text-center p-6">
                  <div className="w-14 h-14 rounded-2xl bg-amber-light flex items-center justify-center mx-auto mb-4">
                    {card.icon}
                  </div>
                  <h3 className="font-display text-xl text-navy mb-2">{card.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.text}</p>
                </Reveal>
              ))}
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto mb-16">
              <Reveal className="bg-card rounded-2xl border border-border p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="text-center mb-6">
                  <div className="text-5xl mb-3">👥👥👥👥</div>
                  <h3 className="font-bold text-navy text-xl mb-1">Traditional Classes</h3>
                  <p className="text-muted-foreground text-sm font-semibold">20&ndash;30 students</p>
                </div>
                <ul className="space-y-4">
                  {[
                    'Follow rigid lesson plans topic by topic',
                    'Wait for next lesson to clarify doubts',
                    'Rush through or feel bored depending on pace',
                    "Struggle silently when you don't understand",
                    'Generic practice that may not address your gaps',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5"><XIcon /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={120} className="relative bg-card rounded-2xl border-2 border-amber p-8 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber text-[hsl(220,60%,15%)] text-xs font-bold px-4 py-1 rounded-full">
                  ✨ Our Approach
                </div>
                <div className="text-center mb-6">
                  <div className="text-5xl mb-3">👤👤👤👤</div>
                  <h3 className="font-bold text-navy text-xl mb-1">Adrian&apos;s Math</h3>
                  <p className="text-muted-foreground text-sm font-semibold">Sec: Max 4 &middot; JC: Max 3</p>
                </div>
                <ul className="space-y-4">
                  {[
                    'Jump straight to what you need help with',
                    'Get immediate answers\u2014confusion cleared instantly',
                    'Learn at your natural pace\u2014no waiting, no rushing',
                    'Speak up freely in our small, safe environment',
                    'Practice precisely what YOU need to improve',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm font-medium text-foreground">
                      <span className="w-5 h-5 rounded-full bg-amber/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3 text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* Callout */}
            <Reveal className="bg-amber-light/50 border-2 border-amber/30 rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-start max-w-3xl mx-auto mb-16">
              <span className="text-4xl flex-shrink-0">💡</span>
              <div>
                <h3 className="font-bold text-navy text-lg mb-2">Here&apos;s What This Means For You</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Imagine struggling with calculus integration while the class moves on to differentiation. In a large class, you&apos;re stuck&mdash;forced to keep up while missing fundamentals.{' '}
                  <strong className="text-foreground">With our small groups, we stop, rewind, and ensure you master integration before moving forward.</strong>{' '}
                  You don&apos;t adapt to the curriculum&mdash;the curriculum adapts to you.
                </p>
              </div>
            </Reveal>

            {/* Math Box — the signature argument, staged as a dark showpiece */}
            <Reveal className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light rounded-3xl shadow-xl p-8 md:p-12 max-w-3xl mx-auto">
              <div aria-hidden className="pointer-events-none select-none absolute -top-10 -right-6 font-display text-[160px] leading-none text-white/[0.05] rotate-[10deg]">&divide;</div>
              <h3 className="font-display text-3xl md:text-4xl text-[hsl(45,100%,96%)] text-center mb-10">The Mathematics of Personal Attention</h3>

              <div className="space-y-8 mb-10 max-w-xl mx-auto">
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-[hsl(45,100%,96%)] opacity-80 text-sm font-semibold">Large class &middot; 20 students</p>
                    <p className="font-mono font-bold text-xl text-rose-300"><CountUp value={6} duration={1000} /> min<span className="text-xs font-normal opacity-70"> /student</span></p>
                  </div>
                  <MinutesBar minutes={6} max={30} barClass="bg-rose-400/80" />
                  <p className="text-[hsl(45,100%,96%)] opacity-50 text-xs mt-2">120 minutes &divide; 20 students &mdash; barely enough to ask one question</p>
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-[hsl(45,100%,96%)] opacity-80 text-sm font-semibold">Adrian&apos;s Math &middot; max 4 students</p>
                    <p className="font-mono font-bold text-xl text-amber"><CountUp value={30} duration={1500} /> min<span className="text-xs font-normal opacity-70"> /student</span></p>
                  </div>
                  <MinutesBar minutes={30} max={30} barClass="bg-amber" />
                  <p className="text-[hsl(45,100%,96%)] opacity-50 text-xs mt-2">120 minutes &divide; 4 students &mdash; enough to actually understand and practice</p>
                </div>
              </div>

              <div className="text-center">
                <p className="font-display text-5xl md:text-6xl text-amber mb-2"><CountUp value={5} duration={1600} suffix="×" /></p>
                <p className="text-[hsl(45,100%,96%)] opacity-80 text-sm max-w-md mx-auto leading-relaxed">
                  more personal attention &mdash; enough time to identify gaps, explain concepts, practice together, and ensure true understanding, not just memorization.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="py-20 px-6 bg-muted/50">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <h2 className="font-display text-4xl md:text-5xl text-navy text-center mb-3">What Students Say</h2>
              <p className="text-center text-muted-foreground mb-12">Real results from real students</p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {[
                {
                  badge: 'F9 \u2192 A1 \u00b7 O-Level A-Math',
                  text: "\"Thanks to Adrian, my A-math improved from F9 to A1 in the O\u2019 levels. Apart from shortcuts and tricks, he guides students to appreciate and even love mathematics.\"",
                  role: 'Student',
                  school: "St Andrew's Secondary School",
                },
                {
                  badge: 'F9 \u2192 A1 in one term \u00b7 A & E Math',
                  text: '"My son was struggling with both A Math and E Math \u2014 F9 in mid-year exams. After just one term, he scored A1 for both subjects by year end."',
                  role: 'Parent',
                  school: 'North Vista Secondary School',
                },
                {
                  badge: null,
                  text: '"Adrian is extremely patient and has a knack for explaining complex concepts so they are much easier to understand."',
                  role: 'Student',
                  school: "Cedar Girl's Secondary School",
                },
                {
                  badge: null,
                  text: "\"The worksheets were plentiful and challenging. I love how flexible Adrian is \u2014 if we had questions from school work, he'd happily help. He even replies on WhatsApp between lessons.\"",
                  role: 'Student',
                  school: 'CHIJ Toa Payoh Secondary School',
                },
              ].map((t, i) => (
                <Reveal key={i} delay={(i % 2) * 120} className="bg-card rounded-2xl border border-border p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <Stars />
                    {t.badge && <span className="bg-amber/15 text-amber-dark text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap">{t.badge}</span>}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed mb-4">{t.text}</p>
                  <p className="text-xs font-semibold text-navy">{t.role}</p>
                  <p className="text-xs text-muted-foreground">{t.school}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* OUR PROGRAMMES */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <Reveal>
              <h2 className="font-display text-4xl md:text-5xl text-navy text-center mb-12">Our Programmes</h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: <svg className="w-6 h-6 text-amber-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.4 0 3.4Z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg>,
                  title: 'Secondary Math Tuition',
                  desc: 'Lower Secondary and Upper Secondary E Math. Build a strong foundation for O-Level success.',
                  href: '/secondary-math-tuition',
                },
                {
                  icon: <svg className="w-6 h-6 text-amber-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
                  title: 'O-Level A Math Tuition',
                  desc: 'Additional Mathematics for Sec 3 & 4. Essential for students targeting science or engineering at university.',
                  href: '/o-level-a-math-tuition',
                },
                {
                  icon: <svg className="w-6 h-6 text-amber-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>,
                  title: 'JC H2 Math Tuition',
                  desc: 'A-Level H2 Mathematics for JC1 & JC2. Personalised coaching to build exam technique and confidence.',
                  href: '/jc-h2-math-tuition',
                },
              ].map((prog, i) => (
                <Reveal key={prog.href} delay={i * 120}>
                  <Link
                    href={prog.href}
                    className="block h-full bg-card border border-border rounded-xl p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-light flex items-center justify-center mb-4">{prog.icon}</div>
                    <h3 className="font-display text-lg text-navy mb-2">{prog.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">{prog.desc}</p>
                    <p className="text-sm text-amber-dark font-semibold">Learn more &rarr;</p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 px-6">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-4xl text-navy text-center mb-3">Frequently Asked Questions</h2>
            <p className="text-center text-muted-foreground mb-12">Everything you need to know</p>
            <FAQ />
          </div>
        </section>

        {/* ABOUT */}
        <section className="py-20 px-6 bg-card">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-16 items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/adrian.jpg"
                alt="Adrian, Math Tutor"
                className="w-full rounded-2xl shadow-lg object-cover"
              />
              <div>
                <h2 className="font-display text-4xl text-navy mb-6">If you are curious...</h2>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  👋 Hi! I&apos;m Adrian. I&apos;ve been helping students crack the math code for over a decade now &mdash; and honestly, I still get excited when a student finally has that &ldquo;aha!&rdquo; moment.
                </p>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  🎯 Here&apos;s my philosophy: No student is &ldquo;bad at math.&rdquo; You just haven&apos;t found the right explanation yet. My job? Finding that explanation for you &mdash; whether it&apos;s at 3pm on a Tuesday or via WhatsApp at 11pm before your test.
                </p>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  💬 I&apos;m that tutor who actually replies on WhatsApp. Got stuck on a tricky question at midnight? Send it over. Confused about something from today&apos;s school lesson? Let&apos;s clear it up before it piles up.
                </p>
                <p className="text-base text-muted-foreground leading-relaxed mb-8">
                  🚀 The best part? Watching students go from &ldquo;I hate math&rdquo; to &ldquo;Wait, that&apos;s actually pretty cool&rdquo; to acing their exams. That never gets old.
                </p>

                <div className="grid grid-cols-3 gap-6 pt-8 border-t border-border">
                  {[
                    { value: 10, suffix: '+', label: 'Years Teaching' },
                    { value: 500, suffix: '+', label: 'Happy Students' },
                    { value: 24, suffix: '/7', label: 'WhatsApp Support' },
                  ].map(stat => (
                    <div key={stat.label} className="text-center">
                      <p className="text-4xl font-extrabold text-navy mb-1"><CountUp value={stat.value} suffix={stat.suffix} /></p>
                      <p className="text-xs text-muted-foreground font-semibold">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
