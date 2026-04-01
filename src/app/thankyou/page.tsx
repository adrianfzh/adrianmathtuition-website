'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';

function parseDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function ThankYouContent() {
  const params = useSearchParams();
  const name = params.get('name');
  const dateParam = params.get('date');
  const timeParam = params.get('time');
  const token = params.get('token');
  const subjectsParam = params.get('subjects');

  const firstName = name ? name.split(' ')[0] : '';
  const lessonDate = parseDate(dateParam);

  return (
    <>
      <Nav />
      <main className="flex-1 flex items-center justify-center px-6 py-16 min-h-[calc(100vh-64px)]">
        <div className="bg-card rounded-xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-14 max-w-[560px] w-full text-center">
          <span className="text-[56px] mb-6 block">🎉</span>

          <h1 className="font-display text-[2rem] text-navy mb-3 leading-[1.2]">
            {firstName
              ? `You're officially enrolled, ${firstName}! 🎉`
              : "You're officially enrolled!"}
          </h1>
          <p className="text-muted-foreground text-[16px] mb-7 leading-[1.6]">
            Welcome to the family! We&apos;re so excited to have you.
          </p>

          {/* Lesson hero card */}
          {lessonDate && (
            <div className="bg-navy rounded-xl p-7 mb-8 text-center">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber mb-3">
                📅 Your first lesson
              </div>
              <div className="font-display text-[1.75rem] text-[hsl(45,100%,96%)] leading-[1.1] mb-1">
                {lessonDate.toLocaleDateString('en-SG', { weekday: 'long' })}
              </div>
              <div className="text-base font-semibold text-[hsla(45,100%,96%,0.75)] mb-2.5">
                {lessonDate.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              {timeParam && (
                <span className="inline-block text-[1.1rem] font-bold text-amber bg-[hsla(45,90%,55%,0.12)] px-4 py-1 rounded-full border border-[hsla(45,90%,55%,0.3)]">
                  {timeParam.replace('-', '\u2013')}
                </span>
              )}
              {subjectsParam && (
                <div className="mt-2.5 text-[13px] text-[hsla(45,100%,96%,0.7)] font-medium">
                  {decodeURIComponent(subjectsParam)}
                </div>
              )}
            </div>
          )}

          {/* What happens next */}
          <div className="bg-amber-light border-[1.5px] border-amber rounded-xl p-5 px-6 text-left mb-8">
            <div className="text-[12px] font-bold uppercase tracking-[0.07em] text-[hsl(40,80%,35%)] mb-4">
              What happens next
            </div>
            <ul className="flex flex-col gap-3.5">
              <li className="text-[14px] text-[hsl(220,50%,20%)] leading-[1.55]">
                💳 Your first invoice will be sent to your email shortly. Subsequent invoices are sent on the 15th of each month for the following month.
              </li>
              <li className="text-[14px] text-[hsl(220,50%,20%)] leading-[1.55]">
                💬 Ask math questions anytime — you can message @AdrianMathBot on Telegram 24/7 for step-by-step math help. No registration needed, just start asking!
              </li>
              {token && (
                <li className="text-[14px] text-[hsl(220,50%,20%)] leading-[1.55]">
                  🔄 To reschedule lessons or change timings, register on Telegram using your registration code. Open @AdrianMathBot and type /register followed by your code:
                  <span className="block font-mono text-sm font-bold bg-navy text-[hsl(45,100%,96%)] px-3 py-1.5 rounded-md tracking-[0.05em] my-2 break-all">
                    {token}
                  </span>
                  Both student and parent can register using the same code. Code expires in 7 days.
                </li>
              )}
              <li className="text-[14px] text-[hsl(220,50%,20%)] leading-[1.55]">
                ❓ Any questions before your first lesson? Drop Adrian a WhatsApp anytime.
              </li>
            </ul>
          </div>

          {/* Telegram registration */}
          {token && (
            <div className="mb-6 p-5 px-6 bg-[#f0f7ff] border-[1.5px] border-[#c0d8f0] rounded-xl text-left">
              <p className="font-semibold mb-2 text-[15px]">📱 Last step — link your Telegram:</p>
              <p className="text-sm text-muted-foreground mb-3">
                Open Telegram, search for <strong>@AdrianMathBot</strong>, press Start, then send:
              </p>
              <code className="block text-[1.1em] bg-white px-3.5 py-2.5 rounded-lg border border-border tracking-[0.05em]">
                /register {token}
              </code>
              <p className="text-[12px] text-muted-foreground mt-2">
                This code expires in 7 days. Both student and parent can use it to register.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <a
              href="https://wa.me/6591397985"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-navy text-[hsl(45,100%,96%)] px-7 py-3 rounded-full font-semibold text-[15px] hover:opacity-90 transition-opacity"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              WhatsApp Adrian
            </a>
            {token && (
              <a
                href="https://t.me/AdrianMathBot?start=register"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-transparent text-muted-foreground px-6 py-2.5 rounded-full border-[1.5px] border-border font-medium text-sm hover:border-navy hover:text-navy transition-colors"
              >
                Register on Telegram
              </a>
            )}
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 bg-transparent text-muted-foreground px-6 py-2.5 rounded-full border-[1.5px] border-border font-medium text-sm hover:border-navy hover:text-navy transition-colors"
            >
              Back to website
            </a>
          </div>
        </div>
      </main>

      <footer className="bg-navy text-[hsl(45,100%,96%)] py-8 px-6 text-center">
        <p className="text-[hsl(45,100%,96%)] opacity-40 text-sm">
          &copy; {new Date().getFullYear()}{' '}Adrian&apos;s Math Tuition. All rights reserved.
        </p>
      </footer>
    </>
  );
}

export default function ThankYouPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }>
        <ThankYouContent />
      </Suspense>
    </div>
  );
}
