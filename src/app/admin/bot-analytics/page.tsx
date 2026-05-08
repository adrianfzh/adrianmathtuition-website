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
  // enriched client-side
  flagReason?: 'low_confidence' | 'confusion_followup' | 'both';
  confusedFollowUp?: string;
  dismissed?: boolean;
};
type Cluster = { theme: string; proposed_rule: string; confidence: string; affects_topics: string[]; suggestion_ids: number[] };
type ChatMessage = { role: 'user' | 'assistant'; content: string };

// Confusion follow-up signal patterns
const CONFUSION_RE = [
  /^explain\b/i, /^why\b/i, /^how\b/i, /^huh\b/i, /^what\??\s*$/i,
  /don.?t understand/i, /another method/i, /different method/i,
  /\bwrong\b/i, /is this (right|correct)/i, /can you (re)?explain/i,
  /^not sure/i, /^what does/i,
];

function computeFlags(qs: Question[]): Question[] {
  // Group by chatId, sort by time, detect confusion follow-ups
  const byChat: Record<string, Question[]> = {};
  for (const q of qs) {
    if (!byChat[q.chatId]) byChat[q.chatId] = [];
    byChat[q.chatId].push(q);
  }
  const enriched = new Map(qs.map(q => [q.id, { ...q }]));
  for (const group of Object.values(byChat)) {
    group.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (let i = 1; i < group.length; i++) {
      const curr = group[i];
      const prev = group[i - 1];
      const cap = (curr.caption || '').toLowerCase().trim();
      const minsDiff = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 60000;
      if (minsDiff <= 20 && (CONFUSION_RE.some(r => r.test(cap)) || cap.length < 15)) {
        const p = enriched.get(prev.id)!;
        p.confusedFollowUp = curr.caption;
        p.flagReason = p.flagReason === 'low_confidence' ? 'both' : 'confusion_followup';
      }
    }
  }
  for (const q of enriched.values()) {
    const isLow = (q.confidence || '').toLowerCase() === 'low';
    if (isLow) q.flagReason = q.flagReason === 'confusion_followup' ? 'both' : 'low_confidence';
  }
  return qs.map(q => enriched.get(q.id)!);
}

export default function BotAnalytics() {
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [batches, setBatches]       = useState<{ batchId: string; clusters: Cluster[] }[]>([]);
  const [rates, setRates]           = useState<{ topic: string; rate: number; sugs: number; qs: number }[]>([]);
  const [trend, setTrend]           = useState<{ date: string; count: number }[]>([]);
  const [days, setDays]             = useState(7);
  const [loading, setLoading]       = useState(true);
  const [qTab, setQTab]             = useState<'flagged' | 'all'>('flagged');
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set());
  const [selected, setSelected]     = useState<Question | null>(null);
  const [opusOpen, setOpusOpen]     = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [contextItem, setContextItem] = useState<any>(null);
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
      setQuestions(computeFlags(qd.questions || []));
      setBatches(bd.batches || []);
      setRates(rd.rates || []);
      setTrend(rd.trend || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [days, pw]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { chatScrollRef.current?.scrollTo(0, chatScrollRef.current.scrollHeight); }, [chatMessages]);

  function selectQuestion(q: Question) {
    setSelected(q);
    setContextItem(q);
    setOpusOpen(false);
    setChatMessages([]);
    setChatInput('');
  }

  function selectCluster(c: Cluster) {
    setSelected(null);
    setContextItem(c);
    setOpusOpen(true);
    const label = `Theme: ${c.theme}`;
    const firstMsg: ChatMessage = { role: 'user', content: `Let's look at this: ${label}` };
    setChatMessages([firstMsg]);
    sendChat([firstMsg], c);
  }

  function selectRate(r: any) {
    setSelected(null);
    setContextItem(r);
    setOpusOpen(true);
    const label = `Topic error rate: ${r.topic} (${(r.rate * 100).toFixed(0)}%)`;
    const firstMsg: ChatMessage = { role: 'user', content: `Let's look at this: ${label}` };
    setChatMessages([firstMsg]);
    sendChat([firstMsg], r);
  }

  async function discussWithOpus() {
    if (!selected) return;
    setOpusOpen(true);
    const label = `Q from ${selected.studentName}: "${(selected.caption || 'image').slice(0, 60)}"`;
    const flagCtx = selected.flagReason === 'low_confidence'
      ? `\n\nFlag: Bot flagged this as LOW CONFIDENCE.`
      : selected.flagReason === 'confusion_followup'
      ? `\n\nFlag: Student followed up with "${selected.confusedFollowUp}" — possible confusing/wrong answer.`
      : selected.flagReason === 'both'
      ? `\n\nFlag: Bot flagged LOW CONFIDENCE AND student followed up with "${selected.confusedFollowUp}".`
      : '';
    const firstMsg: ChatMessage = {
      role: 'user',
      content: `Please review this bot response and identify if there's an issue:\n\nQuestion: ${selected.caption || '(image question)'}\n\nBot answer: ${selected.aiResponse || '(no answer recorded)'}${flagCtx}\n\nDoes the bot answer look correct and clear? If not, what went wrong and what rule should we add to fix it?`,
    };
    setChatMessages([firstMsg]);
    await sendChat([firstMsg], selected);
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
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ rule, theme, sourceContext: JSON.stringify(contextItem) }),
    });
    const d = await r.json();
    if (d.ok) setChatMessages(prev => [...prev, { role: 'assistant', content: '✅ Rule appended to prompt_additions.txt' }]);
    else alert('Failed: ' + (d.error || 'unknown error'));
  }

  function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    if (selected?.id === id) setSelected(null);
  }

  const flagged = questions.filter(q => q.flagReason && !dismissed.has(q.id));
  const allVisible = questions.filter(q => !dismissed.has(q.id));
  const displayList = qTab === 'flagged' ? flagged : allVisible;
  const totalClusters = batches.reduce((s, b) => s + b.clusters.length, 0);

  function confBadge(conf: string) {
    const isLow = (conf || '').toLowerCase() === 'low';
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
        background: isLow ? '#fef2f2' : '#f0fdf4', color: isLow ? '#dc2626' : '#16a34a' }}>
        {isLow ? '⚠ Low conf' : '✓ High conf'}
      </span>
    );
  }

  function flagBadge(q: Question) {
    if (!q.flagReason) return null;
    const label = q.flagReason === 'low_confidence' ? '⚠ Low confidence'
      : q.flagReason === 'confusion_followup' ? `💬 Confusion: "${(q.confusedFollowUp || '').slice(0, 30)}"`
      : `⚠ Low conf + 💬 Confusion`;
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
        background: '#fef3c7', color: '#92400e', display: 'inline-block', marginTop: 4 }}>
        {label}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      {/* Header */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13 }}>← Admin</a>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Bot Analytics</span>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
          {[2,7,14,30].map(d => <option key={d} value={d}>Last {d} day{d!==1?'s':''}</option>)}
        </select>
        <button onClick={load} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13 }}>↻ Refresh</button>
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
          {questions.length} questions · {flagged.length} flagged · {totalClusters} clusters
        </span>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>}

      {!loading && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT: questions + clusters + error rates */}
          <div style={{ width: '45%', overflowY: 'auto', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>

            {/* Questions section */}
            <div style={{ padding: '12px 16px 0' }}>
              <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                {(['flagged', 'all'] as const).map(tab => (
                  <button key={tab} onClick={() => setQTab(tab)} style={{
                    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: qTab === tab ? '#1e3a5f' : 'transparent',
                    color: qTab === tab ? '#fff' : '#64748b',
                  }}>
                    {tab === 'flagged' ? `🔴 Flagged (${flagged.length})` : `All (${allVisible.length})`}
                  </button>
                ))}
              </div>

              {qTab === 'flagged' && flagged.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0', fontSize: 13 }}>
                  ✅ No flagged responses in this period
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
              {displayList.map(q => {
                const isSelected = selected?.id === q.id;
                return (
                  <div key={q.id}
                    onClick={() => selectQuestion(q)}
                    style={{
                      background: isSelected ? '#eff6ff' : '#fff',
                      borderRadius: 8, padding: '10px 14px', marginBottom: 6,
                      borderLeft: `3px solid ${q.flagReason ? '#f59e0b' : '#e2e8f0'}`,
                      cursor: 'pointer', transition: 'background 0.1s',
                      outline: isSelected ? '2px solid #3b82f6' : 'none',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, marginBottom: 3 }}>
                      <span>{q.studentName} · {q.topic || 'no topic'} · {q.modelUsed?.replace('Claude Sonnet 4.6','Sonnet').replace('Claude Opus 4.6','Opus').replace('claude-sonnet-4-6','Sonnet')}</span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {confBadge(q.confidence)}
                        {q.timestamp ? new Date(q.timestamp).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'}) : ''}
                      </span>
                    </div>
                    {q.caption && <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.caption}</div>}
                    {q.aiResponse && <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>→ {q.aiResponse.slice(0,100)}</div>}
                    {flagBadge(q)}
                  </div>
                );
              })}

              {/* Clusters */}
              {totalClusters > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#475569' }}>⚡ Clustered themes ({totalClusters})</div>
                  {batches.map(b => b.clusters.map((c, i) => (
                    <div key={`${b.batchId}-${i}`} onClick={() => selectCluster(c)}
                      style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', marginBottom: 6, borderLeft: `3px solid ${c.confidence==='high'?'#22c55e':c.confidence==='medium'?'#f59e0b':'#ef4444'}`, cursor: 'pointer' }}
                      onMouseOver={e => (e.currentTarget.style.background='#f0f9ff')}
                      onMouseOut={e => (e.currentTarget.style.background='#fff')}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.theme}</span>
                        <span style={{ fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>{c.confidence}</span>
                      </div>
                      {c.affects_topics?.length > 0 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{c.affects_topics.join(', ')}</div>}
                    </div>
                  )))}
                </div>
              )}

              {/* Error rates */}
              {rates.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#475569' }}>📊 Topic error rates</div>
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
                            onClick={() => selectRate(r)}
                            onMouseOver={e => (e.currentTarget.style.background='#f0f9ff')}
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
              )}
            </div>
          </div>

          {/* RIGHT: Q&A detail + Opus chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>

            {/* No selection state */}
            {!selected && !opusOpen && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 8 }}>
                <div style={{ fontSize: 32 }}>🔍</div>
                <div style={{ fontSize: 13 }}>Click a question to review it</div>
                <div style={{ fontSize: 12 }}>Start in the 🔴 Flagged tab — those need attention most</div>
              </div>
            )}

            {/* Q&A detail view */}
            {selected && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

                {/* Detail header */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{selected.studentName}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>·</span>
                  <span style={{ color: '#64748b', fontSize: 12 }}>{selected.topic || 'no topic'}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>·</span>
                  <span style={{ color: '#64748b', fontSize: 12 }}>{selected.modelUsed?.replace('Claude Sonnet 4.6','Sonnet').replace('Claude Opus 4.6','Opus').replace('claude-sonnet-4-6','Sonnet')}</span>
                  {confBadge(selected.confidence)}
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 11 }}>
                    {selected.timestamp ? new Date(selected.timestamp).toLocaleString('en-SG', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
                  </span>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
                </div>

                {/* Scrollable detail body */}
                <div style={{ flex: opusOpen ? '0 0 auto' : 1, overflowY: 'auto', maxHeight: opusOpen ? '35%' : undefined, padding: '14px 16px', borderBottom: opusOpen ? '1px solid #e2e8f0' : 'none' }}>

                  {/* Flag banner */}
                  {selected.flagReason && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
                      {selected.flagReason === 'low_confidence' && '⚠ Bot flagged this response as low confidence'}
                      {selected.flagReason === 'confusion_followup' && <>💬 Student followed up with <strong>"{selected.confusedFollowUp}"</strong> — bot answer may have been unclear or wrong</>}
                      {selected.flagReason === 'both' && <>⚠ Low confidence + student replied <strong>"{selected.confusedFollowUp}"</strong></>}
                    </div>
                  )}

                  {/* Question */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Question</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                      {selected.caption || '(image question — no text caption)'}
                    </div>
                  </div>

                  {/* Bot answer */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Bot answer</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', maxHeight: opusOpen ? 120 : 280, overflowY: 'auto' }}>
                      {selected.aiResponse || '(no response recorded)'}
                    </div>
                  </div>

                  {/* Actions */}
                  {!opusOpen && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={discussWithOpus}
                        style={{ padding: '8px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Discuss with Opus ▸
                      </button>
                      <button onClick={() => dismiss(selected.id)}
                        style={{ padding: '8px 16px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                        ✓ Looks fine
                      </button>
                    </div>
                  )}
                </div>

                {/* Opus chat — shown after "Discuss with Opus" clicked */}
                {opusOpen && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: 12, color: '#1e3a5f' }}>✦ Opus discussion</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => dismiss(selected.id)}
                          style={{ fontSize: 12, color: '#16a34a', background: 'none', border: '1px solid #86efac', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                          ✓ Looks fine
                        </button>
                        <button onClick={() => { setOpusOpen(false); setChatMessages([]); }}
                          style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                      </div>
                    </div>

                    <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                      {chatMessages.map((m, i) => {
                        const rule = m.role === 'assistant' ? extractRule(m.content) : null;
                        const displayContent = m.content.replace(/```rule\n([\s\S]*?)\n```/g, (_, r) =>
                          `\n[RULE BLOCK — click Apply below]\n${r}\n`);
                        return (
                          <div key={i} style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{m.role === 'user' ? 'You' : '✦ Opus'}</div>
                            <div style={{ background: m.role === 'user' ? '#eff6ff' : '#f8fafc', borderRadius: 10, padding: '8px 12px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{displayContent}</div>
                            {rule && (
                              <button onClick={() => applyRule(rule)}
                                style={{ marginTop: 6, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                ✅ Apply this rule
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {chatLoading && <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>Opus is thinking…</div>}
                    </div>

                    <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                      <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                        placeholder="Follow up… (Cmd+Enter to send)"
                        style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit' }}
                        rows={2} />
                      <button onClick={send} disabled={chatLoading || !chatInput.trim()}
                        style={{ padding: '0 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (chatLoading||!chatInput.trim()) ? 0.4 : 1 }}>
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Opus-only mode (clusters/error rates) */}
            {!selected && opusOpen && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>✦ Discuss with Opus</span>
                  <button onClick={() => { setOpusOpen(false); setChatMessages([]); }}
                    style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                </div>
                <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                  {chatMessages.map((m, i) => {
                    const rule = m.role === 'assistant' ? extractRule(m.content) : null;
                    const displayContent = m.content.replace(/```rule\n([\s\S]*?)\n```/g, (_, r) =>
                      `\n[RULE BLOCK — click Apply below]\n${r}\n`);
                    return (
                      <div key={i} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{m.role === 'user' ? 'You' : '✦ Opus'}</div>
                        <div style={{ background: m.role === 'user' ? '#eff6ff' : '#f8fafc', borderRadius: 10, padding: '8px 12px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{displayContent}</div>
                        {rule && (
                          <button onClick={() => applyRule(rule)}
                            style={{ marginTop: 6, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            ✅ Apply this rule
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {chatLoading && <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>Opus is thinking…</div>}
                </div>
                <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                  <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                    placeholder="Follow up… (Cmd+Enter to send)"
                    style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit' }}
                    rows={2} />
                  <button onClick={send} disabled={chatLoading || !chatInput.trim()}
                    style={{ padding: '0 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (chatLoading||!chatInput.trim()) ? 0.4 : 1 }}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
