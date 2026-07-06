// App shell — wraps every /app/* page. Server-side auth gate: no session →
// /login. Desktop: top nav. Mobile (<640px): bottom tab bar (thumb-reachable).
import Link from 'next/link';
import { requireAuth } from '@/lib/portal-auth';
import SignOutButton from './signout-button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <div className="min-h-screen bg-[hsl(45,100%,98%)]">
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-black/5">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/app" className="font-display font-bold text-navy tracking-tight">AdrianMath</Link>
            <div className="hidden sm:flex items-center gap-5">
              <Link href="/app" className="text-sm text-gray-600 hover:text-navy">Dashboard</Link>
              <Link href="/app/practice" className="text-sm text-gray-600 hover:text-navy">Practice</Link>
              <Link href="/app/notes" className="text-sm text-gray-600 hover:text-navy">Notes</Link>
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
        <div className="grid grid-cols-3 h-14 text-center text-[11px] text-gray-600">
          <Link href="/app" className="flex flex-col items-center justify-center gap-0.5 hover:text-navy">
            <span className="text-lg leading-none">🏠</span>Home
          </Link>
          <Link href="/app/practice" className="flex flex-col items-center justify-center gap-0.5 hover:text-navy">
            <span className="text-lg leading-none">✏️</span>Practice
          </Link>
          <Link href="/app/notes" className="flex flex-col items-center justify-center gap-0.5 hover:text-navy">
            <span className="text-lg leading-none">📚</span>Notes
          </Link>
        </div>
      </nav>
    </div>
  );
}
