'use client';

import { useState, useEffect } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

interface LevelRow { level: string; subgroupsTotal: number; subgroupsCovered: number; coveragePct: number; }
interface FlaggedRow { id: string; topic: string; subgroupId: number; flaggedCount: number; excluded: boolean; preview: string; reasons: string[]; }
interface GapRow { topic: string; count: number; names: string[]; }
interface BankHealth {
  snapshot: { qbQuestions: number; pqTotal: number; pqVerified: number; pqExcluded: number; avgHitCount: number };
  levels: LevelRow[];
  quality: { flagged: FlaggedRow[] };
  focus: { level: string; gaps: GapRow[] };
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4df', borderRadius: 12, padding: '14px 16px', minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#16241a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const color = pct >= 60 ? '#47993d' : pct >= 25 ? '#c79a2e' : '#c0503a';
  return (
    <div style={{ background: '#eee', borderRadius: 6, height: 8, width: 120, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', background: color }} />
    </div>
  );
}

export default function BankHealthPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [data, setData] = useState<BankHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/bank-health');
      const d = await r.json();
      if (d.error) setApiError(d.error); else { setData(d); setApiError(''); }
    } catch { setApiError('Connection error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (authed) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authed]);
  useEffect(() => {
    ensureAdminSession().then(ok => { if (ok) setAuthed(true); });
  }, []);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(pw);
      if (ok) setAuthed(true);
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) { e.preventDefault(); setAuthError(''); await verify(password); }

  if (!authed) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', padding: 24, fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>🩺 Bank Health</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password"
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15 }} autoFocus />
          <button type="submit" disabled={authLoading}
            style={{ padding: '10px 12px', borderRadius: 8, border: 'none', background: '#16241a', color: '#fff', fontSize: 15, fontWeight: 600 }}>
            {authLoading ? 'Checking…' : 'Enter'}
          </button>
          {authError && <div style={{ color: '#c0392b', fontSize: 13 }}>{authError}</div>}
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 64px', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, color: '#16241a', margin: 0 }}>🩺 Bank Health</h1>
        <button onClick={load} disabled={loading}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>
      <p style={{ fontSize: 13, color: '#777', marginTop: 0, marginBottom: 20 }}>
        Coverage + quality of the practice-question bank. The flywheel’s job: grow verified coverage across sub-skills.
      </p>

      {apiError && <div style={{ color: '#c0392b', fontSize: 13, marginBottom: 16 }}>{apiError}</div>}
      {!data && !apiError && <div style={{ color: '#999' }}>Loading…</div>}

      {data && (
        <>
          {/* Headline stats */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <Stat label="Seed bank (curated Qs)" value={data.snapshot.qbQuestions.toLocaleString()} sub="the raw material to generate from" />
            <Stat label="Practice pool" value={data.snapshot.pqTotal} sub={`${data.snapshot.pqVerified} verified · ${data.snapshot.pqExcluded} flag-excluded`} />
            <Stat label="Avg reuse (hit count)" value={data.snapshot.avgHitCount} sub="how often pool Qs are served" />
          </div>

          {/* Coverage by level */}
          <h2 style={{ fontSize: 16, color: '#16241a', marginBottom: 10 }}>Sub-skill coverage by level</h2>
          <div style={{ background: '#fff', border: '1px solid #e4e4df', borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
            {data.levels.map((l, i) => (
              <div key={l.level} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? '1px solid #f0f0ec' : 'none' }}>
                <span style={{ fontWeight: 600, width: 40, color: '#16241a' }}>{l.level}</span>
                <Bar pct={l.coveragePct} />
                <span style={{ fontSize: 13, color: '#555' }}>{l.subgroupsCovered}/{l.subgroupsTotal} sub-skills</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: l.coveragePct >= 60 ? '#47993d' : l.coveragePct >= 25 ? '#c79a2e' : '#c0503a' }}>{l.coveragePct}%</span>
              </div>
            ))}
          </div>

          {/* Flag review queue */}
          <h2 style={{ fontSize: 16, color: '#16241a', marginBottom: 10 }}>
            Flag review queue {data.quality.flagged.length ? `(${data.quality.flagged.length})` : ''}
          </h2>
          {data.quality.flagged.length === 0 ? (
            <div style={{ fontSize: 13, color: '#999', marginBottom: 28 }}>No flagged practice questions. 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {data.quality.flagged.map(f => (
                <div key={f.id} style={{ background: '#fff', border: '1px solid #e4e4df', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{f.topic}</span>
                    <span style={{ background: f.excluded ? '#f7e0dc' : '#faf1e3', color: f.excluded ? '#c0503a' : '#a9772a', fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>
                      {f.flaggedCount} flag{f.flaggedCount === 1 ? '' : 's'}{f.excluded ? ' · excluded' : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#333', lineHeight: 1.45 }}>{f.preview}…</div>
                  {f.reasons.length > 0 && (
                    <div style={{ fontSize: 12, color: '#a9772a', marginTop: 6 }}>Reasons: {f.reasons.join(' · ')}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Coverage gaps */}
          <h2 style={{ fontSize: 16, color: '#16241a', marginBottom: 4 }}>{data.focus.level} coverage gaps</h2>
          <p style={{ fontSize: 12.5, color: '#999', marginTop: 0, marginBottom: 12 }}>
            Sub-skills with no verified practice question yet — the generation backlog, grouped by topic.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.focus.gaps.map(g => (
              <div key={g.topic} style={{ background: '#fff', border: '1px solid #e4e4df', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => setExpanded(expanded === g.topic ? null : g.topic)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 14, color: '#16241a', fontWeight: 500 }}>{g.topic}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: '#c0503a', fontWeight: 600 }}>{g.count} missing</span>
                  <span style={{ color: '#bbb', fontSize: 12 }}>{expanded === g.topic ? '▲' : '▼'}</span>
                </button>
                {expanded === g.topic && (
                  <div style={{ padding: '4px 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {g.names.map(n => (
                      <span key={n} style={{ background: '#f4f4f1', color: '#555', fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{n}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
