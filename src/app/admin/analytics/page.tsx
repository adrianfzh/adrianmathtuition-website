'use client';
import { useEffect, useState, useCallback } from 'react';

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function getPw(): string {
  if (typeof window === 'undefined') return '';
  return getCookie('admin_pw') || getCookie('schedule_pw') || localStorage.getItem('schedule_pw') || '';
}

interface ModelStat {
  model: string; count: number; avgTime: number;
  avgTokIn: number; avgTokOut: number;
  totalTokIn: number; totalTokOut: number; cost: number;
}
interface TrendPoint { date: string; count: number }
interface TopicCount  { topic: string; count: number }
interface Question {
  id: string; timestamp: string; username: string;
  caption: string; response: string; model: string;
  confidence: string; rating: string; timeTaken: number | null;
  topic: string; hasImage: boolean; cost: number;
}

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
  const [search, setSearch]     = useState('');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/admin-analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${getPw()}` },
    })
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getPw()}` },
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
  const filteredQs: Question[] = (data?.questions || []).filter((q: Question) =>
    !search || q.caption.toLowerCase().includes(search.toLowerCase()) ||
    q.username.toLowerCase().includes(search.toLowerCase()) ||
    q.topic.toLowerCase().includes(search.toLowerCase())
  );

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
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>Daily volume</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 56 }}>
              {(data.trend || []).map((t: TrendPoint) => (
                <div key={t.date} title={`${t.date}: ${t.count}`} style={{
                  flex: 1,
                  background: t.count > 0 ? '#6366f1' : '#e2e8f0',
                  borderRadius: '2px 2px 0 0',
                  height: `${Math.max(4, (t.count / maxTrend) * 100)}%`,
                  minHeight: t.count > 0 ? 4 : 2,
                  transition: 'height 0.2s',
                }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              {(data.trend || []).length > 0 && `${data.trend[0]?.date} → ${data.trend[data.trend.length-1]?.date}`}
            </div>
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

          {/* Question log */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                Question log <span style={{ fontWeight: 400, color: '#94a3b8' }}>({data.totalQuestions} total, showing {filteredQs.length})</span>
              </div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{ marginLeft: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 13, width: 180 }}
              />
            </div>
            <div>
              {filteredQs.map((q: Question) => {
                const expanded = expandedQ === q.id;
                const ts = q.timestamp ? new Date(new Date(q.timestamp).getTime() + 8*3600_000)
                  .toLocaleString('en-SG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?';
                return (
                  <div
                    key={q.id}
                    style={{ borderBottom: '1px solid #f1f5f9', padding: '10px 0', cursor: 'pointer' }}
                    onClick={() => setExpandedQ(expanded ? null : q.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', minWidth: 90 }}>{ts}</span>
                      {q.hasImage && <span title="Image question" style={{ fontSize: 11 }}>🖼</span>}
                      <span style={{ fontSize: 12, color: '#475569', flex: 1, minWidth: 0 }}>{q.caption || '(no text)'}</span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {q.topic && <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 4 }}>{q.topic}</span>}
                        <span style={{ fontSize: 11, color: modelColour(q.model), fontWeight: 600 }}>{q.model.replace('Claude ', 'C-').replace('Gemini ', 'G-').replace('GPT-', 'GPT-')}</span>
                        {q.timeTaken != null && <span style={{ fontSize: 11, color: '#94a3b8' }}>{q.timeTaken}s</span>}
                        {q.confidence === 'LOW' && <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: 4 }}>LOW</span>}
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ marginTop: 8, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Response:</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{q.response}</div>
                        {q.cost > 0 && <div style={{ marginTop: 6, color: '#94a3b8' }}>Cost: ${q.cost.toFixed(5)}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredQs.length === 0 && <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>No questions found</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
