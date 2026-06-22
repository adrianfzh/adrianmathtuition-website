// /admin/bot — hub grouping the three bot dashboards under one menu entry.
const BOT_PAGES = [
  { emoji: '📈', title: 'Bot Metrics',   sub: 'Volume · friction · version comparison', href: '/admin/metrics' },
  { emoji: '🤖', title: 'Bot Analytics', sub: 'Questions · suggestions · Opus chat',     href: '/admin/bot-analytics' },
  { emoji: '📊', title: 'API Usage',     sub: 'Cost · token usage · question log',        href: '/admin/analytics' },
];

export default function BotHubPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 18px' }}>
        <a href="/admin" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>‹</a>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Bot</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {BOT_PAGES.map(p => (
          <a key={p.href} href={p.href}
            style={{ display: 'block', background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 14, padding: '16px 18px', textDecoration: 'none' }}>
            <div style={{ fontSize: 26 }}>{p.emoji}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginTop: 8 }}>{p.title}</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{p.sub}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
