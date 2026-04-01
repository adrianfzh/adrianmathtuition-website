import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ScheduleTable from '@/components/ScheduleTable';
import FAQ from '@/components/FAQ';
import Link from 'next/link';

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

const Stars = () => <div className="flex gap-1 mb-3">{Array(5).fill(0).map((_, i) => <StarIcon key={i}/>)}</div>;

const WA_SEC = "https://wa.me/6591397985?text=Hi%20Adrian%20I%27m%20interested%20in%20the%20free%20trial%20for%20secondary%20math%20lesson";
const WA_JC = "https://wa.me/6591397985?text=Hi%20Adrian%20I%27m%20interested%20in%20the%20free%20trial%20for%20JC%20math%20lesson";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>

        {/* HERO + SCHEDULE */}
        <section className="pt-24 pb-16 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-amber-light text-[hsl(220,60%,15%)] px-4 py-1.5 rounded-full text-sm font-medium mb-6">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Small groups &middot; Sec: 4 students &middot; JC: 3 students
              </div>

              <h1 className="font-display text-5xl md:text-6xl text-navy mb-4 leading-tight">
                Personalized Math<br />
                <span className="text-amber">Coaching</span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
                Learn exactly what you need, when you need it. No rigid syllabi &mdash; just your questions, answered immediately.
              </p>

              <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                    <path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>
                  </svg>
                  10+ years experience
                </span>
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Individual attention
                </span>
              </div>
            </div>

            <ScheduleTable />
          </div>
        </section>

        {/* PRICING */}
        <section className="py-20 px-6 bg-muted/50">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-display text-4xl text-navy text-center mb-3">Simple, Transparent Pricing</h2>
            <p className="text-center text-muted-foreground mb-12">No material fees. No hidden costs. Just quality math tuition.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {/* Secondary - Featured */}
              <div className="relative rounded-2xl p-8 bg-gradient-to-br from-navy to-navy-light border border-navy overflow-hidden shadow-md">
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
              </div>

              {/* JC */}
              <div className="rounded-2xl p-8 bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
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
              </div>
            </div>
          </div>
        </section>

        {/* WHY SMALL GROUPS */}
        <section className="py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 bg-amber-light text-[hsl(220,60%,15%)] px-4 py-1.5 rounded-full text-sm font-medium mb-6">
                🎯 The Adrian&apos;s Math Difference
              </div>
              <h2 className="font-display text-4xl text-navy mb-4">Why Small Groups Change Everything</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">In large classes, you wait your turn. Here, learning happens at your speed.</p>
            </div>

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
              ].map(card => (
                <div key={card.title} className="text-center p-6">
                  <div className="w-14 h-14 rounded-2xl bg-amber-light flex items-center justify-center mx-auto mb-4">
                    {card.icon}
                  </div>
                  <h3 className="font-display text-xl text-navy mb-2">{card.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.text}</p>
                </div>
              ))}
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto mb-16">
              <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
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
              </div>

              <div className="relative bg-card rounded-2xl border-2 border-amber p-8 shadow-md">
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
              </div>
            </div>

            {/* Callout */}
            <div className="bg-amber-light/50 border-2 border-amber/30 rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-start max-w-3xl mx-auto mb-16">
              <span className="text-4xl flex-shrink-0">💡</span>
              <div>
                <h3 className="font-bold text-navy text-lg mb-2">Here&apos;s What This Means For You</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Imagine struggling with calculus integration while the class moves on to differentiation. In a large class, you&apos;re stuck&mdash;forced to keep up while missing fundamentals.{' '}
                  <strong className="text-foreground">With our small groups, we stop, rewind, and ensure you master integration before moving forward.</strong>{' '}
                  You don&apos;t adapt to the curriculum&mdash;the curriculum adapts to you.
                </p>
              </div>
            </div>

            {/* Math Box */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-12 max-w-3xl mx-auto">
              <h3 className="font-display text-3xl text-navy text-center mb-8">The Mathematics of Personal Attention</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="bg-muted/50 rounded-xl p-6 border border-border">
                  <p className="font-bold text-navy mb-4">Large Class (20 students)</p>
                  <p className="font-mono text-muted-foreground text-sm mb-2">120 minutes &divide; 20 students</p>
                  <div className="bg-red-50 text-red-600 font-mono font-bold text-xl text-center py-3 rounded-lg">= 6 minutes per student</div>
                  <p className="text-muted-foreground text-xs text-center mt-3">Barely enough to ask one question</p>
                </div>
                <div className="bg-amber/5 rounded-xl p-6 border-2 border-amber/30">
                  <p className="font-bold text-navy mb-4">Adrian&apos;s Math (Max 4 students)</p>
                  <p className="font-mono text-muted-foreground text-sm mb-2">120 minutes &divide; 4 students</p>
                  <div className="bg-amber/10 text-amber-dark font-mono font-bold text-xl text-center py-3 rounded-lg">= 30 minutes per student</div>
                  <p className="text-muted-foreground text-xs text-center mt-3">Enough to actually understand and practice</p>
                </div>
              </div>
              <div className="bg-muted/30 rounded-xl p-6 text-center text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">That&apos;s 5&times; more personal attention.</strong> Enough time to identify gaps, explain concepts, practice together, and ensure true understanding&mdash;not just memorization.
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="py-20 px-6 bg-muted/50">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-display text-4xl text-navy text-center mb-3">What Students Say</h2>
            <p className="text-center text-muted-foreground mb-12">Real results from real students</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {[
                {
                  text: "\"Thanks to Adrian, my A-math improved from F9 to A1 in the O\u2019 levels. Apart from shortcuts and tricks, he guides students to appreciate and even love mathematics.\"",
                  role: 'Student',
                  school: "St Andrew's Secondary School",
                },
                {
                  text: '"My son was struggling with both A Math and E Math \u2014 F9 in mid-year exams. After just one term, he scored A1 for both subjects by year end."',
                  role: 'Parent',
                  school: 'North Vista Secondary School',
                },
                {
                  text: '"Adrian is extremely patient and has a knack for explaining complex concepts so they are much easier to understand."',
                  role: 'Student',
                  school: "Cedar Girl's Secondary School",
                },
                {
                  text: "\"The worksheets were plentiful and challenging. I love how flexible Adrian is \u2014 if we had questions from school work, he'd happily help. He even replies on WhatsApp between lessons.\"",
                  role: 'Student',
                  school: 'CHIJ Toa Payoh Secondary School',
                },
              ].map((t, i) => (
                <div key={i} className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                  <Stars />
                  <p className="text-sm text-foreground leading-relaxed mb-4">{t.text}</p>
                  <p className="text-xs font-semibold text-navy">{t.role}</p>
                  <p className="text-xs text-muted-foreground">{t.school}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* OUR PROGRAMMES */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-display text-4xl text-navy text-center mb-12">Our Programmes</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  emoji: '📐',
                  title: 'Secondary Math Tuition',
                  desc: 'Lower Secondary and Upper Secondary E Math. Build a strong foundation for O-Level success.',
                  href: '/secondary-math-tuition',
                },
                {
                  emoji: '📊',
                  title: 'O-Level A Math Tuition',
                  desc: 'Additional Mathematics for Sec 3 & 4. Essential for students targeting science or engineering at university.',
                  href: '/o-level-a-math-tuition',
                },
                {
                  emoji: '🎓',
                  title: 'JC H2 Math Tuition',
                  desc: 'A-Level H2 Mathematics for JC1 & JC2. Personalised coaching to build exam technique and confidence.',
                  href: '/jc-h2-math-tuition',
                },
              ].map(prog => (
                <Link
                  key={prog.href}
                  href={prog.href}
                  className="block bg-card border border-border rounded-xl p-7 hover:shadow-md transition-shadow"
                >
                  <div className="text-3xl mb-3">{prog.emoji}</div>
                  <h3 className="font-display text-lg text-navy mb-2">{prog.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{prog.desc}</p>
                  <p className="text-sm text-amber-dark font-semibold">Learn more &rarr;</p>
                </Link>
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
                    { num: '10+', label: 'Years Teaching' },
                    { num: '500+', label: 'Happy Students' },
                    { num: '24/7', label: 'WhatsApp Support' },
                  ].map(stat => (
                    <div key={stat.label} className="text-center">
                      <p className="text-4xl font-extrabold text-navy mb-1">{stat.num}</p>
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
