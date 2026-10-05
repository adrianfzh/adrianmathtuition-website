import Link from 'next/link';
import Script from 'next/script';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { WhatsAppCTA } from '@/components/LandingPage';
import {
  notOnEitherList,
  splitQquad,
  type MfAudience,
  type MfItem,
  type MfList,
  type MfSection,
  type MfTable,
} from '@/lib/mf-lists';

// The page body shared by /formulas/mf27 and /formulas/mf26. A server component: every
// formula is typeset by KaTeX at build time, so the HTML a crawler (or a phone on a slow
// line) receives already carries the maths — nothing waits for client JS.

const SITE = 'https://adrianmathtuition.com';

function tex(src: string, display = true): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
}

/** A table cell: '$…' is KaTeX, anything else is text. */
function Cell({ v, as: As = 'td' }: { v: string; as?: 'td' | 'th' }) {
  const cls =
    As === 'th'
      ? 'border border-border bg-[hsl(220,40%,96%)] px-2 sm:px-3 py-2 text-center text-[0.8125em] font-semibold text-navy'
      : 'border border-border px-2 sm:px-3 py-2 text-center text-[0.8125em] sm:text-[0.875em] [&_.katex]:whitespace-nowrap';
  if (v.startsWith('$')) return <As className={cls} dangerouslySetInnerHTML={{ __html: tex(v.slice(1), false) }} />;
  return <As className={cls}>{v}</As>;
}

function Table({ table, caption }: { table: MfTable; caption?: string }) {
  return (
    <div className="my-3">
      {caption && <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1.5">{caption}</p>}
      <div className="overflow-x-auto" data-fit="">
        <table className={`border-collapse ${table.dense ? 'text-[0.8em]' : ''} mx-auto`}>
          <thead>
            <tr>{table.head.map((h, i) => <Cell key={i} v={h} as="th" />)}</tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <Cell key={j} v={c} />)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Formula({ item }: { item: MfItem }) {
  return (
    <div className="py-2 border-t border-[hsl(220,15%,94%)] first:border-t-0">
      {item.label && <p className="text-[13.5px] text-muted-foreground mb-0.5">{item.label}</p>}
      {splitQquad(item.tex).map((part, i) => (
        <div
          key={i}
          data-fit=""
          className="overflow-x-auto overflow-y-hidden [&_.katex]:text-[1.02em] sm:[&_.katex]:text-[1.18em] [&_.katex-display]:my-2"
          dangerouslySetInnerHTML={{ __html: tex(part) }}
        />
      ))}
      {item.cond && (
        <p className="text-[12.5px] text-muted-foreground text-center -mt-1">
          valid for <span dangerouslySetInnerHTML={{ __html: tex(item.cond, false) }} />
        </p>
      )}
    </div>
  );
}

const AUDIENCE_TONE: Record<MfAudience, string> = {
  'H2 Maths': 'bg-[hsl(220,60%,95%)] text-navy border-[hsl(220,40%,82%)]',
  'H1 & H2 Maths': 'bg-[hsl(220,60%,95%)] text-navy border-[hsl(220,40%,82%)]',
  'Further Maths': 'bg-[hsl(280,40%,95%)] text-[hsl(280,35%,35%)] border-[hsl(280,30%,82%)]',
  'Further Maths & H3': 'bg-[hsl(280,40%,95%)] text-[hsl(280,35%,35%)] border-[hsl(280,30%,82%)]',
};

function Section({ s, listCode }: { s: MfSection; listCode: string }) {
  return (
    <section id={s.id} className="scroll-mt-20 bg-card border border-border rounded-xl px-4 sm:px-6 py-5 mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
        <h2 className="font-display text-[1.3rem] text-navy leading-snug">{s.title}</h2>
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${AUDIENCE_TONE[s.audience]}`}>
          {s.audience}
        </span>
      </div>
      <p className="text-[14.5px] text-muted-foreground leading-relaxed mb-2">{s.use}</p>
      {s.change && <p className="text-[13px] text-amber-dark font-semibold mb-2">{s.change}</p>}
      {s.blocks.map((b, i) =>
        b.kind === 'formulas' ? (
          <div key={i}>{b.items.map((it, j) => <Formula key={j} item={it} />)}</div>
        ) : b.kind === 'table' ? (
          <Table key={i} table={b.table} caption={b.caption} />
        ) : (
          <div key={i} className="my-2">
            {b.text.split('\n').map((line, j) => (
              <p key={j} className="text-[14.5px] leading-relaxed">{line}</p>
            ))}
          </div>
        ),
      )}
      {s.memorise && s.memorise.length > 0 && (
        <div className="mt-4 rounded-lg border-[1.5px] border-amber bg-amber-light/60 px-3 sm:px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-amber-dark mb-1">
            Not on {listCode} — memorise
          </p>
          {s.memorise.map((it, j) => <Formula key={j} item={it} />)}
        </div>
      )}
    </section>
  );
}

// Shrinks a formula wider than its box (a phone) until it fits, down to 62 %; past that
// the box scrolls sideways. Runs after hydration, so React never sees the changed style.
const FIT_SCRIPT = `(function(){function fit(){document.querySelectorAll('[data-fit]').forEach(function(d){d.style.fontSize='';var f=1;for(var i=0;i<5;i++){var w=d.scrollWidth,c=d.clientWidth;if(w<=c+1||f<=0.62)break;f=Math.max(0.62,f*(c-2)/w);d.style.fontSize=f+'em';}});}fit();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);var t;window.addEventListener('resize',function(){clearTimeout(t);t=setTimeout(fit,150);});})();`;

export type MfPageCopy = {
  path: string;
  eyebrow: string;
  h1: string;
  intro: string[];
  facts: { k: string; v: string }[];
  /** A boxed note above the contents (MF26: "replaced by MF27"). */
  banner?: { text: string; href: string; link: string };
  /** The other list, linked at the foot. */
  sibling: { href: string; text: string };
};

export default function MfFormulaPage({ list, copy }: { list: MfList; copy: MfPageCopy }) {
  const sections = list.code === 'MF27' ? [...list.sections, notOnEitherList] : list.sections;
  const pdf = `/formulas/${list.code.toLowerCase()}.pdf`;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Formulas', item: `${SITE}/formulas` },
        { '@type': 'ListItem', position: 3, name: `${list.code} formula list`, item: `${SITE}${copy.path}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: list.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: `${list.code} formula list, typeset`,
      url: `${SITE}${copy.path}`,
      learningResourceType: 'Formula sheet',
      educationalLevel: 'Singapore-Cambridge GCE A-Level',
      inLanguage: 'en-SG',
      isAccessibleForFree: true,
      author: { '@type': 'Person', name: 'Adrian Fong' },
      publisher: { '@type': 'EducationalOrganization', name: "Adrian's Math Tuition", url: SITE },
      encoding: { '@type': 'MediaObject', contentUrl: `${SITE}${pdf}`, encodingFormat: 'application/pdf' },
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <Nav />
      <main className="pt-16">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground mb-5">
            <Link href="/" className="no-underline hover:text-navy">Home</Link>
            <span className="mx-1.5">›</span>
            <Link href="/formulas" className="no-underline hover:text-navy">Formulas</Link>
            <span className="mx-1.5">›</span>
            <span>{list.code}</span>
          </nav>

          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-amber-dark mb-2">{copy.eyebrow}</p>
          <h1 className="font-display text-[1.8rem] sm:text-[2.2rem] text-navy leading-[1.2] mb-4">{copy.h1}</h1>
          {copy.intro.map((p, i) => (
            <p key={i} className="text-[16px] leading-relaxed text-foreground/90 mb-3">{p}</p>
          ))}

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-5">
            {copy.facts.map(f => (
              <div key={f.k} className="rounded-lg border border-border bg-card px-3 py-2">
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{f.k}</dt>
                <dd className="text-[15px] font-semibold text-navy">{f.v}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2.5 mb-6">
            <a href={pdf} className="inline-flex items-center gap-2 bg-navy text-[hsl(45,100%,96%)] px-5 py-2.5 rounded-full text-[14px] font-semibold no-underline hover:opacity-90">
              Print the {list.code} PDF
            </a>
            {list.code === 'MF27' && (
              <a href="#memorise" className="inline-flex items-center gap-2 border-[1.5px] border-amber text-amber-dark px-5 py-2.5 rounded-full text-[14px] font-semibold no-underline hover:bg-amber-light">
                What is NOT on MF27
              </a>
            )}
          </div>

          {copy.banner && (
            <div className="rounded-xl border-[1.5px] border-amber bg-amber-light px-4 py-3 mb-6 text-[15px] leading-relaxed">
              {copy.banner.text}{' '}
              <Link href={copy.banner.href} className="font-semibold text-navy">{copy.banner.link}</Link>
            </div>
          )}

          <nav aria-label="Sections" className="mb-7">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-2">On this page</p>
            <div className="flex flex-wrap gap-1.5">
              {sections.map(s => (
                <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border bg-card px-3 py-1 text-[13px] text-navy no-underline hover:border-navy">
                  {s.title.replace(' (not on the list at all)', '')}
                </a>
              ))}
              <a href="#faq" className="rounded-full border border-border bg-card px-3 py-1 text-[13px] text-navy no-underline hover:border-navy">FAQ</a>
            </div>
          </nav>

          {sections.map(s => <Section key={s.id} s={s} listCode={list.code} />)}

          {list.code === 'MF27' && (
            <section id="memorise" className="scroll-mt-20 rounded-xl bg-navy text-[hsl(45,100%,96%)] px-5 sm:px-7 py-6 mb-8">
              <h2 className="font-display text-[1.35rem] mb-2">What is not on MF27 (H2 Maths)</h2>
              <p className="text-[15px] leading-relaxed opacity-90 mb-3">
                MF27 gives you the hard-to-remember results only. For H2 Maths you still need, by heart:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
                <li>AP and GP: nth term, sum, sum to infinity — <a href="#algebraic-series" className="text-amber underline">Algebraic series</a></li>
                <li>The small-angle approximations — <a href="#algebraic-series" className="text-amber underline">Algebraic series</a></li>
                <li>Pythagorean identities, the R-formula, the factor formulae — <a href="#trigonometry" className="text-amber underline">Trigonometry</a></li>
                <li>Basic derivatives, product, quotient and chain rules — <a href="#derivatives" className="text-amber underline">Derivatives</a></li>
                <li>Basic integrals, integration by parts, volume of revolution — <a href="#integrals" className="text-amber underline">Integrals</a></li>
                <li>Scalar product, lines, planes, angles, distances — <a href="#vectors" className="text-amber underline">Vectors</a></li>
                <li>All of complex numbers — <a href="#complex-numbers" className="text-amber underline">Complex numbers</a></li>
                <li>E(X), Var(X), standardising, the sample mean, the z-test statistic — <a href="#distributions" className="text-amber underline">Distributions</a> and <a href="#sampling-and-testing" className="text-amber underline">Sampling</a></li>
                <li>The regression line of x on y — <a href="#regression-and-correlation" className="text-amber underline">Regression</a></li>
              </ul>
              <p className="text-[14px] opacity-80 mt-3">
                There is no normal table on MF27: normal probabilities come from your graphing calculator.
              </p>
            </section>
          )}

          <section id="faq" className="scroll-mt-20 mb-8">
            <h2 className="font-display text-[1.5rem] text-navy mb-3">Questions students ask</h2>
            {list.faqs.map(f => (
              <details key={f.q} className="group border-b border-border py-3">
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3 font-semibold text-navy text-[16px]">
                  <span>{f.q}</span>
                  <span className="text-muted-foreground transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
                </summary>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">{f.a}</p>
              </details>
            ))}
          </section>

          <p className="text-[14.5px] leading-relaxed mb-8">
            <Link href={copy.sibling.href} className="font-semibold text-navy">{copy.sibling.text}</Link>
            {' · '}
            <Link href="/formulas" className="font-semibold text-navy">All formula pages</Link>
            {' · '}
            <Link href="/jc-h2-math-tuition" className="font-semibold text-navy">JC H2 Maths tuition</Link>
          </p>

          <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-8">
            Typeset by Adrian&apos;s Math Tuition from the list SEAB publishes for the Singapore-Cambridge
            A-Level. The official booklet is the one handed out in the exam; if anything here ever differs
            from it, the booklet wins — tell us and we will fix it.
          </p>

          <div className="bg-amber-light border-[1.5px] border-amber rounded-xl px-5 sm:px-7 py-6 text-center">
            <p className="text-navy text-[16px] font-medium leading-relaxed mb-2">Knowing the formula is half of it.</p>
            <p className="text-muted-foreground text-[14.5px] leading-relaxed mb-4">
              JC H2 Maths in groups of up to 3, in Kovan. Send a question you are stuck on over WhatsApp.
            </p>
            <WhatsAppCTA text="Ask Adrian a question" />
          </div>
        </div>
      </main>
      <Footer />
      <Script id="mf-fit" strategy="afterInteractive">{FIT_SCRIPT}</Script>
    </>
  );
}
