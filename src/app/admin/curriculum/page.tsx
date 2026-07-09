'use client';
// /admin/curriculum — the curriculum-intelligence "strategy layer" editor.
// A per-subject×topic pedagogy model with two views:
//   • List/edit — inline-editable rows in default_order (autosave)
//   • Graph     — the prerequisite DAG laid out in topological layers
// Cookie/session admin auth. Data via /api/admin/topic-meta.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import CurriculumGraph from './CurriculumGraph';
import {
  CURRICULUM_SUBJECTS, MUST_MASTER_KINDS, MUST_MASTER_ICON,
  type TopicMeta, type MustMasterItem, type MustMasterKind, type Emphasis,
} from '@/lib/topic-meta';

const EMPHASIS_OPTS: { key: Emphasis; label: string }[] = [
  { key: 'mcq', label: 'MCQ' }, { key: 'structured', label: 'Structured' }, { key: 'both', label: 'Both' },
];

type SaveState = 'saving' | 'saved' | 'error';

export default function CurriculumPage() {
  // ── auth ──
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setAuthError(''); setAuthLoading(true);
    const ok = await loginAdminSession(password); setAuthLoading(false);
    if (ok) setAuthed(true); else setAuthError('Incorrect password');
  }

  // ── data ──
  const [subject, setSubject] = useState('BIO');
  const [rows, setRows] = useState<TopicMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [focusTopic, setFocusTopic] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [dragTopic, setDragTopic] = useState<string | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg }); setTimeout(() => setToast(null), 3000);
  }

  const fetchRows = useCallback(async (subj: string) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/topic-meta?subject=${encodeURIComponent(subj)}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const d = await res.json();
      setRows((d.rows || []) as TopicMeta[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) fetchRows(subject); }, [authed, subject, fetchRows]);

  // POST a patch for one topic. `flash` keys the per-row save indicator.
  const postPatch = useCallback(async (topic: string, patch: Partial<TopicMeta>) => {
    setSaveState(s => ({ ...s, [topic]: 'saving' }));
    try {
      const res = await fetch('/api/admin/topic-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, topic, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const d = await res.json();
      // Reconcile with the server-normalised row.
      setRows(rs => rs.map(r => (r.topic === topic ? { ...r, ...(d.row as TopicMeta) } : r)));
      setSaveState(s => ({ ...s, [topic]: 'saved' }));
      setTimeout(() => setSaveState(s => { const n = { ...s }; if (n[topic] === 'saved') delete n[topic]; return n; }), 1400);
    } catch (e) {
      setSaveState(s => ({ ...s, [topic]: 'error' }));
      showToast('err', e instanceof Error ? e.message : 'Save failed');
    }
  }, [subject]);

  // Optimistic local update + debounced save.
  const edit = useCallback((topic: string, patch: Partial<TopicMeta>, debounce = 0) => {
    setRows(rs => rs.map(r => (r.topic === topic ? { ...r, ...patch } : r)));
    const key = `${topic}:${Object.keys(patch).join(',')}`;
    if (timers.current[key]) clearTimeout(timers.current[key]);
    if (debounce > 0) {
      timers.current[key] = setTimeout(() => postPatch(topic, patch), debounce);
    } else {
      postPatch(topic, patch);
    }
  }, [postPatch]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  // ── reorder (drag or number) → renumber default_order 1..N, save changed rows ──
  const applyOrder = useCallback((ordered: TopicMeta[]) => {
    const changed: TopicMeta[] = [];
    const renum = ordered.map((r, i) => {
      const next = i + 1;
      if (r.default_order !== next) changed.push({ ...r, default_order: next });
      return { ...r, default_order: next };
    });
    setRows(renum);
    changed.forEach(r => postPatch(r.topic, { default_order: r.default_order }));
  }, [postPatch]);

  const moveTopicTo = useCallback((topic: string, targetIndex: number) => {
    const cur = [...rows].sort((a, b) => (a.default_order ?? 1e9) - (b.default_order ?? 1e9));
    const from = cur.findIndex(r => r.topic === topic);
    if (from < 0) return;
    const [moved] = cur.splice(from, 1);
    cur.splice(Math.max(0, Math.min(cur.length, targetIndex)), 0, moved);
    applyOrder(cur);
  }, [rows, applyOrder]);

  // ── add / delete ──
  async function addTopic() {
    const t = newTopic.trim();
    if (!t) return;
    if (rows.some(r => r.topic.toLowerCase() === t.toLowerCase())) { showToast('err', 'Topic already exists'); return; }
    const nextOrder = Math.max(0, ...rows.map(r => r.default_order ?? 0)) + 1;
    const optimistic: TopicMeta = {
      subject, topic: t, default_order: nextOrder, prerequisites: [],
      exam_weight: 3, difficulty: 3, emphasis: 'both',
      emphasis_note: null, leverage_note: null, must_master: [], watch_for: null,
    };
    setRows(rs => [...rs, optimistic]);
    setNewTopic(''); setAdding(false);
    await postPatch(t, { default_order: nextOrder });
  }

  async function deleteTopic(topic: string) {
    if (!confirm(`Delete "${topic}" from ${subject}? This removes its strategy metadata.`)) return;
    setRows(rs => rs.filter(r => r.topic !== topic));
    try {
      const res = await fetch('/api/admin/topic-meta', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, topic }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
      showToast('ok', 'Deleted');
    } catch (e) { showToast('err', e instanceof Error ? e.message : 'Delete failed'); fetchRows(subject); }
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.default_order ?? 1e9) - (b.default_order ?? 1e9) || a.topic.localeCompare(b.topic)),
    [rows],
  );

  function focusFromGraph(topic: string) {
    setView('list'); setFocusTopic(topic);
    setTimeout(() => {
      const el = rowRefs.current[topic];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      setTimeout(() => setFocusTopic(null), 1800);
    }, 60);
  }

  // ── auth screen ──
  if (!authed) {
    return (
      <>
        <style>{CSS}</style>
        <div className="cur-login-wrap">
          <div className="cur-login-card">
            <div className="cur-login-icon">🧭</div>
            <h1>Curriculum</h1>
            <p>Strategy layer</p>
            <form onSubmit={handleLogin}>
              <PasswordInput className="cur-pw-input" placeholder="Admin password" value={password}
                onChange={v => { setPassword(v); setAuthError(''); }} autoFocus disabled={authLoading} />
              {authError && <div className="cur-pw-error">{authError}</div>}
              <button type="submit" className="cur-pw-btn" disabled={authLoading || !password}>
                {authLoading ? 'Checking…' : 'Enter'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="cur-wrap">
        <div className="cur-header">
          <div className="cur-header-inner">
            <a href="/admin" className="cur-back">← Admin</a>
            <span className="cur-title">🧭 Curriculum</span>
            <div className="cur-viewtoggle">
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
              <button className={view === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>Graph</button>
            </div>
          </div>
          <div className="cur-subjbar">
            {CURRICULUM_SUBJECTS.map(s => (
              <button key={s.key} className={`cur-subj ${s.key === subject ? 'on' : ''}`} onClick={() => setSubject(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cur-body">
          {loading && <div className="cur-muted">Loading…</div>}
          {error && <div className="cur-err">{error} · <button onClick={() => fetchRows(subject)}>retry</button></div>}

          {!loading && !error && rows.length === 0 && view === 'list' && (
            <div className="cur-empty">No topics yet for {subject}. Add the first one below.</div>
          )}

          {!loading && !error && view === 'graph' && (
            <div className="cur-card cur-graphcard">
              <CurriculumGraph rows={rows} onFocus={focusFromGraph} />
            </div>
          )}

          {!loading && !error && view === 'list' && (
            <div className="cur-list">
              {sorted.map((r, idx) => {
                const others = sorted.filter(o => o.topic !== r.topic).map(o => o.topic);
                const ss = saveState[r.topic];
                return (
                  <div
                    key={r.topic}
                    ref={el => { rowRefs.current[r.topic] = el; }}
                    className={`cur-row ${focusTopic === r.topic ? 'focus' : ''} ${dragTopic === r.topic ? 'dragging' : ''}`}
                    onDragOver={e => { if (dragTopic) e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); if (dragTopic && dragTopic !== r.topic) moveTopicTo(dragTopic, idx); setDragTopic(null); }}
                  >
                    <div className="cur-row-head">
                      <span
                        className="cur-drag"
                        draggable
                        onDragStart={() => setDragTopic(r.topic)}
                        onDragEnd={() => setDragTopic(null)}
                        title="Drag to reorder"
                      >⋮⋮</span>
                      <input
                        className="cur-order"
                        type="number" min={1} value={r.default_order ?? ''}
                        onChange={e => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          setRows(rs => rs.map(x => x.topic === r.topic ? { ...x, default_order: v } : x));
                        }}
                        onBlur={e => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          if (v && v >= 1) moveTopicTo(r.topic, v - 1);
                        }}
                        title="Order number — edit to reposition"
                      />
                      <span className="cur-topic">{r.topic}</span>
                      <span className={`cur-save ${ss || ''}`}>
                        {ss === 'saving' ? 'saving…' : ss === 'saved' ? '✓ saved' : ss === 'error' ? '⚠ error' : ''}
                      </span>
                      <button className="cur-del" onClick={() => deleteTopic(r.topic)} title="Delete topic">🗑</button>
                    </div>

                    <div className="cur-grid">
                      {/* exam weight */}
                      <label className="cur-field">
                        <span className="cur-lbl">Exam weight <em>{r.exam_weight}/5</em></span>
                        <div className="cur-scale">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} className={`cur-dot w ${r.exam_weight >= n ? 'on' : ''}`}
                              onClick={() => edit(r.topic, { exam_weight: n })} title={`weight ${n}`}>{n}</button>
                          ))}
                        </div>
                      </label>
                      {/* difficulty */}
                      <label className="cur-field">
                        <span className="cur-lbl">Difficulty <em>{r.difficulty}/5</em></span>
                        <div className="cur-scale">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} className={`cur-dot d ${r.difficulty >= n ? 'on' : ''}`}
                              onClick={() => edit(r.topic, { difficulty: n })} title={`difficulty ${n}`}>{n}</button>
                          ))}
                        </div>
                      </label>
                      {/* emphasis */}
                      <label className="cur-field">
                        <span className="cur-lbl">Emphasis</span>
                        <div className="cur-seg">
                          {EMPHASIS_OPTS.map(o => (
                            <button key={o.key} className={r.emphasis === o.key ? 'on' : ''}
                              onClick={() => edit(r.topic, { emphasis: o.key })}>{o.label}</button>
                          ))}
                        </div>
                      </label>
                    </div>

                    {/* prerequisites */}
                    <div className="cur-field wide">
                      <span className="cur-lbl">Prerequisites</span>
                      <PrereqPicker
                        options={others}
                        selected={r.prerequisites || []}
                        onChange={next => edit(r.topic, { prerequisites: next })}
                      />
                    </div>

                    {/* must master */}
                    <div className="cur-field wide">
                      <span className="cur-lbl">Must-master</span>
                      <MustMasterEditor
                        items={r.must_master || []}
                        onChange={next => edit(r.topic, { must_master: next })}
                      />
                    </div>

                    {/* notes */}
                    <div className="cur-notes">
                      <label className="cur-field">
                        <span className="cur-lbl">Leverage note <small>strategic why</small></span>
                        <textarea rows={2} value={r.leverage_note ?? ''}
                          onChange={e => edit(r.topic, { leverage_note: e.target.value }, 650)} />
                      </label>
                      <label className="cur-field">
                        <span className="cur-lbl">Emphasis note</span>
                        <textarea rows={2} value={r.emphasis_note ?? ''}
                          onChange={e => edit(r.topic, { emphasis_note: e.target.value }, 650)} />
                      </label>
                      <label className="cur-field">
                        <span className="cur-lbl">Watch for <small>mark-scheme focus</small></span>
                        <textarea rows={2} value={r.watch_for ?? ''}
                          onChange={e => edit(r.topic, { watch_for: e.target.value }, 650)} />
                      </label>
                    </div>
                  </div>
                );
              })}

              {/* add topic */}
              {adding ? (
                <div className="cur-addbar">
                  <input autoFocus placeholder="New topic name" value={newTopic}
                    onChange={e => setNewTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTopic(); if (e.key === 'Escape') { setAdding(false); setNewTopic(''); } }} />
                  <button className="cur-add-go" onClick={addTopic}>Add</button>
                  <button className="cur-add-x" onClick={() => { setAdding(false); setNewTopic(''); }}>Cancel</button>
                </div>
              ) : (
                <button className="cur-addbtn" onClick={() => setAdding(true)}>＋ Add topic</button>
              )}
            </div>
          )}
        </div>

        {toast && <div className={`cur-toast ${toast.kind}`}>{toast.msg}</div>}
      </div>
    </>
  );
}

// ── prerequisites multi-select ──────────────────────────────────────────────
function PrereqPicker({ options, selected, onChange }: {
  options: string[]; selected: string[]; onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (t: string) =>
    onChange(selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t]);
  return (
    <div className="cur-prereq">
      <div className="cur-chips">
        {selected.length === 0 && <span className="cur-chip-empty">none</span>}
        {selected.map(t => (
          <span key={t} className="cur-chip">{t}<button onClick={() => toggle(t)}>✕</button></span>
        ))}
        <button className="cur-chip-add" onClick={() => setOpen(o => !o)}>{open ? 'done' : '＋ add'}</button>
      </div>
      {open && (
        <div className="cur-prereq-menu">
          {options.length === 0 && <span className="cur-chip-empty">no other topics</span>}
          {options.map(t => (
            <label key={t} className="cur-prereq-opt">
              <input type="checkbox" checked={selected.includes(t)} onChange={() => toggle(t)} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── must-master chip editor ─────────────────────────────────────────────────
function MustMasterEditor({ items, onChange }: {
  items: MustMasterItem[]; onChange: (next: MustMasterItem[]) => void;
}) {
  const [kind, setKind] = useState<MustMasterKind>('diagram');
  const [label, setLabel] = useState('');
  const add = () => {
    const l = label.trim();
    if (!l) return;
    onChange([...items, { kind, label: l }]);
    setLabel('');
  };
  return (
    <div className="cur-mm">
      <div className="cur-chips">
        {items.length === 0 && <span className="cur-chip-empty">none</span>}
        {items.map((it, i) => (
          <span key={i} className="cur-chip mm">
            <b>{MUST_MASTER_ICON[it.kind]}</b> {it.label}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </span>
        ))}
      </div>
      <div className="cur-mm-add">
        <select value={kind} onChange={e => setKind(e.target.value as MustMasterKind)}>
          {MUST_MASTER_KINDS.map(k => <option key={k} value={k}>{MUST_MASTER_ICON[k]} {k}</option>)}
        </select>
        <input placeholder="label (e.g. heart)" value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button onClick={add}>Add</button>
      </div>
    </div>
  );
}

const CSS = `
.cur-login-wrap { min-height:100vh; background:#f3f4f6; display:flex; align-items:center; justify-content:center; padding:16px; }
.cur-login-card { width:100%; max-width:360px; background:#fff; border-radius:20px; border:1px solid #e5e7eb; padding:32px 28px; text-align:center; }
.cur-login-icon { font-size:40px; margin-bottom:12px; }
.cur-login-card h1 { font-size:20px; font-weight:700; color:#111827; margin:0 0 4px; }
.cur-login-card p { font-size:13px; color:#9ca3af; margin:0 0 24px; }
.cur-pw-input { width:100%; border:1px solid #e5e7eb; border-radius:10px; padding:12px 16px; font-size:15px; outline:none; box-sizing:border-box; margin-bottom:10px; color:#111; }
.cur-pw-input:focus { border-color:#1e3a5f; }
.cur-pw-error { font-size:13px; color:#ef4444; margin-bottom:10px; }
.cur-pw-btn { width:100%; background:#1e3a5f; color:#fff; border:none; border-radius:10px; padding:13px 0; font-size:15px; font-weight:600; cursor:pointer; }
.cur-pw-btn:disabled { opacity:.45; }

.cur-wrap { min-height:100vh; background:#f3f4f6; padding-bottom:48px; }
.cur-header { position:sticky; top:0; z-index:10; background:#fff; border-bottom:1px solid #e5e7eb; }
.cur-header-inner { max-width:900px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; gap:12px; }
.cur-back { font-size:13px; color:#6b7280; text-decoration:none; }
.cur-back:hover { color:#1e3a5f; }
.cur-title { font-size:17px; font-weight:700; color:#111827; }
.cur-viewtoggle { margin-left:auto; display:flex; background:#f3f4f6; border-radius:9px; padding:2px; }
.cur-viewtoggle button { border:none; background:none; font-size:13px; font-weight:600; color:#6b7280; padding:6px 14px; border-radius:7px; cursor:pointer; }
.cur-viewtoggle button.on { background:#1e3a5f; color:#fff; }
.cur-subjbar { max-width:900px; margin:0 auto; padding:0 16px 10px; display:flex; flex-wrap:wrap; gap:6px; }
.cur-subj { border:1px solid #e5e7eb; background:#fff; border-radius:999px; font-size:12.5px; font-weight:600; color:#6b7280; padding:5px 13px; cursor:pointer; }
.cur-subj.on { background:#1e3a5f; color:#fff; border-color:#1e3a5f; }

.cur-body { max-width:900px; margin:0 auto; padding:16px; }
.cur-muted { color:#9ca3af; font-size:14px; }
.cur-err { color:#ef4444; font-size:14px; }
.cur-err button { color:#ef4444; text-decoration:underline; background:none; border:none; cursor:pointer; }
.cur-empty { color:#6b7280; font-size:14px; background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:20px; text-align:center; }
.cur-card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:14px; }
.cur-graphcard { padding:14px 10px; }

.cur-list { display:flex; flex-direction:column; gap:12px; }
.cur-row { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:12px 14px 14px; transition:box-shadow .2s, border-color .2s; }
.cur-row.focus { border-color:#E7A417; box-shadow:0 0 0 3px rgba(231,164,23,.22); }
.cur-row.dragging { opacity:.5; }
.cur-row-head { display:flex; align-items:center; gap:9px; margin-bottom:10px; }
.cur-drag { cursor:grab; color:#c4c8cf; font-size:14px; letter-spacing:-2px; user-select:none; }
.cur-order { width:44px; border:1px solid #e5e7eb; border-radius:8px; padding:4px 6px; font-size:13px; text-align:center; color:#111; }
.cur-topic { font-size:15px; font-weight:700; color:#111827; }
.cur-save { font-size:11px; margin-left:6px; color:#9ca3af; }
.cur-save.saved { color:#16a34a; }
.cur-save.error { color:#ef4444; }
.cur-del { margin-left:auto; background:none; border:none; cursor:pointer; font-size:14px; opacity:.5; }
.cur-del:hover { opacity:1; }

.cur-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px 16px; margin-bottom:6px; }
.cur-field { display:flex; flex-direction:column; gap:5px; }
.cur-field.wide { margin-top:10px; }
.cur-lbl { font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.03em; display:flex; gap:6px; align-items:baseline; }
.cur-lbl em { font-style:normal; color:#1e3a5f; font-weight:700; }
.cur-lbl small { text-transform:none; letter-spacing:0; color:#b6bcc6; font-weight:500; }
.cur-scale { display:flex; gap:4px; }
.cur-dot { width:26px; height:26px; border-radius:7px; border:1px solid #e5e7eb; background:#fff; color:#c4c8cf; font-size:12px; font-weight:700; cursor:pointer; }
.cur-dot.w.on { background:#E7A417; border-color:#E7A417; color:#fff; }
.cur-dot.d.on { background:#d1495b; border-color:#d1495b; color:#fff; }
.cur-seg { display:flex; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; width:fit-content; }
.cur-seg button { border:none; background:#fff; font-size:12px; font-weight:600; color:#6b7280; padding:6px 12px; cursor:pointer; border-left:1px solid #e5e7eb; }
.cur-seg button:first-child { border-left:none; }
.cur-seg button.on { background:#1e3a5f; color:#fff; }

.cur-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.cur-chip-empty { font-size:12px; color:#b6bcc6; }
.cur-chip { display:inline-flex; align-items:center; gap:5px; background:#eef2f7; border:1px solid #dbe3ee; color:#1e3a5f; border-radius:999px; font-size:12px; padding:3px 8px; }
.cur-chip.mm { background:#fdf6e8; border-color:#f0e2c0; }
.cur-chip.mm b { font-weight:700; }
.cur-chip button { background:none; border:none; cursor:pointer; color:#94a3b8; font-size:11px; padding:0; }
.cur-chip-add { background:#fff; border:1px dashed #cbd5e1; color:#6b7280; border-radius:999px; font-size:12px; padding:3px 10px; cursor:pointer; }
.cur-prereq-menu { margin-top:8px; border:1px solid #e5e7eb; border-radius:10px; padding:8px; display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:4px; background:#fafbfc; }
.cur-prereq-opt { display:flex; align-items:center; gap:7px; font-size:12.5px; color:#374151; padding:3px 4px; cursor:pointer; }
.cur-mm-add { display:flex; gap:6px; margin-top:8px; }
.cur-mm-add select { border:1px solid #e5e7eb; border-radius:8px; padding:5px 6px; font-size:12px; color:#374151; }
.cur-mm-add input { flex:1; min-width:80px; border:1px solid #e5e7eb; border-radius:8px; padding:5px 9px; font-size:13px; color:#111; }
.cur-mm-add button { background:#1e3a5f; color:#fff; border:none; border-radius:8px; padding:5px 12px; font-size:12px; font-weight:600; cursor:pointer; }

.cur-notes { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:10px 16px; margin-top:12px; }
.cur-notes textarea { border:1px solid #e5e7eb; border-radius:9px; padding:7px 10px; font-size:13px; color:#111; resize:vertical; font-family:inherit; line-height:1.4; }
.cur-notes textarea:focus { outline:none; border-color:#1e3a5f; }

.cur-addbtn { align-self:flex-start; background:#fff; border:1px dashed #cbd5e1; color:#1e3a5f; border-radius:12px; padding:11px 18px; font-size:14px; font-weight:600; cursor:pointer; }
.cur-addbar { display:flex; gap:8px; align-items:center; }
.cur-addbar input { flex:1; border:1px solid #e5e7eb; border-radius:10px; padding:10px 14px; font-size:14px; color:#111; }
.cur-add-go { background:#1e3a5f; color:#fff; border:none; border-radius:10px; padding:10px 16px; font-weight:600; cursor:pointer; }
.cur-add-x { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 14px; color:#6b7280; cursor:pointer; }

.cur-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#111827; color:#fff; font-size:13px; padding:10px 18px; border-radius:10px; z-index:50; }
.cur-toast.ok { background:#16a34a; }
.cur-toast.err { background:#ef4444; }
`;
