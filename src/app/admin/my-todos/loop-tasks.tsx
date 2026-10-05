'use client';

// Loop tasks — the build-test-fix /loop queue (Airtable "Todos", /api/admin/todo).
// A tab on /admin/my-todos since 5 Oct 2026; it was its own page, /admin/todo, which
// now redirects to /admin/my-todos?tab=loop. The worksheet-clerk skill still reads
// /api/admin/todo, unchanged.

import { useEffect, useState } from 'react';

type Todo = { id: string; task: string; status: string; notes: string; createdTime: string };

export default function LoopTasks() {
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

  useEffect(() => { load(); }, []);

  async function send(method: 'POST' | 'PATCH' | 'DELETE', body: unknown) {
    await fetch('/api/admin/todo', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }
  function addTask() {
    const task = newTask.trim();
    if (!task) return;
    setNewTask('');
    send('POST', { task });
  }

  const open = todos.filter(t => t.status !== 'Done');
  const done = todos.filter(t => t.status === 'Done');

  const row = (t: Todo) => (
    <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #f1f1f4' }}>
      <input type="checkbox" checked={t.status === 'Done'} onChange={() => send('PATCH', { id: t.id, status: t.status === 'Done' ? 'To Do' : 'Done' })} style={{ width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }} />
      <span style={{ flex: 1, fontSize: 15, color: t.status === 'Done' ? '#9ca3af' : '#111', textDecoration: t.status === 'Done' ? 'line-through' : 'none', wordBreak: 'break-word' }}>{t.task}</span>
      <button onClick={() => send('DELETE', { id: t.id })} title="Delete" style={{ border: 'none', background: 'none', color: '#cbd0d6', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
    </li>
  );

  return (
    <>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
        Dev tasks for Claude, worked top to bottom, oldest first.
      </p>

      <details style={{ marginBottom: 18, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <summary style={{ cursor: 'pointer', padding: '12px 14px', fontSize: 14, fontWeight: 700, color: '#1e3a5f' }}>How to run these with the loop</summary>
        <div style={{ padding: '0 14px 14px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>In your local Claude Code session (rooted in <code>~/dev</code>), paste:</p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 10px' }}>/loop take the next open task from the Todos table, implement it, run npm test until it passes, then mark it Done; stop when no open tasks remain</pre>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Keep tasks <strong>small and specific</strong>, one change each.</li>
            <li>A task is ticked off only once <code>npm test</code> passes.</li>
            <li><strong>Review the changes before you deploy</strong>. The loop does not push to production.</li>
          </ul>
        </div>
      </details>

      {apiError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
          {/Todos/i.test(apiError) || /not.*found|NOT_FOUND|model was not found/i.test(apiError)
            ? 'No "Todos" table found in Airtable yet. Create it (Task · Status · Notes), then refresh.'
            : `Airtable: ${apiError}`}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
          placeholder="Add a task…  (e.g. Add a test for getInvoiceMonth)"
          style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box', minWidth: 0 }} />
        <button onClick={addTask} disabled={!newTask.trim()}
          style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, padding: '0 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: newTask.trim() ? 1 : 0.45 }}>Add</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, background: '#fafafa' }}>
          Open · {open.length}
        </div>
        {loading && open.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Loading…</p>
          : open.length === 0 ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Nothing open. Add a task above.</p>
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
    </>
  );
}
