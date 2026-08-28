// App shell — wraps every /app/* page. Server-side auth gate: no session →
// /login. Desktop: top nav. Mobile (<640px): bottom tab bar (thumb-reachable).
// Adrian's signed admin cookie also passes the gate (review/testing) — the
// per-page APIs decide what an admin caller may see (e.g. pending units).
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/portal-auth';
import { portalAccessAllowed } from '@/lib/portal-passes';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { LEARN_OPEN_TO_STUDENTS } from '@/lib/learn-gate';
import { MARKING_ONLY_BETA, NOTES_OPEN_TO_STUDENTS, VIEW_AS_STUDENT_COOKIE } from '@/lib/portal-beta';
import SignOutButton from './signout-button';
import InviteFriend from './invite-friend';
import { inviteLinkFor } from '@/lib/portal-join';
import { pendingAssignmentCountForSession } from '@/lib/portal-assignments';
import ViewAsToggle from './view-as-toggle';
import PortalTour from '@/components/PortalTour';
import { portalSurfaces } from '@/lib/portal-surfaces';
import { DesktopLinks, MobileTabs } from '@/components/PortalTabs';

// PWA identity for the student portal: the manifest + apple-touch-icon are what
// let an iPhone install /app to the Home Screen — which is the ONLY way web
// push works on iOS. Keep in step with public/app-manifest.webmanifest.
export const metadata: Metadata = {
  manifest: '/app-manifest.webmanifest',
  icons: { apple: '/icons/admin-180.png' },
  appleWebApp: { capable: true, title: 'AdrianMath' },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAdmin = verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  // Students carry their invite link in the top bar; admin sessions have no
  // portal account, so no button.
  let inviteRef: string | null = null;
  if (!isAdmin) {
  // Auth + paywall gate. currentAccount() bounces anonymous (and
    // account-less) sessions to /login; it costs nothing extra — the same
    // per-request-cached lookups (lib/portal-auth cache()) every page below
    // already makes. portalAccessAllowed (lib/portal-passes) short-circuits
    // for tuition accounts (non-empty airtable_student_id) BEFORE any pass
    // query, so their gate is free too; only a self-serve stranger costs one
    // portal_passes head count, and without an active pass (S$29/30 days, or
    // the referred 3-day trial) they land on /app/pass — served by
    // src/app/pass via the next.config.ts rewrite, OUTSIDE this layout, so
    // the redirect can never loop.
    const account = await currentAccount();
    if (!(await portalAccessAllowed(account))) redirect('/app/pass');
    inviteRef = account.id;
  }

  // Marking-only beta (lib/portal-beta.ts, Adrian 2026-08-21): students see
  // Home / Practise / Ask / Hand in / Marked / My Notebook (+ Notes while the
  // carve-out is on, + Settings) and nothing else. Adrian's admin cookie keeps
  // the full nav — Learn while LEARN_OPEN_TO_STUDENTS is off — unless he has
  // flipped "View as student", which demotes him everywhere.
  const viewingAsStudent = isAdmin && cookieStore.get(VIEW_AS_STUDENT_COOKIE)?.value === '1';
  const adminPowers = isAdmin && !viewingAsStudent;
  const fullPortal = adminPowers || !MARKING_ONLY_BETA;
  const learnVisible = adminPowers || LEARN_OPEN_TO_STUDENTS;
  // Notebook (/app/notebook, the re-attempt flow) is hidden from the
  // marking-only beta (Adrian, 2026-08-24: "hide notebook as well") — it rides
  // the full-portal switch like Learn/Notes; its page and API bounce students
  // via the same portal-beta gate.
  // "My Notebook" (/app/my-notes) rides in BOTH branches — marking-derived +
  // the student's own clippings, so it is in the marking-only allowlist. It
  // absorbed /app/plan (My Plan) on 2026-08-28, which now redirects there.
  const desktopLinks = fullPortal
    ? [
        { href: '/app', label: 'Dashboard' },
        { href: '/app/practice', label: 'Practice' },
        { href: '/app/ask', label: 'Ask Bot' },
        ...(learnVisible ? [{ href: '/app/learn', label: 'Learn' }] : []),
        { href: '/app/notebook', label: 'Notebook' },
        { href: '/app/marking', label: 'Papers' },
        { href: '/app/my-notes', label: 'My Notebook' },
        { href: '/app/requests', label: 'Requests' },
      ]
    : [
        { href: '/app', label: 'Dashboard' },
        { href: '/app/practice', label: 'Practise' },
        { href: '/app/ask', label: 'Ask Bot' },
        ...(NOTES_OPEN_TO_STUDENTS ? [{ href: '/app/notes', label: 'Notes' }] : []),
        { href: '/app/marking', label: 'Papers' },
        { href: '/app/my-notes', label: 'My Notebook' },
        { href: '/app/requests', label: 'Requests' },
      ];
  const mobileTabs = fullPortal
    ? [
        { href: '/app', label: 'Home' },
        { href: '/app/practice', label: 'Practice' },
        { href: '/app/ask', label: 'Ask Bot', fab: true },
        { href: '/app/marking', label: 'Papers' },
        { href: '/app/my-notes', label: 'My Notebook' },
      ]
    : [
        { href: '/app', label: 'Home' },
        { href: '/app/practice', label: 'Practise' },
        { href: '/app/ask', label: 'Ask Bot', fab: true },
        { href: '/app/marking', label: 'Papers' },
        { href: '/app/my-notes', label: 'My Notebook' },
      ];
  // "From Adrian" pending work → numeric badge on Home (no 5th tab, per spec).
  // First-login tour (components/PortalTour.tsx). The `data-tour` attributes
  // below are what its highlight ring measures — keep them on both the desktop
  // links and the mobile tabs, since only one set is on screen at a time.
  // Independent lookups — run them in parallel, not one after the other.
  const [pendingWork, surfaces] = await Promise.all([
    pendingAssignmentCountForSession(),
    portalSurfaces(),
  ]);

  return (
    // -webkit-tap-highlight-color:transparent — iOS Safari's grey tap flash
    // fights the tabs'/cards' own pressed states (active:scale/tint); scoped
    // to the portal shell, inherited by everything inside it.
    <div className="min-h-screen bg-[hsl(45,100%,98%)] [-webkit-tap-highlight-color:transparent]">
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-black/5">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/app" className="font-display font-bold text-navy tracking-tight">AdrianMath</Link>
            <DesktopLinks items={desktopLinks} pendingWork={pendingWork} />
          </div>
          <div className="flex items-center gap-4">
            {inviteRef && <InviteFriend link={inviteLinkFor(inviteRef)} />}
            <Link href="/app/settings" data-tour="settings" className="text-sm text-gray-600 hover:text-navy">Settings</Link>
            <SignOutButton />
          </div>
        </div>
      </nav>

      {isAdmin && MARKING_ONLY_BETA && (
        <ViewAsToggle cookieName={VIEW_AS_STUDENT_COOKIE} viewingAsStudent={viewingAsStudent} />
      )}

      <main className="max-w-4xl mx-auto px-4 py-5">
        {children}
      </main>

      {/* Mobile bottom tabs (components/PortalTabs.tsx — per-surface colours) */}
      <MobileTabs items={mobileTabs} pendingWork={pendingWork} />

      {/* First-login tour — shows itself once per device, on the dashboard only. */}
      <PortalTour surfaces={surfaces} />
    </div>
  );
}
