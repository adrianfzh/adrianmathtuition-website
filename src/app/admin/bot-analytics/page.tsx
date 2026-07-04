'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { costFor } from '@/lib/model-pricing';

// KaTeX web renderer — loads KaTeX from CDN once and renders math in a div
function WebMathRenderer({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const render = () => {
      if (!ref.current) return;
      const w = window as any;
      if (w.renderMathInElement) {
        // Bare LaTeX environments (no $ delimiters) never get rendered by the
        // delimiter-based pass — wrap them in $$...$$ first, only outside
        // existing math spans (mirrors the /chat renderToElement fix).
        const BARE_ENV = /\\begin\{(pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|aligned|align\*?|gathered)\}[\s\S]*?\\end\{\1\}/g;
        const wrapped = text
          .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g)
          .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(BARE_ENV, (m) => `$$${m}$$`)))
          .join('');
        // Replace newlines with <br> ONLY outside math delimiters so that
        // \begin{pmatrix}-3\\5\end{pmatrix} isn't corrupted before KaTeX runs.
        const safeHtml = wrapped
          .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g)
          .map((chunk, i) => i % 2 === 0
            ? chunk.replace(/\n/g, '<br>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            : chunk // leave math delimiters untouched
          ).join('');
        ref.current.innerHTML = safeHtml;
        w.renderMathInElement(ref.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
        });
      } else if (w.katex) {
        // Fallback: just strip delimiters
        ref.current.textContent = text;
      } else {
        ref.current.textContent = text;
      }
    };
    // If KaTeX not loaded yet, load it
    const w = window as any;
    if (!w.renderMathInElement) {
      if (!document.getElementById('katex-css')) {
        const link = document.createElement('link');
        link.id = 'katex-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('katex-js')) {
        const s = document.createElement('script');
        s.id = 'katex-js';
        s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
        s.onload = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js';
          s2.onload = render;
          document.head.appendChild(s2);
        };
        document.head.appendChild(s);
      } else {
        setTimeout(render, 500);
      }
    } else {
      render();
    }
  }, [text]);

  return <div ref={ref} style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
}

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
  timeTaken: number | null; confidence: string; status: string; imageUrl?: string; isAdminUpload?: boolean;
  tokensIn?: number; tokensOut?: number;
  suggestions: { id: string; issue: string; suggestion: string; status: string }[];
  // enriched client-side
  flagReason?: 'negative_feedback' | 'low_confidence' | 'confusion_followup' | 'admin_forced' | 'multiple';
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

function addFlag(q: Question, reason: Question['flagReason']) {
  if (!q.flagReason) q.flagReason = reason;
  else if (q.flagReason !== reason) q.flagReason = 'multiple';
}

function computeFlags(qs: Question[]): Question[] {
  const byChat: Record<string, Question[]> = {};
  for (const q of qs) {
    if (!byChat[q.chatId]) byChat[q.chatId] = [];
    byChat[q.chatId].push(q);
  }
  const enriched = new Map(qs.map(q => [q.id, { ...q }]));

  // Status-based flags (strongest signals)
  for (const q of enriched.values()) {
    if (q.status === 'negative_feedback') addFlag(q, 'negative_feedback');
    if (q.status === 'admin_forced') addFlag(q, 'admin_forced');
    if (q.status === 'low_confidence' || (q.confidence || '').toLowerCase() === 'low') addFlag(q, 'low_confidence');
  }

  // Confusion follow-up detection (group by chat, sort by time)
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
        addFlag(p, 'confusion_followup');
      }
    }
  }
  return qs.map(q => enriched.get(q.id)!);
}

// ── Telegram text approximation (mirrors bot's latexToUnicode) ───────────────
function toTelegramText(raw: string): string {
  let s = raw || '';
  s = s.replace(/\\\$/g, '\x01');
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/\$([^$\n]+)\$/g, '$1');
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, '$1');
  s = s.replace(/\x01/g, '$');
  s = s.replace(/\\\\/g, '\n');
  s = s.replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, '');
  s = s.replace(/\\left|\\right/g, '');
  // Greek
  const greek: Record<string,string> = { alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',theta:'θ',lambda:'λ',mu:'μ',pi:'π',sigma:'σ',omega:'ω',Gamma:'Γ',Delta:'Δ',Sigma:'Σ',Omega:'Ω' };
  for (const [k,v] of Object.entries(greek)) s = s.replace(new RegExp(`\\\\${k}\\b`,'g'), v);
  s = s.replace(/\\times/g,'×').replace(/\\div/g,'÷').replace(/\\pm/g,'±').replace(/\\leq/g,'≤').replace(/\\geq/g,'≥').replace(/\\neq/g,'≠').replace(/\\approx/g,'≈').replace(/\\infty/g,'∞').replace(/\\sqrt\{([^{}]+)\}/g,'√($1)').replace(/\\sqrt\b/g,'√');
  // frac (up to 4 passes)
  for (let i = 0; i < 4; i++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  s = s.replace(/\^\{([^{}]+)\}/g, (_,c) => c.split('').map((ch: string) => '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ'['0123456789+-=()abcdefghijklmnopqrstuvwxyz'.indexOf(ch)] || ch).join(''));
  s = s.replace(/\^([0-9])/g, (_,c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[parseInt(c)]);
  s = s.replace(/\\[a-zA-Z]+\*?\s*/g,'').replace(/[{}]/g,'');
  s = s.replace(/^#{1,6}\s+/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*\n]+)\*/g,'$1');
  return s.replace(/\n{3,}/g,'\n\n').trim();
}

export default function BotAnalytics() {
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [batches, setBatches]       = useState<{ batchId: string; clusters: Cluster[] }[]>([]);
  const [rates, setRates]           = useState<{ topic: string; rate: number; sugs: number; qs: number }[]>([]);
  const [trend, setTrend]           = useState<{ date: string; count: number }[]>([]);
  const [pendingSugs, setPendingSugs] = useState<{
    key: string; suggestion: string; date: string; basedOn: number | null;
    issue?: string | null; question?: string | null; model?: string | null;
    category?: string | null; level?: string | null;
  }[]>([]);
  const [pendingSugsError, setPendingSugsError] = useState(false);
  const [selectedSugKeys, setSelectedSugKeys] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  const [days, setDays]             = useState(1);

  function midnightSGT(daysAgo: number): string {
    const now = new Date();
    const sgt = new Date(now.getTime() + 8 * 3600_000);
    const dateStr = sgt.toISOString().slice(0, 10);
    const d = new Date(`${dateStr}T00:00:00+08:00`);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  }

  function buildDateParams(d: number): string {
    if (d === 1) return `since=${encodeURIComponent(midnightSGT(0))}`; // today only
    if (d === 2) return `since=${encodeURIComponent(midnightSGT(1))}&until=${encodeURIComponent(midnightSGT(0))}`; // yesterday only
    return `since=${encodeURIComponent(midnightSGT(d - 1))}`; // last N days
  }
  const [loading, setLoading]       = useState(true);
  const [qTab, setQTab]             = useState<'flagged' | 'all' | 'mine'>('flagged');
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set());
  const [selected, setSelected]     = useState<Question | null>(null);
  const [opusOpen, setOpusOpen]     = useState(false);
  const [responseView, setResponseView] = useState<'raw' | 'telegram' | 'web'>('telegram');
  const [imgRotation, setImgRotation] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [contextItem, setContextItem] = useState<any>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Lint reports — populated by cron/prompt-lint.js, one row per (run_at, stack)
  type LintFinding = {
    category: string; severity: 'high' | 'medium' | 'low';
    headline: string; source_a?: string | null; source_b?: string | null; fix?: string | null;
  };
  type LintRow = {
    id: string; run_at: string; stack_level: 'AM' | 'EM' | 'JC';
    summary_json: Record<string, number>;
    findings_json: LintFinding[];
    model_used?: string; duration_ms?: number; error_text?: string | null;
  };
  type LintRun = { run_at: string; stacks: Partial<Record<'AM'|'EM'|'JC', LintRow>> };
  const [lintRuns, setLintRuns] = useState<LintRun[]>([]);
  const [lintRunIdx, setLintRunIdx] = useState(0);
  const [lintStack, setLintStack] = useState<'all'|'AM'|'EM'|'JC'>('all');
  const [lintExpanded, setLintExpanded] = useState(false);
  // Auto-expand if user arrives via Telegram digest link with #lint anchor
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#lint') setLintExpanded(true);
  }, []);
  const pw = getAuth();
  const auth = { Authorization: `Bearer ${pw}` };

  const load = useCallback(() => {
    if (!pw) { window.location.href = '/admin'; return; }
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/cockpit/questions?${buildDateParams(days)}`, { headers: auth }).then(r => r.json()),
      fetch(`/api/admin/cockpit/synthesis-batches`, { headers: auth }).then(r => r.json()),
      fetch(`/api/admin/cockpit/error-rates?${buildDateParams(days)}`, { headers: auth }).then(r => r.json()),
      fetch(`/api/admin/cockpit/pending-suggestions`, { headers: auth }).then(r => r.ok ? r.json() : Promise.reject(r.status)).catch(() => { setPendingSugsError(true); return { suggestions: [] }; }),
      fetch(`/api/admin/cockpit/lint-reports?limit=12`, { headers: auth }).then(r => r.ok ? r.json() : { runs: [] }).catch(() => ({ runs: [] })),
    ]).then(([qd, bd, rd, sd, ld]) => {
      setQuestions(computeFlags(qd.questions || []));
      setBatches(bd.batches || []);
      setRates(rd.rates || []);
      setTrend(rd.trend || []);
      setPendingSugs(sd.suggestions || []);
      setLintRuns(ld.runs || []);
      setLintRunIdx(0);
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
    setImgRotation(0);
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
      : selected.flagReason === 'multiple'
      ? `\n\nFlag: Multiple signals — low confidence and/or student followed up with "${selected.confusedFollowUp}".`
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
    if (d.ok) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '✅ Rule appended to prompt_additions.txt' }]);
      // Auto-dismiss the originating suggestion from the left panel (if opened via Discuss)
      const sugKey = contextItem?.suggestionKey;
      if (sugKey) {
        await fetch('/api/admin/cockpit/dismiss-suggestion', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ key: sugKey }),
        });
        setPendingSugs(prev => prev.filter(x => x.key !== sugKey));
      }
    } else {
      alert('Failed: ' + (d.error || 'unknown error'));
    }
  }

  function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    if (selected?.id === id) setSelected(null);
  }

  const flagged = questions.filter(q => q.flagReason && !dismissed.has(q.id) && !q.isAdminUpload);
  const allVisible = questions.filter(q => !dismissed.has(q.id) && !q.isAdminUpload);
  const myUploads = questions.filter(q => q.isAdminUpload && !dismissed.has(q.id));
  const displayList = qTab === 'mine' ? myUploads : qTab === 'flagged' ? flagged : allVisible;

  // Group adjacent turns of the same conversation (same chatId + <30min gap) into
  // threads. displayList is newest-first, so a conversation's turns are adjacent.
  const threadGroups = (() => {
    const groups: { chatId: string; turns: Question[] }[] = [];
    for (const q of displayList) {
      const last = groups[groups.length - 1];
      const prev = last?.turns[last.turns.length - 1];
      const sameChat = !!last && last.chatId === (q.chatId || '');
      const close = !!prev && Math.abs(new Date(prev.timestamp).getTime() - new Date(q.timestamp).getTime()) <= 1_800_000;
      if (last && sameChat && close) last.turns.push(q);
      else groups.push({ chatId: q.chatId || '', turns: [q] });
    }
    return groups;
  })();
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
    const labels: Record<string, string> = {
      negative_feedback: '🚫 Student said wrong',
      low_confidence: '⚠ Low confidence',
      admin_forced: '🔧 Admin intervened',
      confusion_followup: `💬 "${(q.confusedFollowUp || '').slice(0, 25)}"`,
      multiple: '⚠ Multiple signals',
    };
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
        background: q.flagReason === 'negative_feedback' ? '#fef2f2' : '#fef3c7',
        color: q.flagReason === 'negative_feedback' ? '#dc2626' : '#92400e',
        display: 'inline-block', marginTop: 4 }}>
        {labels[q.flagReason] || q.flagReason}
      </span>
    );
  }

  function statusBadge(status: string) {
    const cfg: Record<string, { label: string; bg: string; color: string }> = {
      negative_feedback: { label: '🚫 Wrong', bg: '#fef2f2', color: '#dc2626' },
      low_confidence:    { label: '⚠ Low conf', bg: '#fef3c7', color: '#b45309' },
      admin_forced:      { label: '🔧 Admin fix', bg: '#ede9fe', color: '#6d28d9' },
      New:               { label: 'New', bg: '#f1f5f9', color: '#64748b' },
    };
    const c = cfg[status] || { label: status, bg: '#f1f5f9', color: '#64748b' };
    return <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: c.bg, color: c.color }}>{c.label}</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      {/* Header */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <a href="/admin" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13 }}>← Admin</a>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Bot Analytics</span>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
          {[{d:1,label:'Today'},{d:2,label:'Yesterday'},{d:3,label:'Last 3 days'},{d:7,label:'Last 7 days'}].map(({d,label}) => <option key={d} value={d}>{label}</option>)}
        </select>
        <button onClick={load} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13 }}>↻ Refresh</button>
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
          {allVisible.length} questions · {flagged.length} flagged · {totalClusters} clusters
        </span>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>}

      {/* ─── Lint section (collapsible) ─────────────────────────────── */}
      {!loading && lintRuns.length > 0 && (() => {
        const run = lintRuns[lintRunIdx];
        const stacks = (['AM','EM','JC'] as const).filter(s => run.stacks[s]);
        const filterStacks = lintStack === 'all' ? stacks : stacks.filter(s => s === lintStack);
        const allFindings = filterStacks.flatMap(s => (run.stacks[s]?.findings_json || []).map(f => ({ ...f, _stack: s })));
        const highCount = allFindings.filter(f => f.severity === 'high').length;
        const sevOrder = { high: 0, medium: 1, low: 2 } as const;
        const sortedFindings = allFindings.slice().sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));
        const sevEmoji = (s: string) => s === 'high' ? '🔴' : s === 'medium' ? '🟡' : '⚪️';
        const catLabel: Record<string, string> = {
          hard_contradiction: '❗ Contradiction',
          method_conflict: '⚠️ Method conflict',
          duplication: '🔁 Duplication',
          vague_rule: '🌫 Vague',
          stale_reference: '🏚 Stale',
          bloat_warning: '📏 Bloat',
        };
        const dateStr = new Date(run.run_at).toISOString().slice(0, 10);
        return (
          <div id="lint" style={{ background: '#fffbea', borderBottom: '1px solid #fcd34d' }}>
            <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }}
              onClick={() => setLintExpanded(!lintExpanded)}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🧹 Prompt Lint</span>
              <span style={{ fontSize: 12, color: '#92400e' }}>{dateStr}</span>
              <span style={{ fontSize: 12, color: '#92400e' }}>
                {allFindings.length} findings ({highCount} 🔴 high)
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                {lintExpanded ? '▾ collapse' : '▸ expand'}
              </span>
            </div>
            {lintExpanded && (
              <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Controls */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Run:</span>
                  <select value={lintRunIdx} onChange={e => setLintRunIdx(parseInt(e.target.value))}
                    style={{ border: '1px solid #fcd34d', borderRadius: 6, padding: '3px 6px', fontSize: 12, background: '#fff' }}>
                    {lintRuns.map((r, i) => {
                      const ds = new Date(r.run_at).toISOString().slice(0, 16).replace('T', ' ');
                      const totalCount = Object.values(r.stacks).reduce((s: number, x: any) => s + (x?.findings_json?.length || 0), 0);
                      return <option key={r.run_at} value={i}>{ds} ({totalCount} findings)</option>;
                    })}
                  </select>
                  <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>Stack:</span>
                  {(['all','AM','EM','JC'] as const).map(s => (
                    <button key={s} onClick={() => setLintStack(s)} style={{
                      padding: '3px 10px', borderRadius: 6, border: '1px solid #fcd34d', fontSize: 12,
                      background: lintStack === s ? '#1e3a5f' : '#fff', color: lintStack === s ? '#fff' : '#92400e',
                      cursor: 'pointer',
                    }}>{s === 'all' ? `All (${allFindings.length})` : `${s} (${(run.stacks[s]?.findings_json || []).length})`}</button>
                  ))}
                </div>

                {/* Per-stack summary chips */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#92400e' }}>
                  {filterStacks.map(s => {
                    const sum = run.stacks[s]?.summary_json || {};
                    const parts: string[] = [];
                    if (sum.hard_contradictions) parts.push(`${sum.hard_contradictions}❗`);
                    if (sum.method_conflicts) parts.push(`${sum.method_conflicts}⚠️`);
                    if (sum.duplications) parts.push(`${sum.duplications}🔁`);
                    if (sum.vague_rules) parts.push(`${sum.vague_rules}🌫`);
                    if (sum.stale_references) parts.push(`${sum.stale_references}🏚`);
                    if (sum.bloat_warnings) parts.push(`${sum.bloat_warnings}📏`);
                    return <span key={s} style={{ background: '#fef3c7', padding: '3px 8px', borderRadius: 6 }}>
                      <b>{s}</b> · {parts.join(' ') || '✅ clean'}
                    </span>;
                  })}
                </div>

                {/* Findings list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedFindings.length === 0 && (
                    <div style={{ fontSize: 13, color: '#16a34a', padding: 8 }}>✅ No findings.</div>
                  )}
                  {sortedFindings.map((f, i) => (
                    <details key={i} style={{
                      background: '#fff', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px',
                    }}>
                      <summary style={{ cursor: 'pointer', fontSize: 13, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14 }}>{sevEmoji(f.severity)}</span>
                        <span style={{ background: '#1e3a5f', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>{(f as any)._stack}</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>{catLabel[f.category] || f.category}</span>
                        <span style={{ flex: 1, color: '#1e293b' }}>{f.headline}</span>
                      </summary>
                      <div style={{ marginTop: 8, fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {f.source_a && <div><b>Source A:</b> <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>{f.source_a}</code></div>}
                        {f.source_b && <div><b>Source B:</b> <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>{f.source_b}</code></div>}
                        {f.fix && <div style={{ marginTop: 4, padding: 6, background: '#f0fdf4', borderRadius: 4, color: '#15803d' }}>→ <b>Fix:</b> {f.fix}</div>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {!loading && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT: questions + clusters + error rates — hidden on mobile when detail is open */}
          <div style={{
            width: isMobile ? '100%' : '45%',
            display: isMobile && (selected || opusOpen) ? 'none' : 'flex',
            overflowY: 'auto', background: '#f8fafc',
            borderRight: isMobile ? 'none' : '1px solid #e2e8f0',
            flexDirection: 'column',
          }}>

            {/* Questions section */}
            <div style={{ padding: '12px 16px 0' }}>
              <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                {(['flagged', 'all', 'mine'] as const).map(tab => (
                  <button key={tab} onClick={() => setQTab(tab)} style={{
                    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: qTab === tab ? '#1e3a5f' : 'transparent',
                    color: qTab === tab ? '#fff' : '#64748b',
                  }}>
                    {tab === 'flagged' ? `🔴 Flagged (${flagged.length})` : tab === 'all' ? `All (${allVisible.length})` : `📤 Mine (${myUploads.length})`}
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
              {threadGroups.map((group, gi) => {
                const cards = group.turns.map(q => {
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, marginBottom: 3, gap: 4 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.studentName} · {q.topic || 'no topic'} · {q.modelUsed?.replace('Claude Sonnet 4.6','Sonnet').replace('Claude Opus 4.6','Opus').replace('claude-sonnet-4-6','Sonnet')}</span>
                        <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                          {q.timeTaken ? <span title="response time" style={{ color: '#94a3b8' }}>{q.timeTaken.toFixed(1)}s</span> : null}
                          {(q.tokensIn || q.tokensOut) ? <span title={`${q.tokensIn || 0} in / ${q.tokensOut || 0} out · ${q.modelUsed || ''}`} style={{ fontFamily: 'monospace', color: '#0f766e', fontWeight: 600 }}>${costFor(q.tokensIn || 0, q.tokensOut || 0, q.modelUsed).toFixed(3)}</span> : null}
                          {q.status && q.status !== 'New' && statusBadge(q.status)}
                          {confBadge(q.confidence)}
                          {q.timestamp ? new Date(q.timestamp).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'}) : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        {q.imageUrl && <img src={q.imageUrl} alt="" style={{ width: isMobile ? 52 : 36, height: isMobile ? 52 : 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid #e2e8f0' }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {q.caption && <div style={{ fontSize: isMobile ? 14 : 13, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: isMobile ? 2 : 1, WebkitBoxOrient: 'vertical' as const }}>{q.caption}</div>}
                          {!q.caption && q.imageUrl && <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>📷 image question</div>}
                          {q.aiResponse && <div style={{ fontSize: isMobile ? 12 : 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>→ {q.aiResponse.slice(0, 100)}</div>}
                        </div>
                      </div>
                      {flagBadge(q)}
                    </div>
                  );
                });
                // Single-turn "conversations" render as a plain card (no thread chrome).
                if (group.turns.length < 2) return <div key={group.turns[0].id}>{cards}</div>;
                const label = String(group.chatId).startsWith('web')
                  ? 'Web chat'
                  : (group.turns[0].studentName && group.turns[0].studentName !== 'unknown' ? group.turns[0].studentName : `Chat ${String(group.chatId).slice(0, 8)}`);
                const ts = group.turns.map(t => t.timestamp).filter(Boolean);
                const range = ts.length ? `${new Date(ts[ts.length - 1]).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}–${new Date(ts[0]).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}` : '';
                return (
                  <div key={`thread-${gi}`} style={{ marginBottom: 8, border: '1px solid #dbe3ec', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#eef3f8', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                      <span>💬 {label} · {group.turns.length} turns</span>
                      <span style={{ color: '#94a3b8', fontWeight: 500 }}>{range}</span>
                    </div>
                    <div style={{ padding: '6px 8px 1px', background: '#f8fafc', borderLeft: '3px solid #cbd5e1' }}>{cards}</div>
                  </div>
                );
              })}

              {/* Suggested Rules from daily verification */}
              {pendingSugsError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>⚠️ Prompt rules endpoint unavailable — bot may still be deploying</span>
                  <button onClick={load} style={{ fontSize: 11, background: 'none', border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 8px', color: '#b91c1c', cursor: 'pointer' }}>Retry</button>
                </div>
              )}
              {pendingSugs.length > 0 && (() => {
                const allSelected = pendingSugs.length > 0 && pendingSugs.every(s => selectedSugKeys.has(s.key));
                const anySelected = selectedSugKeys.size > 0;
                const numSelected = selectedSugKeys.size;

                async function applyKeys(keys: string[]) {
                  setBulkLoading(true);
                  for (const key of keys) {
                    const s = pendingSugs.find(x => x.key === key);
                    if (!s) continue;
                    await fetch('/api/admin/cockpit/append-rule', {
                      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
                      body: JSON.stringify({ rule: s.suggestion, theme: 'daily-verification', sourceContext: JSON.stringify(s) }),
                    });
                    await fetch('/api/admin/cockpit/dismiss-suggestion', {
                      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
                      body: JSON.stringify({ key }),
                    });
                  }
                  setPendingSugs(prev => prev.filter(x => !keys.includes(x.key)));
                  setSelectedSugKeys(new Set());
                  setBulkLoading(false);
                }

                async function dismissKeys(keys: string[]) {
                  setBulkLoading(true);
                  for (const key of keys) {
                    await fetch('/api/admin/cockpit/dismiss-suggestion', {
                      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
                      body: JSON.stringify({ key }),
                    });
                  }
                  setPendingSugs(prev => prev.filter(x => !keys.includes(x.key)));
                  setSelectedSugKeys(new Set());
                  setBulkLoading(false);
                }

                return (
                  <div style={{ marginTop: 16 }}>
                    {/* Header + bulk actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                        <input type="checkbox" checked={allSelected} onChange={e => {
                          if (e.target.checked) setSelectedSugKeys(new Set(pendingSugs.map(s => s.key)));
                          else setSelectedSugKeys(new Set());
                        }} style={{ width: 14, height: 14 }} />
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </label>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#475569', flex: 1 }}>
                        💡 Suggested Rules ({pendingSugs.length})
                        {anySelected && <span style={{ fontWeight: 400, color: '#94a3b8' }}> · {numSelected} selected</span>}
                      </span>
                      {anySelected && (
                        <>
                          <button disabled={bulkLoading} onClick={() => applyKeys([...selectedSugKeys])}
                            style={{ fontSize: 12, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, opacity: bulkLoading ? 0.5 : 1 }}>
                            ✅ Apply {numSelected}
                          </button>
                          <button disabled={bulkLoading} onClick={() => dismissKeys([...selectedSugKeys])}
                            style={{ fontSize: 12, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#64748b', opacity: bulkLoading ? 0.5 : 1 }}>
                            Dismiss {numSelected}
                          </button>
                        </>
                      )}
                      {!anySelected && (
                        <>
                          <button disabled={bulkLoading} onClick={() => { if (confirm(`Apply all ${pendingSugs.length} rules?`)) applyKeys(pendingSugs.map(s => s.key)); }}
                            style={{ fontSize: 12, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, opacity: bulkLoading ? 0.5 : 1 }}>
                            ✅ Apply all
                          </button>
                          <button disabled={bulkLoading} onClick={() => { if (confirm(`Dismiss all ${pendingSugs.length} rules?`)) dismissKeys(pendingSugs.map(s => s.key)); }}
                            style={{ fontSize: 12, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#64748b', opacity: bulkLoading ? 0.5 : 1 }}>
                            Dismiss all
                          </button>
                        </>
                      )}
                    </div>

                    {/* Individual cards */}
                    {pendingSugs.map(s => {
                      const isSelected = selectedSugKeys.has(s.key);
                      return (
                        <div key={s.key} style={{ background: isSelected ? '#fef9c3' : '#fffbeb', border: `1px solid ${isSelected ? '#f59e0b' : '#fcd34d'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                            <input type="checkbox" checked={isSelected}
                              onChange={e => setSelectedSugKeys(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(s.key) : next.delete(s.key);
                                return next;
                              })}
                              style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0, cursor: 'pointer' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: '#92400e', marginBottom: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                {s.basedOn != null && <span>Based on {s.basedOn} flagged answer{s.basedOn !== 1 ? 's' : ''}</span>}
                                <span>· {s.date}</span>
                                {s.model && <span style={{ background: '#fef9c3', borderRadius: 4, padding: '1px 5px' }}>{s.model.replace('Claude Sonnet 4.6','Sonnet').replace('Claude Opus 4.6','Opus')}</span>}
                                {s.level && s.level !== 'unknown' && <span style={{ background: '#f0fdf4', borderRadius: 4, padding: '1px 5px', color: '#15803d' }}>{s.level}</span>}
                              </div>
                              {s.issue && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 12, color: '#dc2626', lineHeight: 1.5 }}>
                                  ⚠ {s.issue}
                                </div>
                              )}
                              {s.question && s.question !== '(image question)' && (
                                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 12, color: '#475569', lineHeight: 1.5, fontStyle: 'italic' }}>
                                  📝 Q: {s.question.slice(0, 200)}{s.question.length > 200 ? '…' : ''}
                                </div>
                              )}
                              {s.question === '(image question)' && (
                                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 12, color: '#94a3b8' }}>
                                  📷 Image question — check flagged tab for {s.date}
                                </div>
                              )}
                              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#1e293b', marginBottom: 8, fontStyle: 'italic' }}>"{s.suggestion}"</div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button disabled={bulkLoading} onClick={() => applyKeys([s.key])}
                                  style={{ fontSize: 12, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, opacity: bulkLoading ? 0.5 : 1 }}>
                                  ✅ Apply
                                </button>
                                <button onClick={() => selectCluster({ theme: 'Suggested rule', proposed_rule: s.suggestion, confidence: 'medium', affects_topics: [], suggestion_ids: [] })}
                                  style={{ fontSize: 12, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>
                                  ✦ Discuss
                                </button>
                                <button disabled={bulkLoading} onClick={() => dismissKeys([s.key])}
                                  style={{ fontSize: 12, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#64748b', opacity: bulkLoading ? 0.5 : 1 }}>
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

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

          {/* RIGHT: Q&A detail + Opus chat — full width on mobile when open */}
          <div style={{
            flex: 1, display: isMobile && !selected && !opusOpen ? 'none' : 'flex',
            flexDirection: 'column', background: '#fff', overflow: 'hidden',
            width: isMobile ? '100%' : undefined,
          }}>
            {/* Mobile back button */}
            {isMobile && (selected || opusOpen) && (
              <button onClick={() => { setSelected(null); setOpusOpen(false); setChatMessages([]); }}
                style={{ padding: '10px 16px', background: '#f8fafc', border: 'none', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 14, color: '#1e3a5f', fontWeight: 600, cursor: 'pointer' }}>
                ← Back to questions
              </button>
            )}

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
                  {selected.status && selected.status !== 'New' && statusBadge(selected.status)}
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 11 }}>
                    {selected.timestamp ? new Date(selected.timestamp).toLocaleString('en-SG', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
                  </span>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
                </div>

                {/* Scrollable detail body */}
                <div style={{ flex: opusOpen ? '0 0 auto' : 1, overflowY: 'auto', maxHeight: opusOpen ? '35%' : undefined, padding: '14px 16px', borderBottom: opusOpen ? '1px solid #e2e8f0' : 'none' }}>

                  {/* Flag banner */}
                  {selected.flagReason && (
                    <div style={{
                      background: selected.flagReason === 'negative_feedback' ? '#fef2f2' : '#fef3c7',
                      border: `1px solid ${selected.flagReason === 'negative_feedback' ? '#fca5a5' : '#fcd34d'}`,
                      borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13
                    }}>
                      {selected.flagReason === 'negative_feedback' && '🚫 Student explicitly said the answer was wrong'}
                      {selected.flagReason === 'admin_forced' && '🔧 Admin manually intervened on this response'}
                      {selected.flagReason === 'low_confidence' && '⚠ Bot flagged this response as low confidence'}
                      {selected.flagReason === 'confusion_followup' && <>💬 Student followed up with <strong>"{selected.confusedFollowUp}"</strong> — answer may have been unclear or wrong</>}
                      {selected.flagReason === 'multiple' && <>⚠ Multiple signals:{selected.status === 'negative_feedback' ? ' student said wrong,' : ''}{(selected.confidence||'').toLowerCase() === 'low' ? ' low confidence,' : ''}{selected.confusedFollowUp ? ` follow-up: "${selected.confusedFollowUp}"` : ''}</>}
                    </div>
                  )}

                  {/* Question */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Question
                      {selected.imageUrl && (
                        <button onClick={() => setImgRotation(r => (r + 90) % 360)}
                          title="Rotate image"
                          style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 7px', cursor: 'pointer', color: '#475569', fontWeight: 500 }}>
                          ↻ Rotate
                        </button>
                      )}
                    </div>
                    {selected.imageUrl && (
                      <div style={{ display: 'flex', justifyContent: 'center', background: '#f8fafc', borderRadius: 8, marginBottom: 6, border: '1px solid #e2e8f0', overflow: 'hidden', minHeight: 60 }}>
                        <img
                          src={selected.imageUrl}
                          alt="Student question"
                          onError={e => { (e.target as HTMLImageElement).style.display='none'; const p=(e.target as HTMLImageElement).parentElement; if(p){p.innerHTML='<div style="padding:16px;color:#94a3b8;font-size:13px;">⚠️ Image URL broken or expired — was stored at '+selected.imageUrl+'</div>';} }}
                          style={{
                            maxWidth: imgRotation % 180 === 0 ? '100%' : 320,
                            maxHeight: imgRotation % 180 === 0 ? 320 : '100%',
                            objectFit: 'contain',
                            transform: `rotate(${imgRotation}deg)`,
                            transition: 'transform 0.25s ease',
                            display: 'block',
                          }}
                        />
                      </div>
                    )}
                    {!selected.imageUrl && !selected.caption && (
                      <div style={{ background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', marginBottom: 6, fontSize: 12, color: '#92400e' }}>
                        📷 Image question — image was not stored to Blob (web images now stored from bot v{new Date().getFullYear()})
                      </div>
                    )}
                    {selected.caption && (() => {
                      // Split student's actual message from bot-injected context (SCOPING INSTRUCTION etc.)
                      const scopingIdx = selected.caption.indexOf('\n\nSCOPING INSTRUCTION');
                      const inlineIdx  = selected.caption.indexOf(' SCOPING INSTRUCTION');
                      const splitIdx   = scopingIdx !== -1 ? scopingIdx : inlineIdx !== -1 ? inlineIdx : -1;
                      const studentText   = splitIdx !== -1 ? selected.caption.slice(0, splitIdx).trim() : selected.caption;
                      const internalCtx   = splitIdx !== -1 ? selected.caption.slice(splitIdx).trim() : '';
                      return (
                        <div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                            {selected.imageUrl
                              ? '📝 OCR-extracted text (what the bot reads from the image — student just sent the photo)'
                              : '📝 Student\'s typed question'}
                          </div>
                          {/* What the student actually sent */}
                          <div style={{ fontSize: 13, lineHeight: 1.6, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: internalCtx ? 6 : 0 }}>
                            <WebMathRenderer text={studentText} />
                          </div>
                          {/* Bot-injected context — dimmed, not visible to student */}
                          {internalCtx && (
                            <div style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', borderRadius: 8, padding: '7px 12px', border: '1px dashed #cbd5e1' }}>
                              <span style={{ fontWeight: 700, color: '#94a3b8' }}>🔒 Internal context (not seen by student):</span>
                              <div style={{ marginTop: 3, fontStyle: 'italic' }}>{internalCtx}</div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {!selected.caption && !selected.imageUrl && (
                      <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>(no question recorded)</div>
                    )}
                  </div>

                  {/* Bot answer — with view toggle */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Bot answer</div>
                    <ResponseViewer aiResponse={selected.aiResponse || ''} responseView={responseView} setResponseView={setResponseView} auth={auth} />
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

                    <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 16 }}>
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

                    <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, flexShrink: 0 }}>
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
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>✦ Discuss with Opus</span>
                  <button onClick={() => { setOpusOpen(false); setChatMessages([]); }}
                    style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                </div>
                <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 16 }}>
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
                <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, flexShrink: 0 }}>
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

// ─── ResponseViewer — module-level so it never remounts on parent re-render ──
function ResponseViewer({ aiResponse, responseView, setResponseView, auth }: {
  aiResponse: string;
  responseView: 'raw' | 'telegram' | 'web';
  setResponseView: (v: 'raw' | 'telegram' | 'web') => void;
  auth: Record<string, string>;
}) {
  const [telegramText, setTelegramText] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const lastFetchedResponse = useRef('');

  // Reset cached text whenever aiResponse changes (different question selected)
  useEffect(() => {
    setTelegramText(null);
    lastFetchedResponse.current = '';
  }, [aiResponse]);

  useEffect(() => {
    if (responseView !== 'telegram' || !aiResponse) return;
    if (lastFetchedResponse.current === aiResponse) return; // already fetched for this response
    lastFetchedResponse.current = aiResponse;
    setTelegramLoading(true);
    fetch('/api/admin/cockpit/format-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ text: aiResponse }),
    }).then(r => r.json()).then(d => {
      setTelegramText(d.formatted ?? aiResponse);
    }).catch(() => setTelegramText(toTelegramText(aiResponse)))
      .finally(() => setTelegramLoading(false));
  }, [responseView, aiResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 8, border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
        {(['telegram','web','raw'] as const).map(v => (
          <button key={v} onClick={() => setResponseView(v)} style={{
            padding: '4px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: responseView === v ? '#1e3a5f' : 'transparent',
            color: responseView === v ? '#fff' : '#64748b',
          }}>
            {v === 'telegram' ? '📱 Telegram' : v === 'web' ? '🌐 Web' : '📄 Raw'}
          </button>
        ))}
      </div>
      {responseView === 'telegram' && (
        <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', maxHeight: 260, overflowY: 'auto', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>As student sees it in Telegram</div>
          {telegramLoading ? <span style={{ color: '#94a3b8' }}>Rendering…</span> : (telegramText ?? '')}
        </div>
      )}
      {responseView === 'web' && (
        <div style={{ fontSize: 13, lineHeight: 1.7, background: '#eff6ff', borderRadius: 8, padding: '10px 12px', maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>As student sees it on web (KaTeX)</div>
          <WebMathRenderer text={aiResponse} />
        </div>
      )}
      {responseView === 'raw' && (
        <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: '#f8fafc', borderRadius: 8, padding: '10px 12px', maxHeight: 260, overflowY: 'auto', fontFamily: 'monospace', color: '#475569' }}>
          {aiResponse || '(no response recorded)'}
        </div>
      )}
    </div>
  );
}
