'use client';

import { useState, useEffect } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { classifyDue, dueLabel, type DueBucket } from '@/lib/todo-dates';

// Adrian's personal to-do list. NOT the build-test-fix /loop queue — that
// lives at /admin/todo (Airtable "Todos"); nothing automated touches this.

type Todo = { id: string; task: string; done: boolean; dueDate: string | null; createdAt: string; doneAt: string | null };

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const BUCKET_STYLE: Record<Exclude<DueBucket, 'none'>, { bg: string; border: string; color: string }> = {
  overdue:  { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
  today:    { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
  tomorrow: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  upcoming: { bg: '#f3f4f6', border: '#e5e7eb', color: '#6b7280' },
};

export default function MyTodosPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [open, setOpen] = useState<Todo[]>([]);
  const [done, setDone] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const [newTask, setNewTask] = useState('');
  const [newDue, setNewDue] = useState('');
  const [showNewDue, setShowNewDue] = useState(false);

  // Row edit mode
  const [editId, setEditId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState('');
  const [editDue, setEditDue] = useState('');

  const today = todayISO();

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch('/api/admin/my-todos');
      const d = await r.json();
      setOpen(d.open || []);
      setDone(d.done || []);
      setApiError(d.error || '');
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

  async function addTask() {
    const task = newTask.trim();
    if (!task) return;
    setNewTask('');
    const due = newDue;
    setNewDue('');
    setShowNewDue(false);
    await fetch('/api/admin/my-todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, dueDate: due || null }),
    });
    load(false);
  }

  async function toggle(t: Todo) {
    // Optimistic: move between lists immediately, then quietly re-sync.
    if (t.done) {
      setDone(d => d.filter(x => x.id !== t.id));
      setOpen(o => [...o, { ...t, done: false, doneAt: null }]);
    } else {
      setOpen(o => o.filter(x => x.id !== t.id));
      setDone(d => [{ ...t, done: true, doneAt: new Date().toISOString() }, ...d]);
    }
    await fetch('/api/admin/my-todos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, done: !t.done }),
    });
    load(false);
  }

  async function del(t: Todo) {
    await fetch('/api/admin/my-todos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id }),
    });
    load(false);
  }

  async function clearDone() {
    if (!window.confirm(`Delete all ${done.length} completed to-dos?`)) return;
    await fetch('/api/admin/my-todos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearDone: true }),
    });
    load(false);
  }

  function startEdit(t: Todo) {
    setEditId(t.id);
    setEditTask(t.task);
    setEditDue(t.dueDate || '');
  }

  async function saveEdit() {
    const id = editId;
    const task = editTask.trim();
    if (!id || !task) { setEditId(null); return; }
    setEditId(null);
    await fetch('/api/admin/my-todos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, task, dueDate: editDue || null }),
    });
    load(false);
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>My To-Dos</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>Admin password required</p>
          <form onSubmit={e => { e.preventDefault(); setAuthError(''); verify(password); }}>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthError(''); }}
              placeholder="Admin password" autoFocus disabled={authLoading}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
            {authError && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 10 }}>{authError}</p>}
            <button type="submit" disabled={authLoading || !password}
              style={{ width: '100%', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: (authLoading || !password) ? 0.45 : 1 }}>
              {authLoading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const overdueCount = open.filter(t => classifyDue(t.dueDate, today) === 'overdue').length;

  const dueChip = (t: Todo) => {
    const bucket = classifyDue(t.dueDate, today);
    if (bucket === 'none' || !t.dueDate) return null;
    const s = BUCKET_STYLE[bucket];
    return (
      <span onClick={() => startEdit(t)} style={{
        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer',
        background: s.bg, border: `1px solid ${s.border}`, color: s.color, flexShrink: 0,
      }}>
        {dueLabel(t.dueDate, today)}
      </span>
    );
  };

  const editRow = (t: Todo) => (
    <li key={t.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f1f4', background: '#f8fafc' }}>
      <input value={editTask} onChange={e => setEditTask(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}
        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Due:</span>
        <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
          style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px', fontSize: 14 }} />
        {editDue && (
          <button onClick={() => setEditDue('')} style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
            no date
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={() => setEditId(null)} style={{ border: '1px solid #e5e7eb', background: '#fff', color: '#374151', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={saveEdit} disabled={!editTask.trim()} style={{ border: 'none', background: '#1e3a5f', color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: editTask.trim() ? 1 : 0.45 }}>Save</button>
      </div>
    </li>
  );

  const row = (t: Todo) => {
    if (editId === t.id) return editRow(t);
    return (
      <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #f1f1f4' }}>
        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} style={{ width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }} />
        <span onClick={() => !t.done && startEdit(t)} style={{
          flex: 1, fontSize: 15, color: t.done ? '#9ca3af' : '#111',
          textDecoration: t.done ? 'line-through' : 'none', cursor: t.done ? 'default' : 'pointer',
          wordBreak: 'break-word',
        }}>{t.task}</span>
        {!t.done && dueChip(t)}
        <button onClick={() => del(t)} title="Delete" style={{ border: 'none', background: 'none', color: '#cbd0d6', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>✕</button>
      </li>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <a href="/admin" style={{ textDecoration: 'none', color: '#6b7280', fontSize: 14, fontWeight: 600 }}>‹ Admin</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111' }}>📝 My To-Dos</h1>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
          Your personal list — nothing automated touches it. Dev tasks for the loop go in <a href="/admin/todo" style={{ color: '#1e3a5f' }}>Loop tasks</a>.
        </p>

        {apiError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {apiError}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
              placeholder="Add a to-do…  (e.g. Reply to Kieran's mum)"
              style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box', minWidth: 0 }} />
            <button onClick={() => setShowNewDue(v => !v)} title="Set a due date"
              style={{ border: '1px solid #e5e7eb', background: (showNewDue || newDue) ? '#eff6ff' : '#fff', borderRadius: 10, padding: '0 12px', fontSize: 17, cursor: 'pointer', flexShrink: 0 }}>📅</button>
            <button onClick={addTask} disabled={!newTask.trim()}
              style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, padding: '0 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: newTask.trim() ? 1 : 0.45, flexShrink: 0 }}>Add</button>
          </div>
          {showNewDue && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Due:</span>
              <input type="date" value={newDue} min={today} onChange={e => setNewDue(e.target.value)}
                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: 14, background: '#fff' }} />
              {newDue && (
                <button onClick={() => setNewDue('')} style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>clear</button>
              )}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, background: '#fafafa' }}>
            Open · {open.length}{overdueCount > 0 && <span style={{ color: '#b91c1c' }}> · {overdueCount} overdue</span>}
          </div>
          {loading && open.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Loading…</p>
            : open.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>All clear — add a to-do above.</p>
              : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{open.map(row)}</ul>}
        </div>

        {done.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', marginTop: 16, opacity: 0.85 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: '#fafafa' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>Done · {done.length}</span>
              <span style={{ flex: 1 }} />
              <button onClick={clearDone} style={{ border: 'none', background: 'none', color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{done.map(row)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
