// /admin/library — 🗂 every paper the question banks were given, and where each one stands
// (Adrian, 5 Oct 2026: "organize pdfs that were extracted so we know what's being extracted
// at a glance … so we know what's extracted and what's not - keep a list or an index?").
// Adrian, the same day: "the index for extraction just build for your own use - don't have
// to let me see" — so it is a tool for sessions: no hub tile; sessions mostly use
// `npx tsx scripts/library-index.ts`. docs/EXTRACTION-QUEUE.md §The index.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import LibraryIndex from './LibraryIndex';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paper library' };

export default async function LibraryPage() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) redirect('/admin');
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-gray-50 px-4 pb-16 pt-6">
      <Link href="/admin" className="text-sm text-indigo-600">← Admin</Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">🗂 Paper library</h1>
      <p className="mt-1 text-[15px] text-gray-700">Every paper given to the question banks, and where it stands.</p>
      <p className="text-sm text-gray-500">The same list from a terminal: <span className="font-mono">npx tsx scripts/library-index.ts --summary</span></p>
      <LibraryIndex />
    </main>
  );
}
