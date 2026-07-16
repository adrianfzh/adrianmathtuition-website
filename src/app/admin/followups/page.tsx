'use client';

// Parent follow-ups — track promises made to parents on WhatsApp ("will test
// him before WA3 and update mum") with due dates, a done tick, and a daily
// 8am Telegram digest. Backed by the Airtable `Follow-ups` table.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAdminSession } from '@/lib/admin-client';

interface FU { id: string; note: string; due: string | null; done: boolean; studentId: string | null }
interface Stu { id: string; name: string; level: string }

function fmtDue(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return iso; }
}
const todayISO = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // SGT
  return d.toISOString().slice(0, 10);
};

export default function FollowupsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [rows, setRows] = useState<FU[] | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [students, setStudents] = useState<Stu[]>([]);
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [studentId, setStudentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/followups');
      const d = await r.json();
      setRows(d.followups || []);
      setTableMissing(!!d.tableMissing);
    } catch { setRows([]); }
  }, []);

  useEffect(() => {
    ensureAdminSession().then(ok => {
      if (!ok) { router.replace('/admin'); return; }
      setAuthed(true);
      load();
      // Deep-link: /admin/followups?student=recXXX preselects the student (profile-page button)
      const pre = new URLSearchParams(window.location.search).get('student');
      if (pre) setStudentId(pre);
      fetch('/api/admin/progress/students').then(r => r.json()).then(d => setStudents(d.students || [])).catch(() => {});
    });
  }, [router, load]);

  async function add() {
    if (!note.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/followups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim(), due: due || undefined, studentId: studentId || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); showToast(d.error || 'Failed'); return; }
      setNote(''); setDue(''); setStudentId('');
      showToast('Added ✓');
      load();
    } finally { setSaving(false); }
  }

  async function patch(id: string, fields: { done?: boolean; due?: string }) {
    setBusyId(id);
    try {
      await fetch('/api/admin/followups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...fields }) });
      load();
    } finally { setBusyId(''); setSnoozeId(null); }
  }

  if (!authed) return null;

  const nameOf = (sid: string | null) => students.find(s => s.id === sid)?.name || null;
  const today = todayISO();
  const overdue = (rows || []).filter(f => f.due && f.due < today);
  const dueToday = (rows || []).filter(f => f.due === today);
  const upcoming = (rows || []).filter(f => !f.due || f.due > today);

  const group = (title: string, items: FU[], accent: string) => items.length > 0 && (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>{title} · {items.length}</div>
      {items.map(f => (
        <div key={f.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {nameOf(f.studentId) && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1d4ed8', marginBottom: 2 }}>{nameOf(f.studentId)}</div>}
              <div style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.45 }}>{f.note}</div>
              {f.due && <div style={{ fontSize: 12, color: f.due < today ? '#dc2626' : '#94a3b8', marginTop: 3 }}>{f.due < today ? '⚠ overdue · ' : ''}due {fmtDue(f.due)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => { setSnoozeId(snoozeId === f.id ? null : f.id); setSnoozeDate(''); }} disabled={busyId === f.id}
                style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>⏰</button>
              <button onClick={() => patch(f.id, { done: true })} disabled={busyId === f.id}
                style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                {busyId === f.id ? '…' : '✓ Done'}
              </button>
            </div>
          </div>
          {snoozeId === f.id && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input type="date" value={snoozeDate} onChange={e => setSnoozeDate(e.target.value)}
                style={{ flex: 1, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, WebkitAppearance: 'none' }} />
              <button onClick={() => snoozeDate && patch(f.id, { due: snoozeDate })} disabled={!snoozeDate}
                style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: '#1e3a5f', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>Snooze</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg, #16305a, #24466f)', padding: '18px 20px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <a href="/admin" style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: 13 }}>← Admin</a>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 4 }}>📌 Follow-ups</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Promises to parents · daily 8am Telegram digest until done</div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 16px 60px' }}>
        {/* Add */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, marginBottom: 20 }}>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="e.g. Test Xavier on EM WA3 topics, then update mum"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <select value={studentId} onChange={e => setStudentId(e.target.value)}
              style={{ flex: '1 1 150px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
              <option value="">Student (optional)</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.level})</option>)}
            </select>
            <input type="date" value={due} onChange={e => setDue(e.target.value)}
              style={{ flex: '1 1 130px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, WebkitAppearance: 'none', background: '#fff' }} />
            <button onClick={add} disabled={saving || !note.trim()}
              style={{ flex: '0 0 auto', fontSize: 13.5, fontWeight: 700, color: '#fff', background: '#1e3a5f', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', opacity: saving || !note.trim() ? 0.5 : 1 }}>
              {saving ? 'Adding…' : '＋ Add'}
            </button>
          </div>
        </div>

        {tableMissing && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
            ⚠ The <b>Follow-ups</b> table isn&apos;t set up in Airtable yet — create it (Note · Student → Students · Due date · Done checkbox) and reload.
          </div>
        )}

        {rows === null ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 30, fontSize: 14 }}>Loading…</div>
        ) : rows.length === 0 && !tableMissing ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 30, fontSize: 14 }}>No open follow-ups 🎉</div>
        ) : (
          <>
            {group('⚠ Overdue', overdue, '#dc2626')}
            {group('📅 Due today', dueToday, '#b45309')}
            {group('Upcoming / no date', upcoming, '#64748b')}
          </>
        )}
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 22px', borderRadius: 20, fontSize: 14, zIndex: 100 }}>{toast}</div>}
    </div>
  );
}
