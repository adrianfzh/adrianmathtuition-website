'use client';
import { useEffect, useState, useRef, useCallback } from 'react';

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}
function getAuth(): string {
  return getCookie('admin_pw') || getCookie('schedule_pw') || '';
}

type Question = {
  id: string; timestamp: string; studentName: string; chatId: string;
  caption: string; aiResponse: string; modelUsed: string; topic: string;
  timeTaken: number | null; confidence: string; imageUrl?: string;
  suggestions: { id: string; issue: string; suggestion: string; status: string }[];
};
type Cluster = {
  theme: string; proposed_rule: string; confidence: string;
  affects_topics: string[]; suggestion_ids: number[];
};
type ChatMessage = { role: 'user' | 'assistant'; content: string };

export default function BotAnalytics() {
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [batches, setBatches]       = useState<{ batchId: string; clusters: Cluster[] }[]>([]);
  const [rates, setRates]           = useState<{ topic: string; rate: number; sugs: number; qs: number }[]>([]);
  const [trend, setTrend]           = useState<{ date: string; count: number }[]>([]);
  const [days, setDays]             = useState(7);
  const [loading, setLoading]       = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [contextItem, setContextItem] = useState<any>(null);
  const [contextLabel, setContextLabel] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pw = getAuth();
  const auth = { Authorization: `Bearer ${pw}` };

  const load = useCallback(() => {
    if (!pw) { window.location.href = '/admin'; return; }
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/cockpit/questions?days=${days}`, { headers: auth }).then(r => r.json()),
      fetch(`/api/admin/cockpit/synthesis-batches`, { headers: auth }).then(r => r.json()),
      fetch(`/api/admin/cockpit/error-rates?days=${days}`, { headers: auth }).then(r => r.json()),
    ]).then(([qd, bd, rd]) => {
      setQuestions(qd.questions || []);
      setBatches(bd.batches || []);
      setRates(rd.rates || []);
      setTrend(rd.trend || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [days, pw]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { chatScrollRef.current?.scrollTo(0, chatScrollRef.current.scrollHeight); }, [chatMessages]);

  async function startContext(item: any, label: string) {
    setContextItem(item);
    setContextLabel(label);
    const firstMsg: ChatMessage = { role: 'user', content: `Let's look at this: ${label}` };
    setChatMessages([firstMsg]);
    await sendChat([firstMsg], item);
  }

  async function sendChat(msgs: ChatMessage[], ctx?: any) {
    setChatLoading(true);
    try {
      const r = await fetch('/api/admin/cockpit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ messages: msgs, contextItem: ctx ?? contextItem }),
      });
      const d = await r.json();
      setChatMessages([...msgs, { role: 'assistant', content: d.text || d.error || 'Error' }]);
    } catch (err: any) {
      setChatMessages([...msgs, { role: 'assistant', content: 'Error: ' + err.message }]);
    } finally {
      setChatLoading(false);
    }
  }

  function send() {
    if (!chatInput.trim() || chatLoading) return;
    const next = [...chatMessages, { role: 'user' as const, content: chatInput }];
    setChatMessages(next); setChatInput('');
    sendChat(next);
  }

  function extractRule(text: string) {
    const m = text.match(/```rule\n([\s\S]*?)\n```/);
    return m ? m[1].trim() : null;
  }

  async function applyRule(rule: string) {
    const theme = contextItem?.topic || contextItem?.theme || 'cockpit-applied';
    if (!confirm(`Apply this rule to prompt_additions.txt?\n\n${rule}`)) return;
    const r = await fetch('/api/admin/cockpit/append-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ rule, theme, sourceContext: JSON.stringify(contextItem) }),
    });
    const d = await r.json();
    if (d.ok) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '✅ Rule appended to prompt_additions.txt' }]);
    } else {
      alert('Failed: ' + (d.error || 'unknown error'));
    }
  }

  const totalSugs = questions.reduce((s, q) => s + q.suggestions.length, 0);
  const totalClusters = batches.reduce((s, b) => s + b.clusters.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13 }}>← Admin</a>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Bot Analytics</span>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
          {[2,7,14,30].map(d => <option key={d} value={d}>Last {d} day{d!==1?'s':''}</option>)}
        </select>
        <button onClick={load} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13 }}>↻ Refresh</button>
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
          {questions.length} questions · {totalSugs} suggestions · {totalClusters} clusters
        </span>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>}

      {!loading && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* LEFT: data panel */}
          <div style={{ width: '50%', overflowY: 'auto', padding: 16, background: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>

            {/* Clusters */}
            {totalClusters > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>⚡ Clustered themes ({totalClusters})</div>
                {batches.map(b => b.clusters.map((c, i) => (
                  <div key={`${b.batchId}-${i}`}
                    onClick={() => startContext(c, `Theme: ${c.theme}`)}
                    style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', marginBottom: 6, borderLeft: `3px solid ${c.confidence==='high'?'#22c55e':c.confidence==='medium'?'#f59e0b':'#ef4444'}`, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseOver={e => (e.currentTarget.style.background='#eff6ff')}
                    onMouseOut={e => (e.currentTarget.style.background='#fff')}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c.theme}</span>
                      <span style={{ fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>{c.confidence}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{c.suggestion_ids?.length || 0} sugs</span>
                    </div>
                    {c.affects_topics?.length > 0 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{c.affects_topics.join(', ')}</div>}
                  </div>
                )))}
              </div>
            )}

            {/* Question stream */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>📍 Recent questions ({questions.length})</div>
              {questions.map(q => (
                <div key={q.id}
                  onClick={() => startContext(q, `Q from ${q.studentName}: "${(q.caption||'image').slice(0,60)}"`)}
                  style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', marginBottom: 6, borderLeft: q.suggestions.length > 0 ? '3px solid #f59e0b' : '3px solid transparent', cursor: 'pointer' }}
                  onMouseOver={e => (e.currentTarget.style.background='#eff6ff')}
                  onMouseOut={e => (e.currentTarget.style.background='#fff')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                    <span>{q.studentName} · {q.topic || 'no topic'} · {q.modelUsed?.replace('Claude Sonnet 4.6','Sonnet').replace('Claude Opus 4.6','Opus')}</span>
                    <span>{q.timestamp ? new Date(q.timestamp).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                  </div>
                  {q.caption && <div style={{ fontSize: 13, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.caption}</div>}
                  {q.aiResponse && <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {q.aiResponse.slice(0,120)}</div>}
                  {q.suggestions.length > 0 && <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>💡 {q.suggestions.length} suggestion{q.suggestions.length!==1?'s':''}</div>}
                </div>
              ))}
            </div>

            {/* Error rates */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>📊 Topic error rates</div>
              <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '6px 12px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Topic</th>
                      <th style={{ textAlign: 'right', padding: '6px 12px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Rate</th>
                      <th style={{ textAlign: 'right', padding: '6px 12px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Sugs/Qs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map(r => (
                      <tr key={r.topic} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                        onClick={() => startContext(r, `Topic error rate: ${r.topic} (${(r.rate*100).toFixed(0)}%)`)}
                        onMouseOver={e => (e.currentTarget.style.background='#eff6ff')}
                        onMouseOut={e => (e.currentTarget.style.background='')}>
                        <td style={{ padding: '6px 12px' }}>{r.topic}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: r.rate>0.5?'#dc2626':r.rate>0.2?'#d97706':'#16a34a' }}>{(r.rate*100).toFixed(0)}%</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>{r.sugs}/{r.qs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Trend */}
            {trend.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>📈 Suggestion volume (30d)</div>
                <div style={{ background: '#fff', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
                    {trend.map(t => {
                      const max = Math.max(...trend.map(x => x.count), 1);
                      return <div key={t.date} title={`${t.date}: ${t.count}`}
                        style={{ flex: 1, background: '#6366f1', borderRadius: '2px 2px 0 0', height: `${(t.count/max)*100}%`, minHeight: t.count>0?2:0 }} />;
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: chat panel */}
          <div style={{ width: '50%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Discuss with Opus</span>
                {contextLabel && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{contextLabel.slice(0,50)}</span>}
              </div>
              <button onClick={() => { setChatMessages([]); setContextItem(null); setContextLabel(''); }}
                style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
            </div>

            <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 13, lineHeight: 1.6 }}>
                  Click any item on the left to start a discussion.<br/>
                  Or type below to ask a general question.
                </div>
              )}
              {chatMessages.map((m, i) => {
                const rule = m.role === 'assistant' ? extractRule(m.content) : null;
                const displayContent = m.content.replace(/```rule\n([\s\S]*?)\n```/g, (_, r) =>
                  `\n[RULE BLOCK — click Apply below]\n${r}\n`
                );
                return (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{m.role === 'user' ? 'You' : '✦ Opus'}</div>
                    <div style={{
                      background: m.role === 'user' ? '#eff6ff' : '#f8fafc',
                      borderRadius: 10, padding: '10px 14px',
                      fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                      marginLeft: m.role === 'user' ? 24 : 0,
                      marginRight: m.role === 'assistant' ? 24 : 0,
                    }}>{displayContent}</div>
                    {rule && (
                      <button onClick={() => applyRule(rule)}
                        style={{ marginTop: 8, marginLeft: m.role==='user'?24:0, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        ✅ Apply this rule
                      </button>
                    )}
                  </div>
                );
              })}
              {chatLoading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Opus is thinking…</div>}
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                placeholder="Discuss the issue… (Cmd+Enter to send)"
                style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit' }}
                rows={3}
              />
              <button onClick={send} disabled={chatLoading || !chatInput.trim()}
                style={{ padding: '0 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (chatLoading||!chatInput.trim()) ? 0.4 : 1 }}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
