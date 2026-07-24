'use client';

import { useState, useEffect } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

type Todo = { id: string; task: string; status: string; notes: string; createdTime: string };

export default function TodoPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [newTask, setNewTask] = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/todo');
      const d = await r.json();
      setTodos(d.todos || []);
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
    await fetch('/api/admin/todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    });
    load();
  }
  async function toggle(t: Todo) {
    await fetch('/api/admin/todo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status: t.status === 'Done' ? 'To Do' : 'Done' }),
    });
    load();
  }
  async function del(t: Todo) {
    await fetch('/api/admin/todo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id }),
    });
    load();
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔁</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Loop Tasks</h1>
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

  const open = todos.filter(t => t.status !== 'Done');
  const done = todos.filter(t => t.status === 'Done');

  const row = (t: Todo) => (
    <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #f1f1f4' }}>
      <input type="checkbox" checked={t.status === 'Done'} onChange={() => toggle(t)} style={{ width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }} />
      <span style={{ flex: 1, fontSize: 15, color: t.status === 'Done' ? '#9ca3af' : '#111', textDecoration: t.status === 'Done' ? 'line-through' : 'none' }}>{t.task}</span>
      <button onClick={() => del(t)} title="Delete" style={{ border: 'none', background: 'none', color: '#cbd0d6', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
    </li>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <a href="/admin" style={{ textDecoration: 'none', color: '#6b7280', fontSize: 14, fontWeight: 600 }}>‹ Admin</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111' }}>🔁 Loop Tasks</h1>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
          Dev-task queue for Claude — worked top-to-bottom, open items first, oldest at the top.
          Personal errands go in <a href="/admin/my-todos" style={{ color: '#1e3a5f' }}>My To-Dos</a>.
        </p>

        <details style={{ marginBottom: 18, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <summary style={{ cursor: 'pointer', padding: '12px 14px', fontSize: 14, fontWeight: 700, color: '#1e3a5f' }}>▶ How to run these with the loop</summary>
          <div style={{ padding: '0 14px 14px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>In your local Claude Code session (rooted in <code>~/dev</code>), paste:</p>
            <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 10px' }}>/loop take the next open task from the Todos table, implement it, run npm test until it passes, then mark it Done; stop when no open tasks remain</pre>
            <p style={{ margin: '0 0 6px' }}><strong>What happens:</strong> it does the top open task → runs <code>npm test</code> to prove it works → ticks it Done here → moves to the next.</p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>Keep tasks <strong>small and specific</strong> — one focused change each.</li>
              <li><code>npm test</code> is the safety net: a task isn&apos;t ticked off until the tests pass, so broken work can&apos;t sneak through.</li>
              <li>Watch the first task, then let it run. <strong>Review the changes before you deploy</strong> — the loop doesn&apos;t push to production on its own.</li>
            </ul>
          </div>
        </details>

        {apiError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {/Todos/i.test(apiError) || /not.*found|NOT_FOUND|model was not found/i.test(apiError)
              ? 'No "Todos" table found in Airtable yet — create it (Task · Status · Notes), then refresh.'
              : `Airtable: ${apiError}`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
            placeholder="Add a task…  (e.g. Add a test for getInvoiceMonth)"
            style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={addTask} disabled={!newTask.trim()}
            style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, padding: '0 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: newTask.trim() ? 1 : 0.45 }}>Add</button>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, background: '#fafafa' }}>
            Open · {open.length}
          </div>
          {loading && open.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Loading…</p>
            : open.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Nothing open — add a task above.</p>
              : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{open.map(row)}</ul>}
        </div>

        {done.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', marginTop: 16, opacity: 0.85 }}>
            <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, background: '#fafafa' }}>
              Done · {done.length}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{done.map(row)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
