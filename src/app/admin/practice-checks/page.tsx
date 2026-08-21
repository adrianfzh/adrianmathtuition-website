'use client';

// /admin/practice-checks — spot-check the portal practice grader.
//
// Every graded practice attempt, newest first: who, which question, what the
// grader said. Opening a row replays exactly what the student saw — their
// working with per-line ✓/✗, the comments, the part breakdown. Two verdicts:
//   ✓ Agree      — grade looks right, drops off the unchecked pile.
//   ✗ Disagree   — record Adrian's score + why. Disagreements are exportable
//                  as draft golden-set items (📋 button) that paste straight
//                  into scripts/marking-golden-set.json, so every miss Adrian
//                  catches becomes a permanent calibration eval case.
// ⚠ rows are parseRetried grades — the model needed a JSON retry, treated as
// lower confidence (the same signal that fires the Telegram spot-check alert).

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

const REMARK = [remarkMath, remarkGfm];
const REHYPE = [rehypeRaw, rehypeKatex];

// Same rule as the student's practice page: markdown/KaTeX only kicks in when
// the string carries $...$ math, so plain typed lines are never mangled.
function MathText({ text }: { text: string }) {
  if (!text.includes('$')) return <>{text}</>;
  return (
    <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}
      components={{ p: ({ children }) => <>{children}</> }}>
      {text}
    </ReactMarkdown>
  );
}

type LineComment = { line: number; ok: boolean; comment: string; fix?: string; tag?: string };
type Marking = {
  lines?: string[];
  lineComments?: LineComment[];
  partBreakdown?: { label: string; awarded: number; outOf: number; comment: string }[];
  strengths?: string[];
  nextSteps?: string[];
};
type SpotCheck = { agree: boolean; adrianScore?: number; reasoning?: string; mustMention?: string[]; at: string };
type Attempt = {
  id: number;
  attemptedAt: string;
  studentName: string;
  questionText: string;
  topics: string[];
  verdict: string | null;
  score: number | null;
  outOf: number | null;
  source: string;
  parseRetried: boolean;
  marking: Marking;
  spotCheckedAt: string | null;
  spotCheck: SpotCheck | null;
};

const C = { border: '#e5e7eb', muted: '#6b7280', faint: '#9ca3af', ink: '#111827', link: '#2563eb', danger: '#b91c1c' };

function scoreColour(score: number | null, outOf: number | null) {
  if (score === null || !outOf) return C.muted;
  const pct = (score / outOf) * 100;
  if (pct >= 80) return '#15803d';
  if (pct >= 50) return '#a16207';
  return '#b91c1c';
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function PracticeChecksPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [stats, setStats] = useState<{ total: number; unchecked: number; flagged: number; disagreed: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [uncheckedOnly, setUncheckedOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // The disagree form, one attempt at a time.
  const [disagreeing, setDisagreeing] = useState<number | null>(null);
  const [dScore, setDScore] = useState('');
  const [dReason, setDReason] = useState('');
  const [dMention, setDMention] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/practice-attempts');
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || 'Failed to load'); return; }
      setAttempts(d.attempts || []);
      setStats(d.stats || null);
      setError('');
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      if (await loginAdminSession(pw)) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; spotCheck?: SpotCheck }> {
    const r = await fetch('/api/admin/practice-attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok || d.error) return { ok: false, error: d.error || 'Request failed' };
    return { ok: true, spotCheck: d.spotCheck };
  }

  async function agree(id: number) {
    const before = attempts;
    const now = new Date().toISOString();
    setAttempts(prev => prev.map(a => (a.id === id ? { ...a, spotCheckedAt: now, spotCheck: { agree: true, at: now } } : a)));
    const res = await post({ attemptId: id, agree: true });
    if (!res.ok) { setAttempts(before); setToast(res.error || 'Could not save'); return; }
    setStats(s => (s ? { ...s, unchecked: Math.max(0, s.unchecked - 1) } : s));
    setToast('✓ Agreed — grade confirmed');
  }

  async function uncheck(id: number) {
    const before = attempts;
    const wasDisagree = attempts.find(a => a.id === id)?.spotCheck?.agree === false;
    setAttempts(prev => prev.map(a => (a.id === id ? { ...a, spotCheckedAt: null, spotCheck: null } : a)));
    const res = await post({ attemptId: id, uncheck: true });
    if (!res.ok) { setAttempts(before); setToast(res.error || 'Could not save'); return; }
    setStats(s => (s ? { ...s, unchecked: s.unchecked + 1, disagreed: Math.max(0, s.disagreed - (wasDisagree ? 1 : 0)) } : s));
    setToast('Moved back to unchecked');
  }

  async function submitDisagree(a: Attempt) {
    const score = Number(dScore);
    if (!Number.isFinite(score)) { setToast('Enter your score'); return; }
    if (!dReason.trim()) { setToast('Say why — the reasoning becomes the eval note'); return; }
    setSaving(true);
    const mustMention = dMention.split(',').map(s => s.trim()).filter(Boolean);
    const res = await post({ attemptId: a.id, agree: false, adrianScore: score, reasoning: dReason.trim(), mustMention });
    setSaving(false);
    if (!res.ok) { setToast(res.error || 'Could not save'); return; }
    const now = new Date().toISOString();
    setAttempts(prev => prev.map(x => (x.id === a.id
      ? { ...x, spotCheckedAt: now, spotCheck: res.spotCheck || { agree: false, adrianScore: score, reasoning: dReason.trim(), mustMention, at: now } }
      : x)));
    setStats(s => (s ? { ...s, unchecked: Math.max(0, s.unchecked - 1), disagreed: s.disagreed + 1 } : s));
    setDisagreeing(null);
    setDScore(''); setDReason(''); setDMention('');
    setToast('✗ Disagreement recorded — export it with 📋 when ready');
  }

  // Pull every disagreement as golden-set drafts and put them on the clipboard,
  // ready to paste into scripts/marking-golden-set.json "items".
  async function copyGolden() {
    try {
      const r = await fetch('/api/admin/practice-attempts?export=golden&days=3650&limit=300');
      const d = await r.json();
      if (!r.ok || d.error) { setToast(d.error || 'Export failed'); return; }
      if (!d.items?.length) { setToast('No disagreements to export yet'); return; }
      const json = d.items.map((it: unknown) => JSON.stringify(it, null, 1)).join(',\n');
      await navigator.clipboard.writeText(json);
      setToast(`📋 ${d.items.length} golden-set item${d.items.length === 1 ? '' : 's'} copied`);
    } catch { setToast('Could not copy'); }
  }

  const visible = attempts.filter(a => {
    if (flaggedOnly && !a.parseRetried) return false;
    if (uncheckedOnly && a.spotCheckedAt) return false;
    return true;
  });

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <form onSubmit={e => { e.preventDefault(); verify(password); }}
          style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🔎 Practice spot-check</h1>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Admin password" autoFocus
            style={{ padding: '12px 14px', fontSize: 16, border: `1px solid ${C.border}`, borderRadius: 10 }} />
          {authError && <div style={{ color: C.danger, fontSize: 13 }}>{authError}</div>}
          <button type="submit" disabled={authLoading}
            style={{ padding: '12px 14px', fontSize: 16, fontWeight: 600, borderRadius: 10, border: 'none', background: C.ink, color: '#fff' }}>
            {authLoading ? '…' : 'Enter'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 860, margin: '0 auto', padding: '16px 14px 80px', color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🔎 Practice spot-check</h1>
        <a href="/admin" style={{ fontSize: 13, color: C.link, textDecoration: 'none' }}>← Admin</a>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 14px' }}>
        {loading ? 'Loading…' : stats
          ? <>
              {stats.total} attempt{stats.total === 1 ? '' : 's'} (90 days)
              {stats.unchecked > 0 && <> · <b style={{ color: '#a16207' }}>{stats.unchecked} unchecked</b></>}
              {stats.flagged > 0 && <> · <b style={{ color: C.danger }}>⚠ {stats.flagged} low-confidence</b></>}
              {stats.disagreed > 0 && <> · <b style={{ color: '#7c3aed' }}>{stats.disagreed} disagreed</b> — each one is a new calibration case</>}
            </>
          : ''}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setUncheckedOnly(v => !v)}
          style={{
            padding: '9px 13px', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${uncheckedOnly ? C.ink : C.border}`,
            background: uncheckedOnly ? C.ink : '#fff', color: uncheckedOnly ? '#fff' : '#374151',
          }}>
          Unchecked
        </button>
        <button onClick={() => setFlaggedOnly(v => !v)}
          style={{
            padding: '9px 13px', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${flaggedOnly ? C.danger : C.border}`,
            background: flaggedOnly ? C.danger : '#fff', color: flaggedOnly ? '#fff' : '#374151',
          }}>
          ⚠ Low-confidence
        </button>
        {(stats?.disagreed ?? 0) > 0 && (
          <button onClick={copyGolden}
            title="Copy every disagreement as golden-set JSON, ready to paste into scripts/marking-golden-set.json"
            style={{ padding: '9px 13px', fontSize: 14, fontWeight: 600, borderRadius: 999, cursor: 'pointer', border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed' }}>
            📋 Copy golden-set JSON
          </button>
        )}
        {(flaggedOnly || uncheckedOnly) && (
          <button onClick={() => { setFlaggedOnly(false); setUncheckedOnly(false); }}
            style={{ padding: '9px 4px', fontSize: 13, border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: C.danger, fontSize: 14, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {visible.map(a => {
        const open = expanded.has(a.id);
        const commentsByLine = new Map((a.marking.lineComments || []).map(c => [c.line, c]));
        const lines = a.marking.lines || [];
        return (
          <div key={a.id} style={{ border: `1px solid ${a.parseRetried && !a.spotCheckedAt ? '#fecaca' : C.border}`, borderRadius: 14, padding: 14, marginBottom: 10, background: '#fff' }}>
            {/* Header row — tap anywhere on it to open the replay */}
            <div onClick={() => setExpanded(s => { const n = new Set(s); if (n.has(a.id)) { n.delete(a.id); } else { n.add(a.id); } return n; })}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {a.studentName}
                  <span style={{ fontWeight: 400, color: C.muted }}> · {a.topics[0] || '—'}</span>
                  {a.parseRetried && <span title="The model needed a JSON retry — lower-confidence grade" style={{ color: C.danger }}> ⚠</span>}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {fmtWhen(a.attemptedAt)} · {a.source === 'photo' ? '📷 photo' : '⌨️ typed'} · {a.verdict}
                  {a.spotCheck?.agree === true && <span style={{ color: '#15803d', fontWeight: 700 }}> · ✓ agreed</span>}
                  {a.spotCheck?.agree === false && (
                    <span style={{ color: '#7c3aed', fontWeight: 700 }}> · ✗ Adrian: {a.spotCheck.adrianScore}/{a.outOf}</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: scoreColour(a.score, a.outOf), lineHeight: 1.1 }}>
                  {a.score !== null && a.outOf ? `${a.score}/${a.outOf}` : '—'}
                </div>
                <div style={{ fontSize: 12, color: C.faint }}>{open ? '▲ close' : '▼ open'}</div>
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 12 }}>
                {/* The question as the student saw it */}
                <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, marginBottom: 10 }}>
                  <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{a.questionText}</ReactMarkdown>
                </div>

                {/* Their working, per-line verdicts — the student's exact panel */}
                <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, marginBottom: 10 }}>
                  {lines.map((l, i) => {
                    const c = commentsByLine.get(i + 1);
                    if (!l.trim() && !c) return null;
                    return (
                      <div key={i} style={{ padding: '7px 10px', fontSize: 14, borderTop: i ? '1px solid #f8fafc' : 'none', background: c && !c.ok ? '#fff1f2' : undefined }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ color: '#cbd5e1', fontFamily: 'ui-monospace, monospace', fontSize: 12, width: 20, flexShrink: 0, paddingTop: 2 }}>{i + 1}</span>
                          <span style={{ flex: 1, whiteSpace: 'pre-wrap', fontFamily: l.includes('$') ? undefined : 'ui-monospace, monospace' }}><MathText text={l} /></span>
                          {c && <span>{c.ok ? '✓' : '✗'}</span>}
                        </div>
                        {c && (
                          <div style={{ marginLeft: 28, marginTop: 3, fontSize: 13, color: '#475569' }}>
                            <MathText text={c.comment} />
                            {c.fix && <div style={{ color: '#047857', marginTop: 2 }}>→ <MathText text={c.fix} /></div>}
                            {c.tag && <span style={{ display: 'inline-block', marginTop: 2, fontSize: 11, background: '#f1f5f9', borderRadius: 999, padding: '1px 8px', color: C.muted }}>{c.tag}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {(a.marking.partBreakdown?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {a.marking.partBreakdown!.map(p => (
                      <span key={p.label} title={p.comment.replace(/\$/g, '')}
                        style={{ fontSize: 12, background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 10px', color: '#475569' }}>
                        ({p.label}) {p.awarded}/{p.outOf}
                      </span>
                    ))}
                  </div>
                )}
                {(a.marking.strengths?.length ?? 0) > 0 && (
                  <p style={{ fontSize: 13, color: '#047857', margin: '0 0 4px' }}>💪 <MathText text={a.marking.strengths!.join(' · ')} /></p>
                )}
                {(a.marking.nextSteps?.length ?? 0) > 0 && (
                  <ul style={{ fontSize: 13, color: '#334155', margin: '0 0 8px', paddingLeft: 20 }}>
                    {a.marking.nextSteps!.map((s, i) => <li key={i}><MathText text={s} /></li>)}
                  </ul>
                )}

                {/* Existing review, or the verdict buttons */}
                {a.spotCheck?.agree === false && disagreeing !== a.id && (
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: '#5b21b6', marginBottom: 8 }}>
                    <b>Adrian: {a.spotCheck.adrianScore}/{a.outOf}</b> — {a.spotCheck.reasoning}
                    {(a.spotCheck.mustMention?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 3, fontSize: 12 }}>must mention: {a.spotCheck.mustMention!.join(', ')}</div>
                    )}
                  </div>
                )}

                {disagreeing === a.id ? (
                  <div style={{ border: '1px solid #ddd6fe', borderRadius: 10, padding: 12, background: '#faf9ff' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>My score:</label>
                      <input type="number" inputMode="numeric" value={dScore} onChange={e => setDScore(e.target.value)}
                        min={0} max={a.outOf ?? undefined} autoFocus
                        style={{ width: 64, padding: '7px 9px', fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 8 }} />
                      <span style={{ fontSize: 13, color: C.muted }}>/ {a.outOf}</span>
                    </div>
                    <textarea value={dReason} onChange={e => setDReason(e.target.value)}
                      placeholder="Why the grade is wrong — this becomes the eval case's note"
                      rows={2}
                      style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <input value={dMention} onChange={e => setDMention(e.target.value)}
                      placeholder="Must-mention keywords, comma-separated (optional) — e.g. reject, ±"
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10, boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => submitDisagree(a)} disabled={saving}
                        style={{ padding: '8px 14px', fontSize: 14, fontWeight: 700, borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer' }}>
                        {saving ? 'Saving…' : 'Save disagreement'}
                      </button>
                      <button onClick={() => setDisagreeing(null)}
                        style={{ padding: '8px 10px', fontSize: 13, border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {!a.spotCheckedAt ? (
                      <>
                        <button onClick={() => agree(a.id)}
                          style={{ padding: '7px 14px', fontSize: 14, fontWeight: 700, borderRadius: 999, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}>
                          ✓ Agree
                        </button>
                        <button onClick={() => { setDisagreeing(a.id); setDScore(''); setDReason(''); setDMention(''); }}
                          style={{ padding: '7px 14px', fontSize: 14, fontWeight: 700, borderRadius: 999, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer' }}>
                          ✗ I disagree
                        </button>
                      </>
                    ) : (
                      <button onClick={() => uncheck(a.id)}
                        style={{ padding: '5px 10px', fontSize: 12, borderRadius: 999, border: `1px solid ${C.border}`, background: '#fff', color: C.muted, cursor: 'pointer' }}>
                        undo review
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && visible.length === 0 && !error && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: C.faint, fontSize: 15 }}>
          {attempts.length === 0 ? 'No graded practice attempts yet.' : 'Nothing matches that filter.'}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', left: 14, right: 14, bottom: 18, margin: '0 auto', maxWidth: 420, padding: '11px 14px', background: C.ink, color: '#fff', borderRadius: 12, fontSize: 14, textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
