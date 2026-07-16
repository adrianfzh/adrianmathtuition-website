'use client';

// Waitlist admin — web counterpart of the bot's /waitlist. Same Airtable table,
// so the 8am digest section and the 9am slot-opening cron see entries from
// either surface. Add prospects, WhatsApp them a check-in, move them through
// Waiting → Contacted → Enrolled / Cancelled.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAdminSession } from '@/lib/admin-client';

interface Entry { id: string; name: string; contact: string; parentContact: string; slotId: string | null; level: string; subjects: string; status: string; notes: string; added: string | null; notified: string | null }
interface Slot { id: string; label: string; spotsRemaining: number | null }

const daysSince = (iso: string | null) => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;

function waHref(entry: Entry, slotLabel: string | null): string | null {
  const digits = (entry.parentContact || entry.contact || '').replace(/\D/g, '');
  if (!digits) return null;
  const phone = digits.length === 8 ? `65${digits}` : digits;
  const msg = encodeURIComponent(`Hi! Just an update from Adrian's Math Tuition — ${entry.name} is still on our waitlist${slotLabel ? ` for ${slotLabel}` : ''}. I'll message you the moment a space opens up. Thanks for your patience!`);
  return `https://wa.me/${phone}?text=${msg}`;
}

export default function WaitlistPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busyId, setBusyId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState('');
  // add form
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [level, setLevel] = useState('');
  const [slotId, setSlotId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/waitlist');
      const d = await r.json();
      setEntries(d.entries || []);
      setSlots(d.slots || []);
    } catch { setEntries([]); }
  }, []);

  useEffect(() => {
    ensureAdminSession().then(ok => {
      if (!ok) { router.replace('/admin'); return; }
      setAuthed(true); load();
    });
  }, [router, load]);

  async function add() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim() || undefined, level: level || undefined, slotId: slotId || undefined, notes: notes.trim() || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); showToast(d.error || 'Failed'); return; }
      setName(''); setContact(''); setLevel(''); setSlotId(''); setNotes('');
      showToast('Added to waitlist ✓');
      load();
    } finally { setSaving(false); }
  }

  async function setStatus(id: string, status: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusyId(id);
    try {
      await fetch('/api/admin/waitlist', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
      showToast(`Marked ${status}`);
      load();
    } finally { setBusyId(''); }
  }

  if (!authed) return null;
  const slotLabel = (id: string | null) => slots.find(s => s.id === id)?.label || null;
  const waiting = (entries || []).filter(e => e.status === 'Waiting' || e.status === 'Contacted');
  const settled = (entries || []).filter(e => e.status === 'Enrolled' || e.status === 'Cancelled');

  const statusBtn = (label: string, color: string, border: string, bg: string, onClick: () => void, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled}
      style={{ fontSize: 11.5, fontWeight: 600, color, background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '5px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg, #16305a, #24466f)', padding: '18px 20px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <a href="/admin" style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: 13 }}>← Admin</a>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 4 }}>⏳ Waitlist</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Shows in the 8am digest · auto-alert when a preferred slot opens (9am)</div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 16px 60px' }}>
        {/* Add */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Student name"
              style={{ flex: '1 1 160px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 11px', fontSize: 14, boxSizing: 'border-box' }} />
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact (parent's, 8 digits)"
              style={{ flex: '1 1 160px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 11px', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <select value={level} onChange={e => setLevel(e.target.value)}
              style={{ flex: '0 1 130px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
              <option value="">Level…</option>
              <option value="Secondary">Secondary</option>
              <option value="JC">JC</option>
            </select>
            <select value={slotId} onChange={e => setSlotId(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
              <option value="">Preferred slot…</option>
              {slots.map(s => <option key={s.id} value={s.id}>{s.label}{s.spotsRemaining !== null ? ` — ${s.spotsRemaining} open` : ''}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
              style={{ flex: 1, minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 11px', fontSize: 13, boxSizing: 'border-box' }} />
            <button onClick={add} disabled={saving || !name.trim()}
              style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', background: '#1e3a5f', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', opacity: saving || !name.trim() ? 0.5 : 1 }}>
              {saving ? 'Adding…' : '＋ Add'}
            </button>
          </div>
        </div>

        {entries === null ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 30, fontSize: 14 }}>Loading…</div>
        ) : waiting.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 30, fontSize: 14 }}>Nobody waiting 🎉</div>
        ) : (
          waiting.map(e => {
            const sl = slotLabel(e.slotId);
            const wa = waHref(e, sl);
            const d = daysSince(e.added);
            const spots = slots.find(s => s.id === e.slotId)?.spotsRemaining;
            return (
              <div key={e.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{e.name}</span>
                  {e.level && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', background: '#f1f5f9', borderRadius: 6, padding: '1px 7px' }}>{e.level}</span>}
                  {e.status === 'Contacted' && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '1px 7px' }}>contacted</span>}
                  {d !== null && <span style={{ fontSize: 12, color: d >= 14 ? '#dc2626' : '#94a3b8' }}>waiting {d}d</span>}
                </div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>
                  {sl ? <>wants <b>{sl}</b>{typeof spots === 'number' && spots > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}> · {spots} spot{spots === 1 ? '' : 's'} open now!</span>}</> : 'no preferred slot'}
                  {e.notes && <> · {e.notes}</>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11.5, fontWeight: 600, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '5px 9px', textDecoration: 'none', whiteSpace: 'nowrap' }}>💬 WhatsApp</a>}
                  {e.status === 'Waiting' && statusBtn('☎ Contacted', '#b45309', '#fcd34d', '#fffbeb', () => setStatus(e.id, 'Contacted'), busyId === e.id)}
                  {statusBtn('🎓 Enrolled', '#15803d', '#bbf7d0', '#f0fdf4', () => setStatus(e.id, 'Enrolled', `Mark ${e.name} as Enrolled? (removes from waitlist)`), busyId === e.id)}
                  {statusBtn('✕ Cancelled', '#b91c1c', '#fecaca', '#fef2f2', () => setStatus(e.id, 'Cancelled', `Mark ${e.name} as Cancelled? (removes from waitlist)`), busyId === e.id)}
                </div>
              </div>
            );
          })
        )}

        {settled.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <button onClick={() => setShowHistory(v => !v)}
              style={{ width: '100%', fontSize: 12.5, fontWeight: 600, color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: '9px 12px', cursor: 'pointer' }}>
              {showHistory ? '▲ Hide history' : `▼ History · ${settled.length} enrolled/cancelled`}
            </button>
            {showHistory && settled.map(e => (
              <div key={e.id} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '10px 14px', marginTop: 8, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#475569' }}>
                  <b>{e.name}</b> — {e.status.toLowerCase()}
                </div>
                <button onClick={() => setStatus(e.id, 'Waiting')} disabled={busyId === e.id}
                  style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>↩ Re-waitlist</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 22px', borderRadius: 20, fontSize: 14, zIndex: 100 }}>{toast}</div>}
    </div>
  );
}
