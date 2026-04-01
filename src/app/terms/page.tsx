import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export const metadata = {
  title: "How Things Work — Adrian's Math Tuition",
  description: "Lesson policies, fees, replacements and everything you need to know about Adrian's Math Tuition.",
};

const policies = [
  {
    icon: '📅',
    title: 'Your Lesson Slot',
    body: (
      <p>
        Your lessons will be held weekly on the fixed slot you&apos;ve chosen at registration. You can always check the
        current schedule at{' '}
        <a href="/" className="text-navy font-medium">adrianmathtuition.com</a>.
      </p>
    ),
  },
  {
    icon: '💳',
    title: 'Fees and Payment',
    body: (
      <>
        <p>
          Fees are charged monthly, based on the number of lessons that fall in that month. Invoices are sent on the{' '}
          <strong>15th of the month before</strong> — for example, your March invoice will arrive on 15 February.
        </p>
        <p>Payment is due before your first lesson of the month.</p>
        <div className="mt-3.5 bg-amber-light border-l-[3px] border-amber rounded-r-lg px-4 py-3 text-sm text-[hsl(220,50%,20%)]">
          💳 Payment is via <strong>PayNow only</strong>.
        </div>
      </>
    ),
  },
  {
    icon: '🪄',
    title: 'Replacement Lessons',
    body: (
      <>
        <p>
          If you can&apos;t make it for your regular lesson, just let Adrian know and arrange a replacement lesson at any
          available slot.
        </p>
        <p>
          There&apos;s no proration of fees for missed lessons, so do arrange a replacement to make the most of your sessions.
        </p>
        <p>
          You can book replacement lessons directly through our Telegram bot @AdrianMathBot, or by letting Adrian know
          directly.
        </p>
      </>
    ),
  },
  {
    icon: '➕',
    title: 'Additional Lessons',
    body: (
      <>
        <p>
          Need an extra session on top of your regular slot? Additional lessons can be booked subject to availability,
          and are charged at the same per-lesson rate as your regular lessons. These will appear as a separate line item
          on your invoice.
        </p>
        <p>Book via @AdrianMathBot on Telegram or by letting Adrian know directly.</p>
      </>
    ),
  },
  {
    icon: '🔄',
    title: 'Changing Your Slot',
    body: (
      <>
        <p>
          You can request a permanent slot change at any time, subject to availability. Slot changes are prorated — you&apos;ll
          only be charged for the lessons you attend in each slot during the month of the switch.
        </p>
        <p>Request a slot change via @AdrianMathBot or by letting Adrian know directly.</p>
      </>
    ),
  },
  {
    icon: '🤖',
    title: 'AdrianMathBot — Lesson Management on Telegram',
    body: (
      <>
        <p>
          Students and parents can register on @AdrianMathBot on Telegram to manage lesson scheduling directly. Once
          registered, you can:
        </p>
        <ul className="my-2.5 ml-5 flex flex-col gap-1.5 text-[15px]">
          <li>Book makeup lessons for missed sessions</li>
          <li>Request additional lessons</li>
          <li>Switch your regular slot</li>
          <li>Move lessons forward before exams</li>
          <li>Check your outstanding makeups</li>
        </ul>
        <p>
          Your registration code will be shown on the signup confirmation page — save it and use it to register on the
          bot. If you lose it, ask Adrian for a new one.
        </p>
      </>
    ),
  },
  {
    icon: '🏖️',
    title: 'October, November & December Holidays',
    body: (
      <p>
        During October, November and December, fees can be prorated for missed lessons if you have travel plans or would
        like a short break. You will only be charged for lessons you attend during this period. Just give Adrian a heads
        up in advance.
      </p>
    ),
  },
  {
    icon: '🎉',
    title: 'Public Holidays',
    body: (
      <>
        <p>
          Lessons run as usual on public holidays,{' '}
          <strong>except for Chinese New Year (both days) and Christmas Day</strong>.
        </p>
        <p>
          If you can&apos;t make it on any other public holiday, just let Adrian know and a replacement will be arranged.
        </p>
      </>
    ),
  },
  {
    icon: '💬',
    title: 'Getting Help',
    body: (
      <>
        <p>
          Got a question between lessons? Feel free to WhatsApp Adrian anytime, or use @AdrianMathBot on Telegram for
          math questions and lesson scheduling.
        </p>
        <p>Students are encouraged to reach out whenever they&apos;re stuck — that&apos;s what we&apos;re here for.</p>
      </>
    ),
  },
  {
    icon: '🎁',
    title: 'Referral Programme',
    body: (
      <>
        <p>
          For every friend you successfully refer, you&apos;ll receive <strong>one free month of lessons</strong> (based on a
          4-lesson month). The new student must complete 3 months of lessons for the referral to count.
        </p>
        <p>Just let Adrian know at the time of referral so it gets recorded.</p>
        <div className="mt-3.5 bg-amber-light border-l-[3px] border-amber rounded-r-lg px-4 py-3 text-sm text-[hsl(220,50%,20%)]">
          For referrals from non-enrolled individuals, a referral fee of <strong>SGD $150</strong> applies, and the new
          student must complete 2 months of lessons.
        </div>
      </>
    ),
  },
  {
    icon: '👋',
    title: 'Leaving Us',
    body: (
      <>
        <p>You&apos;re free to stop lessons at any time — just let Adrian know.</p>
        <p>
          Any unused fees for the remaining lessons in the month will be{' '}
          <strong>prorated and refunded</strong>.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="pt-24 pb-20">
        <div className="max-w-[720px] mx-auto px-6">
          {/* Hero */}
          <div className="py-12 pb-10 border-b border-border mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              Policies &amp; Information
            </p>
            <h1 className="font-display text-[2.75rem] leading-[1.1] text-navy mb-4">How Things Work</h1>
            <p className="text-[18px] text-muted-foreground max-w-[580px] leading-[1.7]">
              Welcome to Adrian&apos;s Math Tuition! We&apos;re really glad to have you on board. Here&apos;s everything you need to
              know so that lessons run smoothly for everyone.
            </p>
          </div>

          {/* Policy sections */}
          {policies.map((p, i) => (
            <div key={i} className="mb-10 pb-10 border-b border-border last:border-none last:mb-0">
              <div className="flex items-start gap-4 mb-3.5">
                <span className="text-[28px] flex-shrink-0 mt-0.5">{p.icon}</span>
                <h2 className="font-display text-[1.35rem] text-navy">{p.title}</h2>
              </div>
              <div className="pl-11 text-[16px] leading-[1.75] [&_p]:mb-2.5 [&_p:last-child]:mb-0">
                {p.body}
              </div>
            </div>
          ))}

          {/* CTA */}
          <div className="mt-14 bg-card rounded-xl p-10 text-center border border-border">
            <h2 className="font-display text-[1.5rem] text-navy mb-2.5">Questions?</h2>
            <p className="text-muted-foreground mb-6 text-[15px]">
              Please reach out to Adrian directly via WhatsApp or email anytime. Happy to help!
            </p>
            <a
              href="https://wa.me/6591397985"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-7 py-3 rounded-full font-semibold text-[15px] hover:opacity-90 transition-opacity"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              WhatsApp Adrian
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
