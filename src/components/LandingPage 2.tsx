import Link from 'next/link';

// ── Nav ──────────────────────────────────────────────────────────────────────

export function LandingNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <span className="font-display font-bold text-[18px] tracking-tight text-navy">
            ADRIAN&apos;S
          </span>
          <span className="text-muted-foreground text-sm">math tuition</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm font-medium hover:text-navy transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to home
        </Link>
      </div>
    </nav>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

export function LandingHero({
  title,
  subtitle,
  ctaText,
}: {
  title: string;
  subtitle: string;
  ctaText: string;
}) {
  return (
    <div className="bg-navy text-primary-foreground py-16 px-6 text-center">
      <h1 className="font-display text-[2rem] sm:text-[2.75rem] mb-4 leading-[1.2]">{title}</h1>
      <p className="text-[18px] opacity-85 max-w-[600px] mx-auto mb-8 leading-relaxed">
        {subtitle}
      </p>
      <WhatsAppCTA text={ctaText} size="lg" />
    </div>
  );
}

// ── WhatsApp CTA ─────────────────────────────────────────────────────────────

export function WhatsAppCTA({ text, size = 'md' }: { text: string; size?: 'md' | 'lg' }) {
  const padding = size === 'lg' ? 'px-7 py-3.5' : 'px-7 py-3';
  return (
    <a
      href="https://wa.me/6591397985"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 bg-[#25D366] text-white ${padding} rounded-full font-bold text-[16px] hover:opacity-90 transition-opacity`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {text}
    </a>
  );
}

// ── Topic grid ───────────────────────────────────────────────────────────────

export function TopicGrid({ topics }: { topics: string[] }) {
  return (
    <div className="grid [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-3 mt-4">
      {topics.map((t) => (
        <div
          key={t}
          className="bg-amber-light border border-amber rounded-lg px-4 py-2.5 text-sm font-medium text-navy"
        >
          {t}
        </div>
      ))}
    </div>
  );
}

// ── Highlight box ─────────────────────────────────────────────────────────────

export function HighlightBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-7">
      <h3 className="font-display text-[1.1rem] text-navy mb-2">{title}</h3>
      <div className="text-[15px] text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

// ── Callout ───────────────────────────────────────────────────────────────────

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-light border-[1.5px] border-amber rounded-xl px-7 py-6 mb-12">
      <p className="text-navy text-[16px] font-medium leading-relaxed m-0">{children}</p>
    </div>
  );
}

// ── FAQ item ──────────────────────────────────────────────────────────────────

export function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="border-b border-border py-5">
      <h3 className="font-sans font-semibold text-base text-foreground mb-2">{question}</h3>
      <p className="text-muted-foreground text-[15px] leading-[1.7]">{answer}</p>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-12">
      <h2 className="font-display text-[1.75rem] text-navy mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── Section paragraph ─────────────────────────────────────────────────────────

export function SP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-base mb-3 leading-relaxed">{children}</p>
  );
}
