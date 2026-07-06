'use client';

import { useState, useEffect, useRef } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';

type Trend = 'up' | 'down' | 'same';
type Metric = { curr: number; prior: number | null; trend: Trend };
type Data = {
  generatedAt: string;
  headline: Record<string, Metric>;
  topicFriction: { topic: string; total: number; lowConfRate: number; pushbackRate: number; frictionScore: number }[];
  dailyVolume: { date: string; count: number }[];
  versionComparison: { version: string; totalMessages: number; userMessages: number; followupRate: number; avgLatencyMs: number | null }[];
  topFrictionStudents: { chatId: string; total: number; frictionCount: number; frictionRate: number }[];
};

const CARDS: { key: string; label: string; unit?: string; fmt?: (v: number) => string }[] = [
  { key: 'activeStudents',  label: 'Active students',      fmt: v => String(v) },
  { key: 'totalQuestions',  label: 'Bot answers',           fmt: v => String(v) },
  { key: 'lowConfRate',     label: 'Low confidence',        fmt: v => `${v}%` },
  { key: 'pushbackRate',    label: 'Pushback rate',         fmt: v => `${v}%` },
  { key: 'followupRate',    label: 'Follow-up rate',        fmt: v => `${v}%` },
  { key: 'avgLatencyMs',    label: 'Avg latency',           fmt: v => v ? `${(v/1000).toFixed(1)}s` : '—' },
  { key: 'avgResponseTime', label: 'Avg response time',     fmt: v => v ? `${v}s` : '—' },
];

export default function MetricsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  useEffect(() => {
    ensureAdminSession()
      .then(ok => {
        if (!ok) { window.location.href = '/admin'; return Promise.reject('Not authed'); }
        return fetch('/api/admin/metrics');
      })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error || 'Failed')))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw Chart.js line chart once data + canvas are ready
  useEffect(() => {
    if (!data || !chartRef.current) return;
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !chartRef.current) return;
      if (chartInstance.current) chartInstance.current.destroy();
      const labels = data.dailyVolume.map(d => {
        const dt = new Date(d.date + 'T00:00:00Z');
        return dt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      });
      chartInstance.current = new w.Chart(chartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Bot answers per day',
            data: data.dailyVolume.map(d => d.count),
            borderColor: '#1e3a5f', backgroundColor: 'rgba(30,58,95,0.08)',
            borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 11 } } },
            y: { beginAtZero: true, ticks: { font: { size: 11 } } },
          },
        },
      });
    };
    if (w.Chart) { draw(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4';
    s.onload = draw;
    document.head.appendChild(s);
  }, [data]);

  function trendIcon(t: Trend) {
    if (t === 'up') return <span style={{ color: '#16a34a', fontSize: 14 }}>↑</span>;
    if (t === 'down') return <span style={{ color: '#dc2626', fontSize: 14 }}>↓</span>;
    return <span style={{ color: '#94a3b8', fontSize: 14 }}>→</span>;
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="mx-wrap">
        {/* Header */}
        <div className="mx-header">
          <a href="/admin" className="mx-back">← Admin</a>
          <span className="mx-title">Bot Metrics</span>
          {data && <span className="mx-updated">Updated {fmtDate(data.generatedAt)}</span>}
          <a href="/api/admin/metrics" className="mx-refresh-btn" target="_blank">↻ Refresh</a>
        </div>

        {loading && <div className="mx-loading">Loading metrics…</div>}
        {error && <div className="mx-error">⚠ {error}</div>}

        {data && (
          <div className="mx-body">

            {/* 1 — Headline cards */}
            <section className="mx-section">
              <h2 className="mx-section-title">Last 7 days vs prior 7 days</h2>
              <div className="mx-cards">
                {CARDS.map(c => {
                  const m = data.headline[c.key];
                  if (!m) return null;
                  const fmtVal = c.fmt ? c.fmt(m.curr) : String(m.curr);
                  const priorVal = m.prior !== null && c.fmt ? c.fmt(m.prior) : m.prior !== null ? String(m.prior) : null;
                  return (
                    <div key={c.key} className="mx-card">
                      <div className="mx-card-label">{c.label}</div>
                      <div className="mx-card-value">{fmtVal} {trendIcon(m.trend)}</div>
                      {priorVal !== null && <div className="mx-card-prior">prior: {priorVal}</div>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 2 — Topic friction */}
            <section className="mx-section">
              <h2 className="mx-section-title">Friction by topic <span className="mx-section-sub">(last 7 days, ≥2 questions)</span></h2>
              {data.topicFriction.length === 0
                ? <p className="mx-empty">No data yet</p>
                : (
                <div className="mx-table-wrap">
                  <table className="mx-table">
                    <thead>
                      <tr><th>Topic</th><th>Questions</th><th>Low conf</th><th>Pushback</th><th>Friction score</th></tr>
                    </thead>
                    <tbody>
                      {data.topicFriction.map(r => (
                        <tr key={r.topic}>
                          <td>{r.topic}</td>
                          <td>{r.total}</td>
                          <td style={{ color: r.lowConfRate > 20 ? '#dc2626' : '#475569' }}>{r.lowConfRate}%</td>
                          <td style={{ color: r.pushbackRate > 5 ? '#dc2626' : '#475569' }}>{r.pushbackRate}%</td>
                          <td>
                            <div className="mx-bar-wrap">
                              <div className="mx-bar" style={{ width: `${Math.min(r.frictionScore, 100)}%`, background: r.frictionScore > 30 ? '#dc2626' : r.frictionScore > 15 ? '#d97706' : '#16a34a' }} />
                              <span className="mx-bar-label">{r.frictionScore}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 3 — Daily volume */}
            <section className="mx-section">
              <h2 className="mx-section-title">Daily bot answers <span className="mx-section-sub">(last 30 days)</span></h2>
              <div className="mx-chart-wrap">
                <canvas ref={chartRef} />
              </div>
            </section>

            {/* 4 — Per-version comparison */}
            <section className="mx-section">
              <h2 className="mx-section-title">Per bot version <span className="mx-section-sub">(last 60 days)</span></h2>
              {data.versionComparison.length === 0
                ? <p className="mx-empty">No bot_version data yet — populate BOT_VERSION in config/version.js</p>
                : (
                <div className="mx-table-wrap">
                  <table className="mx-table">
                    <thead>
                      <tr><th>Version</th><th>Messages</th><th>User msgs</th><th>Follow-up rate</th><th>Avg latency</th></tr>
                    </thead>
                    <tbody>
                      {data.versionComparison.map(r => (
                        <tr key={r.version}>
                          <td><code>{r.version}</code></td>
                          <td>{r.totalMessages}</td>
                          <td>{r.userMessages}</td>
                          <td style={{ color: r.followupRate > 30 ? '#dc2626' : '#475569' }}>{r.followupRate}%</td>
                          <td>{r.avgLatencyMs ? `${(r.avgLatencyMs / 1000).toFixed(1)}s` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 5 — Top friction students */}
            <section className="mx-section">
              <h2 className="mx-section-title">Top friction students <span className="mx-section-sub">(last 14 days, ≥3 questions)</span></h2>
              {data.topFrictionStudents.length === 0
                ? <p className="mx-empty">No friction students in this period</p>
                : (
                <div className="mx-table-wrap">
                  <table className="mx-table">
                    <thead>
                      <tr><th>Chat ID</th><th>Questions</th><th>Friction events</th><th>Friction rate</th></tr>
                    </thead>
                    <tbody>
                      {data.topFrictionStudents.map(r => (
                        <tr key={r.chatId}>
                          <td><code style={{ fontSize: 11 }}>{r.chatId}</code></td>
                          <td>{r.total}</td>
                          <td>{r.frictionCount}</td>
                          <td style={{ color: r.frictionRate > 30 ? '#dc2626' : '#475569', fontWeight: 600 }}>{r.frictionRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 6 — Reactions (placeholder) */}
            <section className="mx-section">
              <h2 className="mx-section-title">Bot reactions 👍 👎 <span className="mx-section-sub">coming once reaction tracking ships</span></h2>
              <p className="mx-empty">No reaction data yet. Once students can 👍/👎 responses, satisfaction rate per day and per-topic will appear here.</p>
            </section>

          </div>
        )}
      </div>
    </>
  );
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; color: #1e293b; }

.mx-wrap { max-width: 960px; margin: 0 auto; min-height: 100vh; }

.mx-header { background: #1e3a5f; color: white; padding: 12px 20px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 10; }
.mx-back { color: rgba(255,255,255,0.65); text-decoration: none; font-size: 14px; }
.mx-back:hover { color: white; }
.mx-title { font-size: 20px; font-weight: 700; flex: 1; }
.mx-updated { font-size: 11px; color: rgba(255,255,255,0.5); }
.mx-refresh-btn { font-size: 12px; padding: 4px 10px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: white; text-decoration: none; cursor: pointer; }
.mx-refresh-btn:hover { background: rgba(255,255,255,0.25); }

.mx-loading { text-align: center; padding: 60px; color: #94a3b8; font-size: 16px; }
.mx-error { margin: 20px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 14px 16px; color: #dc2626; }

.mx-body { padding: 20px; display: flex; flex-direction: column; gap: 24px; }

.mx-section { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.mx-section-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 14px; }
.mx-section-sub { font-size: 12px; font-weight: 400; color: #94a3b8; }
.mx-empty { color: #94a3b8; font-size: 14px; padding: 8px 0; }

.mx-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.mx-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
.mx-card-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
.mx-card-value { font-size: 26px; font-weight: 700; color: #1e293b; line-height: 1.1; display: flex; align-items: center; gap: 4px; }
.mx-card-prior { font-size: 11px; color: #94a3b8; margin-top: 2px; }

.mx-chart-wrap { height: 220px; position: relative; }

.mx-table-wrap { overflow-x: auto; }
.mx-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mx-table th { background: #f8fafc; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
.mx-table td { padding: 8px 12px; border-bottom: 1px solid #f8fafc; }
.mx-table tr:last-child td { border-bottom: none; }
.mx-table tr:hover td { background: #f8fafc; }

.mx-bar-wrap { display: flex; align-items: center; gap: 8px; }
.mx-bar { height: 6px; border-radius: 3px; min-width: 2px; transition: width 0.3s; }
.mx-bar-label { font-size: 12px; color: #475569; white-space: nowrap; }

@media (max-width: 600px) {
  .mx-cards { grid-template-columns: repeat(2, 1fr); }
  .mx-body { padding: 12px; gap: 16px; }
}
`;
