// Holding page shown after an invite/signup that requires email confirmation.
// Supabase verifies the emailed link on its side; the link's redirect lands on
// /auth/callback which establishes the session and forwards to /app. This page
// just tells the student what to do next.
import Link from 'next/link';

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[hsl(45,100%,97%)]">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-md border border-black/5 p-8 text-center">
        <div className="text-4xl mb-4">📬</div>
        <h1 className="text-xl font-bold text-navy mb-3">Check your email</h1>
        <p className="text-sm text-gray-600 mb-5">
          We&apos;ve sent you a confirmation link. Tap it on this device and you&apos;ll be signed
          straight in. If it doesn&apos;t arrive within a few minutes, check your spam folder.
        </p>
        <Link href="/login" className="text-sm text-navy underline underline-offset-2">
          Back to log in
        </Link>
      </div>
    </main>
  );
}
