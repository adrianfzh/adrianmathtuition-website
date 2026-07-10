import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import NotesGrid from './NotesGrid';

export default async function NotesIndexPage() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) redirect('/admin');

  // Tiles + counts render in <NotesGrid /> (client) so the page appears instantly;
  // per-level counts (which need slow Dropbox folder listings) stream in after.
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #16305a, #24466f)', padding: '18px 20px 18px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <Link href="/admin" style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            ← Admin
          </Link>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>🖨️ Print Notes</div>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
            Tap a level to open and print
          </div>
        </div>
      </div>

      {/* Grid (client — renders instantly, counts stream in) */}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '22px 16px 48px' }}>
        <NotesGrid />
      </div>
    </div>
  );
}
