// /login/link?t=… — where a Telegram /login link lands (16 Oct 2026, lib/login-link.ts).
// Shows one button; the sign-in happens on its POST, never on this page's GET, because
// chat apps open links to draw a preview and would use up the one-time link.
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LoginLinkPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-[hsl(45,100%,96%)] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <h1 className="text-xl font-bold text-navy mb-2">Log in to the app</h1>
        {t ? (
          <>
            <p className="text-sm text-gray-600 mb-5">Tap the button to log in. No password needed.</p>
            <form method="POST" action="/api/portal/login-link">
              <input type="hidden" name="t" value={t} />
              <button type="submit"
                className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
                Log in
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-4">This link works once and stops working 15 minutes after it was sent.</p>
          </>
        ) : (
          <p className="text-sm text-gray-600 mb-4">This link is incomplete. Type /login to the Telegram bot for a new one.</p>
        )}
        <Link href="/login" className="block text-sm text-navy underline underline-offset-2 mt-4">Log in with your password instead</Link>
      </div>
    </main>
  );
}
