'use client';
// /admin/bot — all three bot dashboards on ONE scrolling page (no tabs).
// They each read the shared admin cookie, so there's a single effective login.
import MetricsPage from '../metrics/page';
import AnalyticsDashboard from '../analytics/page';
import BotAnalytics from '../bot-analytics/page';

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1000, margin: '8px auto', padding: '0 16px' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
    </div>
  );
}

export default function BotCombinedPage() {
  return (
    <div>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '12px 16px 0' }}>
        <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>‹ Admin</a>
      </div>
      <Divider label="Metrics" />
      <MetricsPage />
      <Divider label="API usage" />
      <AnalyticsDashboard />
      <Divider label="Analytics" />
      <BotAnalytics />
    </div>
  );
}
