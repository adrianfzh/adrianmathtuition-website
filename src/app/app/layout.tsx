// App shell — wraps every /app/* page. Server-side auth gate: no session →
// /login. Desktop: top nav. Mobile (<640px): bottom tab bar (thumb-reachable).
// Adrian's signed admin cookie also passes the gate (review/testing) — the
// per-page APIs decide what an admin caller may see (e.g. pending units).
import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireAuth } from '@/lib/portal-auth';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { LEARN_OPEN_TO_STUDENTS } from '@/lib/learn-gate';
import { MARKING_ONLY_BETA, VIEW_AS_STUDENT_COOKIE } from '@/lib/portal-beta';
import SignOutButton from './signout-button';
import { pendingAssignmentCountForSession } from '@/lib/portal-assignments';
import ViewAsToggle from './view-as-toggle';
import PortalTour from '@/components/PortalTour';
import { portalSurfaces } from '@/lib/portal-surfaces';
import { DesktopLinks, MobileTabs } from '@/components/PortalTabs';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAdmin = verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!isAdmin) await requireAuth();

  // Marking-only beta (lib/portal-beta.ts, Adrian 2026-08-21): students see
  // Home / Practise / Submit / Marked (+ Settings) and nothing else. Adrian's
  // admin cookie keeps the full nav — Learn while LEARN_OPEN_TO_STUDENTS is off
  // — unless he has flipped "View as student", which demotes him everywhere.
  const viewingAsStudent = isAdmin && cookieStore.get(VIEW_AS_STUDENT_COOKIE)?.value === '1';
  const adminPowers = isAdmin && !viewingAsStudent;
  const fullPortal = adminPowers || !MARKING_ONLY_BETA;
  const learnVisible = adminPowers || LEARN_OPEN_TO_STUDENTS;
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
        { href: '/app/practice', label: 'Practise' },
        { href: '/app/submit', label: 'Hand in a paper' },
        { href: '/app/marking', label: 'Marked papers' },
      ];
  const mobileTabs = fullPortal
    ? [
        { href: '/app', label: 'Home' },
        { href: '/app/practice', label: 'Practice' },
        ...(learnVisible ? [{ href: '/app/learn', label: 'Learn' }] : []),
        { href: '/app/marking', label: 'Marked' },
      ]
    : [
        { href: '/app', label: 'Home' },
        { href: '/app/practice', label: 'Practise' },
        { href: '/app/submit', label: 'Hand in' },
        { href: '/app/marking', label: 'Marked' },
      ];
  // "From Adrian" pending work → numeric badge on Home (no 5th tab, per spec).
  const pendingWork = await pendingAssignmentCountForSession();

  // First-login tour (components/PortalTour.tsx). The `data-tour` attributes
  // below are what its highlight ring measures — keep them on both the desktop
  // links and the mobile tabs, since only one set is on screen at a time.
  const surfaces = await portalSurfaces();

  return (
    <div className="min-h-screen bg-[hsl(45,100%,98%)]">
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-black/5">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/app" className="font-display font-bold text-navy tracking-tight">AdrianMath</Link>
            <DesktopLinks items={desktopLinks} pendingWork={pendingWork} />
          </div>
          <div className="flex items-center gap-4">
            <Link href="/app/settings" data-tour="settings" className="text-sm text-gray-600 hover:text-navy">Settings</Link>
            <SignOutButton />
          </div>
        </div>
      </nav>

      {isAdmin && MARKING_ONLY_BETA && (
        <ViewAsToggle cookieName={VIEW_AS_STUDENT_COOKIE} viewingAsStudent={viewingAsStudent} />
      )}

      <main className="max-w-4xl mx-auto px-4 py-5">{children}</main>

      {/* Mobile bottom tabs (components/PortalTabs.tsx — per-surface colours) */}
      <MobileTabs items={mobileTabs} pendingWork={pendingWork} />

      {/* First-login tour — shows itself once per device, on the dashboard only. */}
      <PortalTour surfaces={surfaces} />
    </div>
  );
}
