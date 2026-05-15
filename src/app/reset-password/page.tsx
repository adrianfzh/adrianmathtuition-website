'use client';

// TODO PORTAL: Build the /reset-password page.
//
// Two modes detected via query param:
//   - No token: show "enter your email" form → POST to Supabase
//                Auth → triggers reset email
//   - With token: show "set new password" form → consume token via Supabase
//
// On success in either mode: short confirmation + link back to /login.

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-bold mb-4">Reset password</h1>
        <p className="text-sm text-gray-600">
          {/* TODO PORTAL: replace with real form */}
          Reset-password flow coming soon. See PORTAL.md.
        </p>
      </div>
    </main>
  );
}
