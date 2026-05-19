import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const LEVELS = [
  { slug: 's1', label: 'S1', sub: 'Sec 1',    from: '#1d4ed8', to: '#3b82f6' },
  { slug: 's2', label: 'S2', sub: 'Sec 2',    from: '#0369a1', to: '#0ea5e9' },
  { slug: 'em', label: 'EM', sub: 'E Math',   from: '#6d28d9', to: '#a855f7' },
  { slug: 'am', label: 'AM', sub: 'A Math',   from: '#065f46', to: '#10b981' },
  { slug: 'jc', label: 'JC', sub: 'H2 Maths', from: '#92400e', to: '#f59e0b' },
];

export default async function NotesIndexPage() {
  const cookieStore = await cookies();
  const pw = cookieStore.get('admin_pw')?.value;
  if (!pw || pw !== process.env.ADMIN_PASSWORD) redirect('/admin');

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1e3a5f', padding: '16px 20px 14px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <Link href="/admin" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 13 }}>
            ← Admin
          </Link>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
            🖨️ Notes
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            Tap a level to open and print
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {LEVELS.map(({ slug, label, sub, from, to }, i) => {
            // JC (last, odd index) spans full width
            const isLast = i === LEVELS.length - 1 && LEVELS.length % 2 !== 0;
            return (
              <Link
                key={slug}
                href={`/admin/notes/${slug}`}
                style={{
                  gridColumn: isLast ? 'span 2' : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isLast ? 'center' : 'flex-start',
                  justifyContent: 'flex-end',
                  background: `linear-gradient(135deg, ${from}, ${to})`,
                  borderRadius: 20,
                  padding: isLast ? '24px 28px' : '22px 20px',
                  minHeight: isLast ? 100 : 130,
                  textDecoration: 'none',
                  boxShadow: `0 4px 16px ${from}44`,
                  position: 'relative',
                  overflow: 'hidden',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* Background circle decoration */}
                <div style={{
                  position: 'absolute',
                  top: -20, right: -20,
                  width: 100, height: 100,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: -30, right: isLast ? -10 : -10,
                  width: 80, height: 80,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                }} />

                <div style={{
                  fontSize: isLast ? 36 : 42,
                  fontWeight: 900,
                  color: '#fff',
                  letterSpacing: '-1px',
                  lineHeight: 1,
                  position: 'relative',
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.75)',
                  marginTop: 5,
                  fontWeight: 500,
                  position: 'relative',
                }}>
                  {sub}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
