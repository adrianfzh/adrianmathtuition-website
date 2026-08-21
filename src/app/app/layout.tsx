// App shell — wraps every /app/* page. Server-side auth gate: no session →
// /login. Desktop: top nav. Mobile (<640px): bottom tab bar (thumb-reachable).
// Adrian's signed admin cookie also passes the gate (review/testing) — the
// per-page APIs decide what an admin caller may see (e.g. pending units).
import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireAuth } from '@/lib/portal-auth';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { LEARN_OPEN_TO_STUDENTS } from '@/lib/learn-gate';
import { MARKING_ONLY_BETA } from '@/lib/portal-beta';
import SignOutButton from './signout-button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAdmin = verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!isAdmin) await requireAuth();

  // Marking-only beta (lib/portal-beta.ts, Adrian 2026-08-21): students see
  // Home / Submit / Marked (+ Settings) and nothing else. Adrian's admin cookie
  // keeps the full nav — Practice, and Learn while LEARN_OPEN_TO_STUDENTS is off.
  const fullPortal = isAdmin || !MARKING_ONLY_BETA;
  const learnVisible = isAdmin || LEARN_OPEN_TO_STUDENTS;
  const desktopLinks = fullPortal
    ? [
        { href: '/app', label: 'Dashboard' },
        { href: '/app/practice', label: 'Practice' },
        ...(learnVisible ? [{ href: '/app/learn', label: 'Learn' }] : []),
        { href: '/app/submit', label: 'Submit' },
        { href: '/app/marking', label: 'Marked' },
      ]
    : [
        { href: '/app', label: 'Dashboard' },
        { href: '/app/submit', label: 'Submit a paper' },
        { href: '/app/marking', label: 'Marked papers' },
      ];
  const mobileTabs = fullPortal
    ? [
        { href: '/app', icon: '🏠', label: 'Home' },
        { href: '/app/practice', icon: '✏️', label: 'Practice' },
        ...(learnVisible ? [{ href: '/app/learn', icon: '📚', label: 'Learn' }] : []),
        { href: '/app/marking', icon: '📄', label: 'Marked' },
      ]
    : [
        { href: '/app', icon: '🏠', label: 'Home' },
        { href: '/app/submit', icon: '📷', label: 'Submit' },
        { href: '/app/marking', icon: '📄', label: 'Marked' },
      ];
  const gridCols = mobileTabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3';

  return (
    <div className="min-h-screen bg-[hsl(45,100%,98%)]">
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-black/5">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/app" className="font-display font-bold text-navy tracking-tight">AdrianMath</Link>
            <div className="hidden sm:flex items-center gap-5">
              {desktopLinks.map(l => (
                <Link key={l.href} href={l.href} className="text-sm text-gray-600 hover:text-navy">{l.label}</Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/app/settings" className="text-sm text-gray-600 hover:text-navy">Settings</Link>
            <SignOutButton />
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-5">{children}</main>

      {/* Mobile bottom tabs */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/5">
        <div className={`grid ${gridCols} h-14 text-center text-[11px] text-gray-600`}>
          {mobileTabs.map(t => (
            <Link key={t.href} href={t.href} className="flex flex-col items-center justify-center gap-0.5 hover:text-navy">
              <span className="text-lg leading-none">{t.icon}</span>{t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
