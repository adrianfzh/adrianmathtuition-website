// 🧑‍🏫 Tutor portal — invite-only, hidden (Adrian, 5 Nov 2026: "but gatekeep first").
// Never indexed, never in the sitemap, disallowed in robots.ts, no link from any public page.
// SPEC-TUTOR-TOOLS.md §7.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>;
}
