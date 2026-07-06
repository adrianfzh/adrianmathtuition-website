'use client';
import { useEffect, useState, useCallback } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';

interface Cluster {
  theme: string;
  proposed_rule: string;
  confidence: 'high' | 'medium' | 'low';
  affects_topics: string[];
  suggestion_ids: number[];
  recordIds: string[];
}

interface Batch {
  batchId: string;
  status: string;
  clusters: Cluster[];
}

interface TopicRate {
  topic: string;
  rate: number;
  sugs: number;
  qs: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

const CONF_COLORS: Record<string, string> = {
  high: '#16a34a',
  medium: '#d97706',
  low: '#dc2626',
};

export default function ImprovementsDashboard() {
  const [batches, setBatches]       = useState<Batch[]>([]);
  const [topicRates, setTopicRates] = useState<TopicRate[]>([]);
  const [trend, setTrend]           = useState<TrendPoint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [days, setDays]             = useState(14);
  const [actionMsg, setActionMsg]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    ensureAdminSession()
      .then(() => fetch(`/api/admin/improvements?days=${days}`))
      .then(r => r.json())
      .then(data => {
        setBatches(data.batches || []);
        setTopicRates(data.topicRates || []);
        setTrend(data.trend || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function doAction(batchId: string, clusterIdx: number, act: 'approve' | 'reject', reason?: string) {
    setActionMsg('');
    const res = await fetch('/api/admin/improvements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, clusterIdx, action: act, reason }),
    });
    const d = await res.json();
    if (d.ok) {
      setActionMsg(act === 'approve' ? '✅ Rule appended to prompt_additions.txt' : '🗑 Cluster rejected');
      load();
    } else {
      setActionMsg('❌ ' + (d.error || 'Error'));
    }
  }

  const maxTrend = Math.max(...trend.map(t => t.count), 1);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14, fontWeight: 600, display: 'inline-block', marginBottom: 12 }}>‹ Admin</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Improvements Dashboard</h1>
      <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
        Suggestion clusters from the evaluator · approve to append rule to prompt_additions.txt
      </p>

      {/* Error rates table */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Topic error rates</h2>
          <select
            value={days}
            onChange={e => setDays(parseInt(e.target.value, 10))}
            style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button onClick={load} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
        {loading ? <div style={{ color: '#94a3b8' }}>Loading…</div> : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Topic', 'Rate', 'Suggestions', 'Questions', 'Edge candidate?'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Topic' ? 'left' : 'right', padding: '8px 10px', fontWeight: 600, color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topicRates.map(r => (
                <tr key={r.topic} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 10px' }}>{r.topic}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: r.rate >= 0.5 ? '#dc2626' : r.rate >= 0.25 ? '#d97706' : '#16a34a' }}>
                    {(r.rate * 100).toFixed(0)}%
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.sugs}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.qs}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                    {r.rate >= 0.5 && r.qs >= 5 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ Yes</span> : ''}
                  </td>
                </tr>
              ))}
              {topicRates.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '16px 10px', color: '#94a3b8', textAlign: 'center' }}>No data for this period</td></tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* Volume trend */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Suggestion volume (last 30 days)</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, background: '#f8fafc', borderRadius: 8, padding: '8px 8px 0' }}>
          {trend.map(t => (
            <div
              key={t.date}
              title={`${t.date}: ${t.count}`}
              style={{
                flex: 1,
                background: t.count > 0 ? '#3b82f6' : '#e2e8f0',
                borderRadius: '2px 2px 0 0',
                height: `${Math.max(4, (t.count / maxTrend) * 100)}%`,
                minHeight: t.count > 0 ? 4 : 2,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          {trend.length > 0 && `${trend[0]?.date} → ${trend[trend.length - 1]?.date} · total: ${trend.reduce((s, t) => s + t.count, 0)}`}
        </div>
      </section>

      {/* Pending batches */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Pending synthesis batches</h2>
        {actionMsg && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 13, color: '#15803d' }}>
            {actionMsg}
          </div>
        )}
        {batches.length === 0 && !loading && (
          <p style={{ color: '#94a3b8', fontSize: 14 }}>No batches awaiting review. Run synthesis first.</p>
        )}
        {batches.map(batch => (
          <div key={batch.batchId} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 16, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Batch {batch.batchId}</h3>
              <span style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 8px', borderRadius: 12, color: '#64748b' }}>
                {batch.clusters.length} cluster{batch.clusters.length !== 1 ? 's' : ''}
              </span>
            </div>
            {batch.clusters.map((c, i) => (
              <div
                key={i}
                style={{ borderLeft: `4px solid ${CONF_COLORS[c.confidence] || '#94a3b8'}`, paddingLeft: 16, marginBottom: 20 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.theme}</span>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#475569' }}>
                    {c.confidence}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{c.suggestion_ids.length} suggestion{c.suggestion_ids.length !== 1 ? 's' : ''}</span>
                </div>
                {c.affects_topics?.length > 0 && (
                  <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>
                    Topics: {c.affects_topics.join(', ')}
                  </p>
                )}
                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#334155', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5 }}>
                  {c.proposed_rule}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => doAction(batch.batchId, i, 'approve')}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => {
                      const reason = window.prompt('Rejection reason (optional):') || '';
                      doAction(batch.batchId, i, 'reject', reason);
                    }}
                    style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                  >
                    🗑 Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
