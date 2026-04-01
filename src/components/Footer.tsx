export default function Footer() {
  return (
    <>
      <footer className="bg-navy text-[hsl(45,100%,96%)] py-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-4xl mb-4">Ready to Start Learning?</h2>
          <p className="text-[hsl(45,100%,96%)] opacity-70 mb-8 max-w-md mx-auto">
            Book a free trial lesson and experience personalized coaching for yourself.
          </p>
          <a
            href="https://wa.me/6591397985?text=Hi%20Adrian,%20I%27m%20interested%20in%20a%20free%20trial%20lesson"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-amber text-navy px-8 py-3.5 rounded-full font-bold text-lg hover:opacity-90 transition-opacity"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            WhatsApp Us
          </a>
          <p className="text-[hsl(45,100%,96%)] opacity-40 text-sm mt-12">
            &copy; {new Date().getFullYear()} Adrian&apos;s Math Tuition. All rights reserved.
          </p>
        </div>
      </footer>
      <footer className="bg-[#111827] text-[#9ca3af] text-[0.8rem] py-6 px-6 text-center leading-relaxed">
        <p className="mb-1">&copy; {new Date().getFullYear()} Adrian&apos;s Math Tuition &middot; Singapore</p>
        <p className="text-[0.75rem]">
          Questions about your data?{' '}
          <a href="mailto:adrian@adrianmathtuition.com" className="text-[#818cf8] no-underline">
            adrian@adrianmathtuition.com
          </a>
        </p>
      </footer>
    </>
  );
}
