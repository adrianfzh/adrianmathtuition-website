import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'June Revision — Published Schedules | Admin',
  robots: { index: false, follow: false },
};

// Admin quick-access hub for the two public June-revision schedule pages
// (/june-revision/jc2 + /june-revision/sec4). Links open the public pages so
// Adrian can pull them up to view or share. The pages themselves are public,
// so this hub carries no sensitive data.
const CARDS = [
  {
    href: '/june-revision/jc2',
    badge: 'JC2 · H2 Mathematics',
    title: 'JC2 H2 Math',
    detail: 'Mon & Thu · 12pm — 2.30pm',
    color: '#0f766e',
    bg: '#f0fdfa',
    border: '#99f6e4',
  },
  {
    href: '/june-revision/sec4',
    badge: 'Sec 4 · E Math & A Math',
    title: 'Sec 4 E/A Math',
    detail: 'June holiday revision sprint',
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fcd34d',
  },
];

export default function AdminJuneRevisionHub() {
  return (
    <main style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
      <div style={{ background: '#1e3a5f', color: '#fff', padding: '24px 24px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <a href="/admin" style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>&larr; Admin</a>
          <h1 style={{ margin: '10px 0 0', fontSize: 24, fontWeight: 800 }}>June Revision</h1>
          <div style={{ marginTop: 4, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Published revision schedules — tap to view or share</div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 60px', display: 'grid', gap: 16 }}>
        {CARDS.map((c) => (
          <a
            key={c.href}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textDecoration: 'none', color: 'inherit',
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14,
              padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 4, height: 44, background: c.color, borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: c.color }}>{c.badge}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{c.title}</div>
                <div style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>{c.detail}</div>
              </div>
              <div style={{ fontSize: 22, color: c.color }}>&rarr;</div>
            </div>
          </a>
        ))}

        <a
          href="/admin/revision-signups"
          style={{
            display: 'block', textDecoration: 'none', textAlign: 'center',
            fontSize: 14, fontWeight: 600, color: '#1e3a5f',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: '14px 20px', marginTop: 4,
          }}
        >
          📋 Manage sign-ups &amp; attendance &rarr;
        </a>
      </div>
    </main>
  );
}
