import { redirect } from 'next/navigation';

// TODO PORTAL: App shell — wraps every /app/* page.
//
// Responsibilities:
// 1. Server-side auth check (createServerClient from src/lib/supabase-server.ts).
//    If no session → redirect to /login.
// 2. Resolve the portal_account row for the current user (RLS makes this safe).
//    If not found → redirect to /login (account got deleted or invite never consumed).
// 3. Render top nav (Dashboard / Practice / Notes / Account ▾).
// 4. Update last_seen_at fire-and-forget.
//
// Mobile-first PWA hints:
//   - Top nav collapses to bottom-tab bar at < 640px width
//   - Manifest + service worker registered at the root layout level (not here)
//   - "Add to Home Screen" prompt shown contextually (Settings page)
//
// Top nav structure (desktop):
//   ┌──────────────────────────────────────────────────────────┐
//   │ AdrianMath  [Dashboard] [Practice] [Notes]   GavinLee ▾  │
//   └──────────────────────────────────────────────────────────┘
//
// Bottom nav (mobile):
//   ┌──────────────────────────────────────────────────────────┐
//   │ Page content...                                            │
//   ├──────────────────────────────────────────────────────────┤
//   │  🏠 Home    📚 Notes    ✏️ Practice    👤              │
//   └──────────────────────────────────────────────────────────┘

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // TODO PORTAL: real auth check. For now, just render children.
  // Once src/lib/supabase-server.ts is built:
  //
  //   const supabase = createServerClient();
  //   const { data: { session } } = await supabase.auth.getSession();
  //   if (!session) redirect('/login');
  //   const { data: account } = await supabase
  //     .from('portal_accounts').select('*').eq('id', session.user.id).single();
  //   if (!account) redirect('/login');

  return (
    <div>
      {/* TODO PORTAL: top nav + mobile bottom nav */}
      <nav className="border-b p-3 text-sm text-gray-500">
        AdrianMath portal — top nav coming soon
      </nav>
      <main>{children}</main>
    </div>
  );
}
