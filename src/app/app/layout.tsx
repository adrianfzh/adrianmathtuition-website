// App shell — wraps every /app/* page. Server-side auth gate: no session →
// /login. Full nav (account menu, mobile bottom tabs) lands in Phase C.
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
            <span className="font-display font-bold text-navy tracking-tight">AdrianMath</span>
            <Link href="/app" className="text-sm text-gray-600 hover:text-navy">Dashboard</Link>
            <Link href="/app/practice" className="text-sm text-gray-600 hover:text-navy">Practice</Link>
            <Link href="/app/notes" className="text-sm text-gray-600 hover:text-navy">Notes</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/app/settings" className="text-sm text-gray-600 hover:text-navy">Settings</Link>
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
