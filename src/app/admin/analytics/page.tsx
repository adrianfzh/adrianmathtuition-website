'use client';
import { useEffect, useState, useCallback } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';

interface ModelStat {
  model: string; count: number; avgTime: number;
  avgTokIn: number; avgTokOut: number;
  totalTokIn: number; totalTokOut: number; cost: number;
}
interface DayModelStat {
  model: string; count: number; cost: number;
  tokIn: number; tokOut: number; avgTime: number;
}
interface TrendPoint {
  date: string; count: number; cost: number;
  tokIn: number; tokOut: number; avgTime: number;
  models: DayModelStat[];
}
interface TopicCount  { topic: string; count: number }
const MODEL_COLOURS: Record<string, string> = {
  'Claude Sonnet 4.6':         '#7c3aed',
  'Claude Opus 4.6':           '#b45309',
  'Claude Opus 4.6 (regen)':   '#d97706',
  'Gemini 3.1 Flash-Lite':     '#0891b2',
  'GPT-5.4':                   '#16a34a',
};
function modelColour(m: string) {
  for (const [k, v] of Object.entries(MODEL_COLOURS)) if (m.includes(k.split(' ')[1] || k)) return v;
  return '#64748b';
}

export default function AnalyticsDashboard() {
  const [days, setDays]         = useState(7);
  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState<any>(null);
  const [analysis, setAnalysis] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [analysisDays, setAnalysisDays] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setData(null);
    setSelectedDate(null);
    ensureAdminSession()
      .then(() => fetch(`/api/admin-analytics?days=${days}`))
      .then(r => {
        if (r.status === 401) { window.location.href = '/admin'; return null; }
        return r.json();
      })
      .then(d => { if (d) { setData(d); } setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function runAnalysis() {
    setAnalysing(true);
    setAnalysis('');
    try {
      const r = await fetch('/api/admin-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: analysisDays }),
      });
      if (r.status === 401) { window.location.href = '/admin'; return; }
      const d = await r.json();
      setAnalysis(d.analysis || d.error || 'No response');
    } finally {
      setAnalysing(false);
    }
  }

  const maxTrend = data ? Math.max(...(data.trend || []).map((t: TrendPoint) => t.count), 1) : 1;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bot Analytics</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>API usage · question log · AI analysis</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={days}
            onChange={e => setDays(parseInt(e.target.value, 10))}
            style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
          >
            {[1,3,7,14,30].map(d => <option key={d} value={d}>Last {d} day{d!==1?'s':''}</option>)}
          </select>
          <button
            onClick={load}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, cursor: 'pointer', background: '#f8fafc' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Loading…</div>}

      {data && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Questions', value: data.totalQuestions },
              { label: 'Total cost', value: `$${data.totalCost.toFixed(3)}` },
              { label: 'Avg/day', value: (data.totalQuestions / days).toFixed(1) },
              { label: 'Models used', value: data.modelStats?.length ?? 0 },
            ].map(c => (
              <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Volume trend */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Daily volume</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>(click a bar for that day&apos;s breakdown)</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 2, height: 72 }}>
              {(data.trend || []).map((t: TrendPoint) => {
                const isSelected = selectedDate === t.date;
                return (
                  <button
                    key={t.date}
                    type="button"
                    title={`${t.date}: ${t.count} questions · $${(t.cost ?? 0).toFixed(3)}`}
                    onClick={() => setSelectedDate(isSelected ? null : t.date)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'flex-end',
                      padding: 0,
                      border: 'none',
                      background: isSelected ? '#eef2ff' : 'transparent',
                      borderRadius: 4,
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{
                      display: 'block',
                      width: '100%',
                      background: isSelected ? '#4338ca' : (t.count > 0 ? '#6366f1' : '#e2e8f0'),
                      outline: isSelected ? '2px solid #1e1b4b' : 'none',
                      outlineOffset: 1,
                      borderRadius: '2px 2px 0 0',
                      height: `${Math.max(6, (t.count / maxTrend) * 100)}%`,
                      minHeight: t.count > 0 ? 6 : 2,
                      transition: 'height 0.2s, background 0.15s',
                      pointerEvents: 'none',
                    }} />
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              {(data.trend || []).length > 0 && `${data.trend[0]?.date} → ${data.trend[data.trend.length-1]?.date}`}
            </div>

            {selectedDate && (() => {
              const day: TrendPoint | undefined = (data.trend || []).find((t: TrendPoint) => t.date === selectedDate);
              if (!day) return null;
              return (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{day.date}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {day.count} question{day.count !== 1 ? 's' : ''} · ${day.cost.toFixed(3)} · {day.avgTime}s avg
                    </div>
                    <button
                      onClick={() => setSelectedDate(null)}
                      style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                  {day.models.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>No questions on this day.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 480 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            {['Model','Questions','Avg time','Tokens in','Tokens out','Cost'].map(h => (
                              <th key={h} style={{ textAlign: h === 'Model' ? 'left' : 'right', padding: '4px 8px', color: '#94a3b8', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {day.models.map(m => (
                            <tr key={m.model} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: modelColour(m.model), marginRight: 6 }} />
                                {m.model}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{m.count}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.avgTime}s</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{m.tokIn.toLocaleString()}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{m.tokOut.toLocaleString()}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>${m.cost.toFixed(3)}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                            <td style={{ padding: '6px 8px' }}>Total</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{day.count}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{day.avgTime}s</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{day.tokIn.toLocaleString()}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{day.tokOut.toLocaleString()}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>${day.cost.toFixed(3)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Model stats */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12 }}>API usage by model</div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {['Model','Questions','Avg time','Avg tok in','Avg tok out','Cost'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Model' ? 'left' : 'right', padding: '6px 10px', color: '#94a3b8', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.modelStats || []).map((s: ModelStat) => (
                  <tr key={s.model} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: modelColour(s.model), marginRight: 6 }} />
                      {s.model}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{s.count}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.avgTime}s</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{s.avgTokIn.toLocaleString()}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{s.avgTokOut.toLocaleString()}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>${s.cost.toFixed(3)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <td style={{ padding: '8px 10px' }}>Total</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{data.totalQuestions}</td>
                  <td colSpan={3} />
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>${data.totalCost.toFixed(3)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Cost breakdown by feature */}
          {data.costBreakdown && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12 }}>💰 Cost breakdown (CostLog)</div>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Today', value: `$${data.costBreakdown.today.toFixed(3)}`, sub: `vs $${data.costBreakdown.yesterday.toFixed(3)} yesterday` },
                  { label: `${data.costBreakdown.periodDays}d total`, value: `$${data.costBreakdown.periodTotal.toFixed(2)}`, sub: `$${data.costBreakdown.avgPerDay.toFixed(2)}/day avg` },
                  { label: 'Proj. month', value: `$${(data.costBreakdown.avgPerDay * 30).toFixed(0)}`, sub: 'at current rate' },
                ].map(c => (
                  <div key={c.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{c.value}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.sub}</div>
                  </div>
                ))}
              </div>
              {/* By feature + by model side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>BY FEATURE</div>
                  {(data.costBreakdown.features || []).slice(0, 10).map((f: any) => (
                    <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f8fafc' }}>
                      <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{f.feature}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>${f.cost.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>BY MODEL</div>
                  {(data.costBreakdown.models || []).map((m: any) => (
                    <div key={m.model} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f8fafc' }}>
                      <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{m.model}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>${m.cost.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* 30-day trend bar chart */}
              {data.costBreakdown.trend?.length > 0 && (() => {
                const maxCost = Math.max(...data.costBreakdown.trend.map((t: any) => t.cost), 0.001);
                return (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>DAILY TREND</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
                      {data.costBreakdown.trend.map((t: any) => (
                        <div
                          key={t.date}
                          title={`${t.date}: $${t.cost.toFixed(3)}`}
                          style={{
                            flex: 1, borderRadius: '2px 2px 0 0', background: '#10b981',
                            height: `${Math.max((t.cost / maxCost) * 100, t.cost > 0 ? 4 : 0)}%`,
                            minHeight: t.cost > 0 ? 2 : 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Topics */}
          {data.topics?.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>Top topics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(data.topics || []).map((t: TopicCount) => (
                  <span key={t.topic} style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 20,
                    background: '#f1f5f9', color: '#475569',
                  }}>
                    {t.topic} <strong>{t.count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: analysis ? 12 : 0, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>AI Analysis</div>
              <select
                value={analysisDays}
                onChange={e => setAnalysisDays(parseInt(e.target.value, 10))}
                style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
              >
                {[1,3,7].map(d => <option key={d} value={d}>Last {d} day{d!==1?'s':''}</option>)}
              </select>
              <button
                onClick={runAnalysis}
                disabled={analysing}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, cursor: analysing ? 'not-allowed' : 'pointer', opacity: analysing ? 0.6 : 1 }}
              >
                {analysing ? 'Analysing…' : '🤖 Run Analysis'}
              </button>
            </div>
            {analysis && (
              <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, background: '#f8fafc', borderRadius: 8, padding: '12px 14px' }}>
                {analysis}
              </div>
            )}
          </div>

          {/* Per-question log moved to Bot Analytics (cost + response time live there now) */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', fontSize: 13, color: '#64748b' }}>
            Per-question log — with cost &amp; response time — now lives in{' '}
            <a href="/admin/bot-analytics" style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>Bot Analytics →</a>
          </div>
        </>
      )}
    </div>
  );
}
