'use client';

// TODO PORTAL: Build the /verify-email page.
//
// This is the destination of the verification link that Supabase Auth emails
// to a newly-signed-up user. Supabase handles the actual token verification on
// its end; this page just shows a confirmation message and routes to /app.
//
// Show:
//   - Success: "Email verified ✓ — Welcome to AdrianMath" + auto-redirect to /app after 2s
//   - Error: "This link has expired or already been used" + link to /login
//
// Use the access_token / refresh_token query params Supabase appends.

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-bold mb-4">Verify email</h1>
        <p className="text-sm text-gray-600">
          {/* TODO PORTAL: replace with real verification handler */}
          Email-verification handler coming soon. See PORTAL.md.
        </p>
      </div>
    </main>
  );
}
