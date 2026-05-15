'use client';

// TODO PORTAL: Build the /login page.
//
// Spec (see PORTAL.md):
// - Email + password form
// - "Continue with Google" button (Supabase Auth OAuth)
// - "Forgot password?" link → /reset-password
// - Skip Apple OAuth unless Adrian confirms Developer account
// - On successful login: router.push('/app')
// - Use src/lib/supabase-client.ts for browser-side auth calls
//
// Industry-best-practice notes:
// - Don't show specific error messages on failed login (avoid email enumeration)
// - Rate-limit login attempts (Supabase Auth handles this server-side)
// - Show "Continue with Google" prominently above email/password (one-click is faster)
//
// Layout pattern (mobile-first):
//   centered card on white/cream background
//   logo at top
//   heading "Log in to AdrianMath"
//   Google button
//   "or" divider
//   email + password fields
//   "Log in" submit
//   "Forgot password?" link
//   "Don't have an account? Ask Adrian." (no public signup link)

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-bold mb-4">Log in</h1>
        <p className="text-sm text-gray-600">
          {/* TODO PORTAL: replace with real form */}
          Login form coming soon. See PORTAL.md.
        </p>
      </div>
    </main>
  );
}
