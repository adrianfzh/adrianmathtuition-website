// 🧑‍🏫 The student's side of a shared board: opened from the private link the tutor sends
// (SPEC-TUTOR-TOOLS §8). Never indexed; disallowed in robots.ts; no link from any public page.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Board',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>;
}
