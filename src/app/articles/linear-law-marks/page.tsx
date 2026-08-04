import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { WhatsAppCTA } from '@/components/LandingPage';
import { ogCard } from '@/lib/og';

const DESC =
  'The three places O-Level A Math students lose marks in linear law — choosing the wrong axes, misreading the gradient and intercept, and forgetting to un-log — and the fix for each.';

export const metadata: Metadata = {
  title: "How to Stop Losing Marks in Linear Law | Adrian's Math Tuition",
  description: DESC,
  alternates: {
    canonical: 'https://adrianmathtuition.com/articles/linear-law-marks',
  },
  ...ogCard({
    card: 'How to stop losing marks in Linear Law',
    cardSub: 'Wrong axes, a misread gradient, forgetting to un-log — and the fix for each.',
    tag: 'O-Level A Math',
    title: 'How to stop losing marks in Linear Law',
    description: DESC,
    path: '/articles/linear-law-marks',
    type: 'article',
  }),
};

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Stop Losing Marks in Linear Law',
  description:
    'The three classic linear law mistakes in O-Level A Math — wrong axes, a misread gradient, and forgetting to un-log — with the fix for each.',
  author: { '@type': 'Person', name: 'Adrian Fong' },
  publisher: { '@type': 'Organization', name: "Adrian's Math Tuition" },
  datePublished: '2026-08-04',
  mainEntityOfPage: 'https://adrianmathtuition.com/articles/linear-law-marks',
  about: 'Linear Law, O-Level Additional Mathematics',
};

// ── Article-local building blocks ────────────────────────────────────────────
// Gradient = teal, intercept = rose — the same two colours the Linear Law tool
// uses for m and c, so the article and the tool read as one thing.

function Eq({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="my-5 rounded-xl border border-border bg-[hsl(45,50%,97%)] px-5 py-4 text-center">
      <div className="font-display text-[19px] sm:text-[22px] text-navy leading-[1.6]">
        {children}
      </div>
      {note && <p className="text-[13px] text-muted-foreground mt-2.5 leading-relaxed">{note}</p>}
    </div>
  );
}

function M({ children }: { children: React.ReactNode }) {
  return <span className="text-[#2E7C8F]">{children}</span>;
}

function C({ children }: { children: React.ReactNode }) {
  return <span className="text-[#BC5A6E]">{children}</span>;
}

function Legend() {
  return (
    <p className="text-[13px] text-muted-foreground text-center -mt-2 mb-5">
      <M>■</M> gradient <em>m</em> &nbsp;·&nbsp; <C>■</C> intercept <em>c</em>
    </p>
  );
}

function Mistake({
  n,
  title,
  strap,
  children,
}: {
  n: number;
  title: string;
  strap: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-amber-dark mb-2">
        Mistake {n}
      </p>
      <h2 className="font-display text-[1.6rem] sm:text-[1.85rem] text-navy leading-[1.25] mb-2">
        {title}
      </h2>
      <p className="text-muted-foreground text-[15px] italic mb-5 leading-relaxed">{strap}</p>
      {children}
    </section>
  );
}

function WrongRight({ wrong, right }: { wrong: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-rose-800 mb-1.5">
          What gets written
        </div>
        <div className="text-[15px] leading-relaxed text-foreground">{wrong}</div>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-emerald-800 mb-1.5">
          What earns the mark
        </div>
        <div className="text-[15px] leading-relaxed text-foreground">{right}</div>
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-base mb-4 leading-[1.8]">{children}</p>;
}

// The worked example that runs through the whole article: y = 5(2ˣ).
const TABLE: [string, string, string][] = [
  ['2', '20.0', '1.301'],
  ['4', '80.0', '1.903'],
  ['6', '320', '2.505'],
  ['8', '1280', '3.107'],
  ['10', '5120', '3.709'],
];

export default function LinearLawMarksArticle() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <Nav />
      <main className="pt-16 bg-background">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="border-b border-border bg-card">
          <div className="max-w-[720px] mx-auto px-6 pt-12 pb-10">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-amber-dark mb-3">
              O-Level A Math &nbsp;·&nbsp; Linear Law
            </p>
            <h1 className="font-display text-[2.1rem] sm:text-[2.7rem] text-navy leading-[1.15] mb-5">
              How to stop losing marks in Linear Law
            </h1>
            <p className="text-[18px] text-muted-foreground leading-[1.7]">
              Linear law is not a hard topic. It is a topic where nearly all the lost marks come
              from three predictable places — and none of the three is the actual mathematics.
            </p>
            <p className="text-[13px] text-muted-foreground mt-6 pt-5 border-t border-border">
              Written for Secondary 3 and 4 students taking Additional Mathematics. About seven
              minutes to read, and worth more than that in a Paper 2.
            </p>
          </div>
        </header>

        <div className="max-w-[720px] mx-auto px-6 py-12">
          {/* ── The one idea ─────────────────────────────────────────────── */}
          <section className="mb-14">
            <h2 className="font-display text-[1.6rem] sm:text-[1.85rem] text-navy leading-[1.25] mb-4">
              The whole topic in one sentence
            </h2>
            <P>
              You are handed a relationship with two unknown constants in it — <em>y</em> ={' '}
              <em>ab</em>
              <sup>x</sup>, or <em>y</em> = <em>ax</em>
              <sup>n</sup>, or <em>xy</em> = <em>ax</em> + <em>b</em> — together with a table of
              measured values. You cannot read constants off a curve. You can read them off a
              straight line, because a straight line has exactly two things to give you: a gradient
              and an intercept.
            </P>
            <P>
              So the entire job is to rewrite the relationship, and to re-label the table, until
              what you are plotting reads:
            </P>
            <Eq note="Y and X are things you compute from the table. m and c are where your two constants are hiding.">
              <em>Y</em> = <M><em>m</em></M>
              <em>X</em> + <C><em>c</em></C>
            </Eq>
            <P>
              That is it. Every mark that gets dropped in this topic gets dropped because a step
              drifted away from that sentence. Here are the three places it happens.
            </P>
          </section>

          {/* ── Mistake 1 ────────────────────────────────────────────────── */}
          <Mistake
            n={1}
            title="Choosing the axes by pattern-matching instead of deriving them"
            strap="The most expensive mistake, because everything after it is built on top of it."
          >
            <P>
              The question says <em>y</em> = <em>ab</em>
              <sup>x</sup>. The student remembers that linear law means logs, plots lg <em>y</em>{' '}
              against lg <em>x</em>, gets points that don&rsquo;t quite line up, draws a line of
              best fit through them anyway, and loses the plotting marks plus everything downstream.
              The working after that point can be flawless and it still scores nothing.
            </P>
            <P>
              This happens because the choice is being made on the word &ldquo;log&rdquo; rather
              than on the algebra. So do the algebra — every time, even when you are sure you know
              the answer. It is two lines:
            </P>
            <Eq>
              <em>y</em> = <em>ab</em>
              <sup>x</sup>
              <br />
              lg <em>y</em> = lg <em>a</em> + <em>x</em> lg <em>b</em>
              <br />
              lg <em>y</em> = <M>(lg <em>b</em>)</M> <em>x</em> + <C>lg <em>a</em></C>
            </Eq>
            <Legend />
            <P>
              Look at what happened to <em>x</em>. It came <em>down out of the exponent</em> and
              became a multiplier. It never turned into lg <em>x</em>. So the axes are lg{' '}
              <em>y</em> against <em>x</em>.
            </P>
            <P>
              Now compare <em>y</em> = <em>ax</em>
              <sup>n</sup>, where <em>x</em> is the base and the power is the constant:
            </P>
            <Eq>
              lg <em>y</em> = <M><em>n</em></M> (lg <em>x</em>) + <C>lg <em>a</em></C>
            </Eq>
            <P>
              Here lg <em>x</em> genuinely does appear, so those are the axes. One line is worth
              committing to memory, and it settles almost every case:{' '}
              <strong className="text-foreground">
                if the variable sits in the exponent it stays as <em>x</em>; if it sits in the base
                it becomes lg <em>x</em>.
              </strong>
            </P>
            <P>And plenty of linear law questions want no logarithms at all:</P>
            <ul className="text-muted-foreground text-base leading-[1.8] mb-4 space-y-2 pl-5 list-disc marker:text-amber-dark">
              <li>
                <em>y</em> = <em>ax</em>
                <sup>2</sup> + <em>bx</em> — divide both sides by <em>x</em> to get{' '}
                <em>y</em>/<em>x</em> = <em>ax</em> + <em>b</em>. Plot <em>y</em>/<em>x</em> against{' '}
                <em>x</em>.
              </li>
              <li>
                <em>xy</em> = <em>ax</em> + <em>b</em> — already a straight line if you read{' '}
                <em>xy</em> as a single variable. Plot <em>xy</em> against <em>x</em>.
              </li>
            </ul>
            <P>
              Reaching for lg on those two is the same mistake pointing the other way. The rule is
              not &ldquo;take logs&rdquo;. The rule is &ldquo;rearrange until it reads{' '}
              <em>Y</em> = <em>mX</em> + <em>c</em>, then read off what <em>Y</em> and <em>X</em>{' '}
              had to be&rdquo;.
            </P>
            <WrongRight
              wrong={
                <>
                  &ldquo;It&rsquo;s linear law, so plot lg <em>y</em> against lg <em>x</em>.&rdquo;
                </>
              }
              right={
                <>
                  &ldquo;lg <em>y</em> = (lg <em>b</em>)<em>x</em> + lg <em>a</em>, so plot lg{' '}
                  <em>y</em> against <em>x</em>.&rdquo;
                </>
              }
            />
          </Mistake>

          {/* ── Mistake 2 ────────────────────────────────────────────────── */}
          <Mistake
            n={2}
            title="Reading the gradient and intercept off the wrong thing"
            strap="Three versions of this, in ascending order of how much they cost."
          >
            <P>
              <strong className="text-foreground">
                (a) Taking the gradient from the raw table.
              </strong>{' '}
              Gradient means Δ<em>Y</em>/Δ<em>X</em>, where <em>Y</em> and <em>X</em> are the{' '}
              <em>new</em> plotted variables — lg <em>y</em> and <em>x</em>, not <em>y</em> and{' '}
              <em>x</em>. If the numbers in your working came out of the original table, you have
              measured the slope of the curve you spent the last five minutes getting rid of.
            </P>
            <P>
              <strong className="text-foreground">
                (b) Taking it from two plotted points instead of two points on the line.
              </strong>{' '}
              The crosses you plotted are measurements, and measurements scatter. The line of best
              fit is your smoothed estimate of the truth, so the gradient has to come off the line.
              Choose two points that sit exactly on the line you drew, put them as far apart as the
              grid allows, and write both of them down in your working. Picking two points close
              together is the other half of this error — a short baseline turns a small reading
              slip into a large gradient error.
            </P>
            <P>
              <strong className="text-foreground">
                (c) Reading the intercept where the grid starts instead of where <em>X</em> = 0.
              </strong>{' '}
              This is the expensive one, and it is completely invisible to the student doing it.
            </P>
            <P>
              Take a table running <em>x</em> = 2, 4, 6, 8, 10. You choose a sensible scale, so your
              grid starts at <em>x</em> = 2. Your line crosses the left-hand edge of the grid at
              1.30, and you write <em>c</em> = 1.30.
            </P>
            <P>
              But <em>c</em> is the value when <em>X</em> = 0, and <em>X</em> = 0 is not on your
              paper. The real intercept here is 0.70. That error alone turns <em>a</em> = 10
              <sup>0.70</sup> = 5.01 into <em>a</em> = 10<sup>1.30</sup> = 20.0 — four times too
              big, with nothing on the page to flag it.
            </P>
            <P>
              The fix takes about ten seconds and does not require extending anything by hand. Once
              you have the gradient, take any one point (<em>X</em>
              <sub>1</sub>, <em>Y</em>
              <sub>1</sub>) that lies on your line and use:
            </P>
            <Eq
              note="Works whether or not the origin is on the page — and it is an easier mark to earn than a hand-extended line."
            >
              <C><em>c</em></C> = <em>Y</em>
              <sub>1</sub> &minus; <M><em>m</em></M>
              <em>X</em>
              <sub>1</sub>
            </Eq>
            <P>
              With the point (2, 1.30) and a gradient of 0.301: <em>c</em>{' '}
              = 1.30 &minus; 0.301 &times; 2 = 0.70. Same line, same reading, correct constant.
            </P>
          </Mistake>

          {/* ── Mistake 3 ────────────────────────────────────────────────── */}
          <Mistake
            n={3}
            title="Forgetting to un-log"
            strap="The graph marks survive. The marks the question was actually asking for do not."
          >
            <P>
              A student does everything above correctly, arrives at a gradient of 0.301 and an
              intercept of 0.70, and writes <em>a</em> = 0.70, <em>b</em> = 0.301. All that careful
              plotting, and the last two marks are gone on the final line.
            </P>
            <P>
              The cure is to go back to the linear form and read what <em>m</em> and <em>c</em>{' '}
              actually equal, rather than trusting memory:
            </P>
            <Eq>
              lg <em>y</em> = <M>(lg <em>b</em>)</M> <em>x</em> + <C>lg <em>a</em></C>
            </Eq>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
              <div className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="text-[13px] text-muted-foreground mb-1">
                  <M>gradient</M>
                </div>
                <div className="font-display text-[19px] text-navy leading-snug">
                  <em>m</em> = lg <em>b</em>
                  <br />
                  <em>b</em> = 10<sup>0.301</sup> = 2.00
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="text-[13px] text-muted-foreground mb-1">
                  <C>intercept</C>
                </div>
                <div className="font-display text-[19px] text-navy leading-snug">
                  <em>c</em> = lg <em>a</em>
                  <br />
                  <em>a</em> = 10<sup>0.70</sup> = 5.01
                </div>
              </div>
            </div>
            <P>
              Two things go wrong even for students who do remember to un-log, and they are worth
              separating.
            </P>
            <P>
              <strong className="text-foreground">The base has to match the log you took.</strong>{' '}
              If the model was <em>y</em> = <em>ae</em>
              <sup>bx</sup> you took natural logs, so <em>c</em> = ln <em>a</em> and{' '}
              <em>a</em> = e<sup>c</sup> — not 10<sup>c</sup>. Natural log in, natural exponential
              out. (Using lg on that model is not wrong, but it leaves <em>b</em> tangled up with
              lg e for no reason. Take ln.)
            </P>
            <P>
              <strong className="text-foreground">Not everything needs un-logging.</strong> For{' '}
              <em>y</em> = <em>ax</em>
              <sup>n</sup>, the linear form is lg <em>y</em> = <M><em>n</em></M> (lg <em>x</em>) +{' '}
              <C>lg <em>a</em></C>. The gradient <em>is</em> <em>n</em>{' '}
              — raw, nothing to undo. Only the intercept is hiding behind a power of ten. A student
              who has drilled &ldquo;always do 10<sup>m</sup>&rdquo; as a reflex gets this one wrong
              for the opposite reason.
            </P>
            <P>
              Which is why the fix is not a rule about un-logging at all. It is a habit:{' '}
              <strong className="text-foreground">
                write the linear form down, label which piece is <em>m</em> and which is{' '}
                <em>c</em>, and only then convert.
              </strong>{' '}
              Do that and all five standard models collapse into the same two lines of working.
            </P>
            <P>
              Then spend half a second on a sanity check. Here, <em>b</em> = 0.301 would mean{' '}
              <em>y</em> falling as <em>x</em> rises — and the table below is climbing by a factor
              of four every two steps. That check catches the error every single time.
            </P>

            <div className="my-6 overflow-x-auto">
              <table className="w-full text-[15px] border-collapse">
                <caption className="caption-bottom text-[13px] text-muted-foreground pt-3 text-left">
                  The example running through this article: the data really is{' '}
                  <em>y</em> = 5(2<sup>x</sup>), which is exactly what a gradient of 0.301 and an
                  intercept of 0.70 give you back.
                </caption>
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left font-semibold text-navy py-2 pr-4">
                      <em>x</em>
                    </th>
                    <th className="text-left font-semibold text-navy py-2 pr-4">
                      <em>y</em>
                    </th>
                    <th className="text-left font-semibold text-navy py-2">
                      lg <em>y</em> &nbsp;
                      <span className="font-normal text-muted-foreground text-[13px]">
                        (what you plot)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE.map(([x, y, lgy]) => (
                    <tr key={x} className="border-b border-border">
                      <td className="py-2 pr-4 text-muted-foreground">{x}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{y}</td>
                      <td className="py-2 text-foreground font-medium">{lgy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Mistake>

          {/* ── Checklist ────────────────────────────────────────────────── */}
          <section className="mb-14">
            <h2 className="font-display text-[1.6rem] sm:text-[1.85rem] text-navy leading-[1.25] mb-4">
              The thirty-second version
            </h2>
            <P>
              If you remember nothing else from this page, remember the order. Most of the lost
              marks come from doing these steps out of sequence, or skipping straight to the graph
              paper.
            </P>
            <ol className="bg-amber-light border-[1.5px] border-amber rounded-xl px-6 sm:px-8 py-6 space-y-3 list-decimal pl-10 sm:pl-12 marker:font-bold marker:text-amber-dark">
              {[
                <>
                  Take logs, divide, or regroup until the equation reads <em>Y</em> = <em>m</em>
                  <em>X</em> + <em>c</em>.
                </>,
                <>
                  Write down what <em>Y</em>, <em>X</em>, <em>m</em> and <em>c</em> are{' '}
                  <em>before</em> you touch the graph paper.
                </>,
                <>Build the new table, plot the transformed values, draw the line of best fit.</>,
                <>
                  Gradient from two points <em>on the line</em>, as far apart as the grid allows,
                  both written down.
                </>,
                <>
                  Intercept from <em>c</em> = <em>Y</em>
                  <sub>1</sub> &minus; <em>m</em>
                  <em>X</em>
                  <sub>1</sub> — never from the edge of the grid.
                </>,
                <>
                  Convert <em>m</em> and <em>c</em> back into the constants the question named.
                </>,
                <>Sanity-check the sign and the size against the original table.</>,
              ].map((item, i) => (
                <li key={i} className="text-navy text-[15px] leading-[1.7] pl-1">
                  {item}
                </li>
              ))}
            </ol>
          </section>

          {/* ── The tool ─────────────────────────────────────────────────── */}
          <section className="mb-14">
            <h2 className="font-display text-[1.6rem] sm:text-[1.85rem] text-navy leading-[1.25] mb-4">
              Now go and see it happen
            </h2>
            <P>
              Reading about a curve straightening and watching one straighten are different
              experiences, and the second one is what makes the topic stick. I built a tool for
              exactly this.
            </P>
            <a
              href="/tools/linear-law.html"
              className="group block rounded-2xl border border-border bg-card p-6 sm:p-7 hover:border-amber hover:shadow-lg transition-all no-underline"
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl leading-none mt-0.5" aria-hidden>
                  📈
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[18px] text-navy group-hover:text-amber-dark transition-colors mb-2">
                    Linear Law — the interactive version
                  </h3>
                  <p className="text-[15px] text-muted-foreground leading-relaxed mb-3">
                    The curved plot and the straightened plot sit side by side and stay live. Drag{' '}
                    <em>a</em> and <em>b</em> and the left-hand plot bends every which way — the
                    right-hand plot never stops being a straight line. Switch between all five
                    standard models and watch the axes change with them, then turn experimental
                    noise on to see exactly why a line of best fit exists.
                  </p>
                  <p className="text-[15px] text-muted-foreground leading-relaxed mb-4">
                    There is also a camera button: photograph the table from your question and it
                    will read the values in, fit the line, and show you the gradient, the intercept
                    and the recovered constants. Use that to check an answer{' '}
                    <em>after</em> you have done it by hand — not instead of doing it by hand. The
                    marks in the exam are for your working.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-navy group-hover:gap-2 transition-all">
                    Open the tool <span aria-hidden>→</span>
                  </span>
                </div>
              </div>
            </a>
            <p className="text-[14px] text-muted-foreground mt-4 leading-relaxed">
              It sits alongside the rest of the{' '}
              <a href="/tools" className="text-navy font-medium underline underline-offset-2 hover:text-amber-dark transition-colors">
                free interactive tools
              </a>{' '}
              — no sign-up, no account, nothing to install.
            </p>
          </section>

          {/* ── CTA ──────────────────────────────────────────────────────── */}
          <section className="border-t border-border pt-10">
            <h2 className="font-display text-[1.6rem] sm:text-[1.85rem] text-navy leading-[1.25] mb-4">
              If this one keeps costing you marks
            </h2>
            <P>
              Most students who lose marks in linear law do not need the topic taught again from
              scratch. They need someone sitting next to them for one question, watching the working
              go down line by line, and pointing at the exact step where it goes wrong — because
              that step is usually the same one every time, and nobody has ever named it out loud.
            </P>
            <P>
              That is what a lesson is for. Classes are small — two to four students — and run in
              the Kovan and Hougang area. If any of the three mistakes above sounded uncomfortably
              familiar, say so in the message and we can start there.
            </P>
            <div className="text-center py-4">
              <WhatsAppCTA text="Message Adrian on WhatsApp" size="lg" />
            </div>
            <p className="text-[14px] text-muted-foreground text-center leading-relaxed">
              More about the classes on the{' '}
              <a
                href="/o-level-a-math-tuition"
                className="text-navy font-medium underline underline-offset-2 hover:text-amber-dark transition-colors"
              >
                O-Level A Math tuition
              </a>{' '}
              page.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
