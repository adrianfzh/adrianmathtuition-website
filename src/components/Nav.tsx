import Link from 'next/link';

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-[18px] md:text-lg tracking-tight text-navy">ADRIAN&apos;S</span>
          <span className="text-muted-foreground text-sm md:text-[14px]">math tuition</span>
        </div>
        <a
          href="https://wa.me/6591397985?text=Hi%20Adrian,%20I%27m%20interested%20in%20a%20free%20trial%20lesson"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-navy text-[hsl(45,100%,96%)] px-4 md:px-5 py-2 md:py-2.5 rounded-full text-[13px] md:text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Book Free Trial</span>
        </a>
      </div>
    </nav>
  );
}
