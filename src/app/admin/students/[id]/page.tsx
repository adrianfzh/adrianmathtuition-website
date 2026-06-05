'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// Same JC/Sec category (Mixed/Adhoc/unknown count as available to all).
function sameLevelSlot(studentLevel: string, slotLevel: string): boolean {
  const stu = (studentLevel || '').toLowerCase();
  const sl = (slotLevel || '').toLowerCase();
  if (!sl || sl === 'mixed' || sl === 'adhoc') return true;
  const slJC = sl.startsWith('jc'), slSec = sl.startsWith('sec');
  if (!slJC && !slSec) return true;
  return stu.startsWith('jc') === slJC;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
}
function money(n: number | null): string {
  return n == null ? '—' : `$${Number(n).toLocaleString()}`;
}

interface Enrollment { enrollmentId: string; slotId: string | null; slotLabel: string; slotLevel: string; ratePerLesson: number | null; rateType: string; }
interface UpLesson { id: string; date: string; slotId: string | null; slotLabel: string; type: string; status: string; }
interface Exam { id: string; examType: string; examDate: string; testedTopics: string; noExam: boolean; }
interface Invoice { id: string; month: string; finalAmount: number | null; amountPaid: number | null; isPaid: boolean; status: string; invoiceType: string; pdfUrl: string; }
interface SlotOpt { id: string; label: string; level: string; }
interface Profile {
  student: { id: string; name: string; level: string; subjects: string[]; subjectLevel: string; status: string; juneRevision: string };
  enrollments: Enrollment[];
  upcoming: UpLesson[];
  exams: Exam[];
  invoices: Invoice[];
  slots: SlotOpt[];
}

const TYPE_COLORS: Record<string, string> = {
  Regular: '#475569', Rescheduled: '#1d4ed8', Additional: '#7c3aed',
  Trial: '#15803d', 'Revision Sprint': '#0e7490',
};

export default function StudentProfilePage() {
  const params = useParams();
  const studentId = (Array.isArray(params.id) ? params.id[0] : params.id) || '';

  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');

  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Slot-management modals
  const [switchModal, setSwitchModal] = useState<{ enr: Enrollment; date: string; newSlotId: string; saving: boolean } | null>(null);
  const [addModal, setAddModal] = useState<{ slotId: string; date: string; saving: boolean } | null>(null);

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchProfile = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/student-profile?id=${studentId}`, { headers: { Authorization: `Bearer ${savedPw.current}` } });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      setData(await res.json());
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [studentId]);

  async function verify(pw: string) {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin-invoices?auth=check', { headers: { Authorization: `Bearer ${pw}` } });
      if (res.ok) { savedPw.current = pw; setCookie('admin_pw', pw, 30); setAuthed(true); }
      else setAuthError('Incorrect password');
    } catch { setAuthError('Connection error'); }
    finally { setAuthLoading(false); }
  }

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    if (pw) { savedPw.current = pw; verify(pw); }
  }, []);
  useEffect(() => { if (authed && studentId) fetchProfile(); }, [authed, studentId, fetchProfile]);

  async function submitSwitch() {
    if (!switchModal || !switchModal.date || !switchModal.newSlotId) return;
    setSwitchModal({ ...switchModal, saving: true });
    try {
      const res = await fetch('/api/admin-schedule/switch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, oldSlotId: switchModal.enr.slotId, newSlotId: switchModal.newSlotId, switchDate: switchModal.date }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || (json.errors || []).join('; ') || 'Failed');
      setSwitchModal(null);
      showToast('ok', `Switched to ${json.newSlotName} (${json.created} lessons created)`);
      await fetchProfile();
    } catch (e: unknown) {
      setSwitchModal(m => m && { ...m, saving: false });
      showToast('err', e instanceof Error ? e.message.slice(0, 90) : 'Failed to switch');
    }
  }

  async function submitAddSlot() {
    if (!addModal || !addModal.slotId) return;
    setAddModal({ ...addModal, saving: true });
    try {
      const res = await fetch('/api/admin-schedule/add-weekly-slot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, slotId: addModal.slotId, startDate: addModal.date || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setAddModal(null);
      showToast('ok', 'Weekly slot added');
      await fetchProfile();
    } catch (e: unknown) {
      setAddModal(m => m && { ...m, saving: false });
      showToast('err', e instanceof Error ? e.message.slice(0, 90) : 'Failed to add slot');
    }
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎓</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>Student profile</h1>
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

  const s = data?.student;
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/admin/students" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 22, lineHeight: 1, padding: 4 }}>‹</a>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>{s?.name || 'Student'}</span>
          {s?.status && s.status !== 'Active' && <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '2px 8px' }}>{s.status}</span>}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px' }}>
        {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading…</div>}
        {error && <div style={{ color: '#dc2626', padding: 16 }}>{error}</div>}

        {!loading && s && data && (
          <>
            {/* Header card */}
            <Section title="Profile">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 14 }}>
                <Field label="Level" value={s.level} />
                <Field label="Subjects" value={Array.isArray(s.subjects) ? s.subjects.join(', ') : ''} />
                {s.subjectLevel && <Field label="Subject level" value={s.subjectLevel} />}
                {s.juneRevision && <Field label="June revision" value={s.juneRevision} />}
              </div>
              <div style={{ marginTop: 10 }}>
                <a href={`/admin/progress?student=${s.id}`} style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none', marginRight: 16 }}>📊 Progress timeline →</a>
                <a href="/admin/schedule" style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none' }}>🗓 Schedule →</a>
              </div>
            </Section>

            {/* Enrollments / slots */}
            <Section title="Weekly slots" action={<button style={btnGhost} onClick={() => setAddModal({ slotId: '', date: '', saving: false })}>＋ Add slot</button>}>
              {data.enrollments.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>No active enrollments.</div>}
              {data.enrollments.map(e => (
                <div key={e.enrollmentId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{e.slotLabel} <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>{e.slotLevel}</span></div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{money(e.ratePerLesson)}/lesson{e.rateType ? ` · ${e.rateType}` : ''}</div>
                  </div>
                  <button style={btnGhost} onClick={() => setSwitchModal({ enr: e, date: '', newSlotId: '', saving: false })}>🔀 Switch</button>
                </div>
              ))}
            </Section>

            {/* Upcoming lessons (read-only in v1) */}
            <Section title="Upcoming lessons">
              {data.upcoming.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>None scheduled.</div>}
              {data.upcoming.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                  <span style={{ width: 92, color: '#111', fontWeight: 600 }}>{fmtDate(l.date)}</span>
                  <span style={{ flex: 1, color: '#6b7280' }}>{l.slotLabel}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TYPE_COLORS[l.type] || '#475569' }}>{l.type}</span>
                  {l.status !== 'Scheduled' && <span style={{ fontSize: 11, color: '#94a3b8' }}>{l.status}</span>}
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Inline reschedule / mark attendance — coming next.</div>
            </Section>

            {/* Exams */}
            {data.exams.length > 0 && (
              <Section title="Exams">
                {data.exams.map(ex => (
                  <div key={ex.id} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                    <span style={{ fontWeight: 600, color: '#111' }}>{ex.examType}</span>
                    {' · '}<span style={{ color: '#6b7280' }}>{ex.noExam ? 'No exam' : (ex.examDate ? fmtDate(ex.examDate) : 'date TBC')}</span>
                    {ex.testedTopics && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{ex.testedTopics}</div>}
                  </div>
                ))}
              </Section>
            )}

            {/* Invoices */}
            <Section title="Recent invoices" action={<a href="/admin/invoices" style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none' }}>All →</a>}>
              {data.invoices.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>None.</div>}
              {data.invoices.map(inv => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                  <span style={{ width: 110, fontWeight: 600, color: '#111' }}>{inv.month}</span>
                  <span style={{ flex: 1, color: '#6b7280' }}>{money(inv.finalAmount)}{inv.invoiceType && inv.invoiceType !== 'Regular' ? ` · ${inv.invoiceType}` : ''}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: inv.isPaid ? '#15803d' : '#b45309' }}>{inv.isPaid ? 'Paid' : (inv.status || 'Unpaid')}</span>
                  {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'none' }}>📄</a>}
                </div>
              ))}
            </Section>
          </>
        )}
      </div>

      {/* Switch slot modal */}
      {switchModal && (
        <ModalShell title="Switch weekly slot" onClose={() => !switchModal.saving && setSwitchModal(null)}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>From <strong>{switchModal.enr.slotLabel}</strong></div>
          <Label>Start date (first lesson on new slot)</Label>
          <input type="date" style={input} value={switchModal.date} onChange={e => setSwitchModal({ ...switchModal, date: e.target.value })} />
          <Label style={{ marginTop: 12 }}>New slot</Label>
          <SlotSelect slots={data?.slots ?? []} studentLevel={s?.level || ''} excludeId={switchModal.enr.slotId}
            value={switchModal.newSlotId} onChange={v => setSwitchModal({ ...switchModal, newSlotId: v })} />
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 10, lineHeight: 1.5 }}>
            Removes future lessons on the old slot, generates 9 weeks on the new slot, and updates the enrollment. Silent — message the parent yourself.
          </div>
          <div style={modalActions}>
            <button style={btnCancel} onClick={() => setSwitchModal(null)} disabled={switchModal.saving}>Cancel</button>
            <button style={btnPrimary} onClick={submitSwitch} disabled={switchModal.saving || !switchModal.date || !switchModal.newSlotId}>
              {switchModal.saving ? 'Switching…' : 'Switch slot'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* Add weekly slot modal */}
      {addModal && (
        <ModalShell title="Add weekly slot" onClose={() => !addModal.saving && setAddModal(null)}>
          <Label>Slot</Label>
          <SlotSelect slots={data?.slots ?? []} studentLevel={s?.level || ''}
            excludeId={null} value={addModal.slotId} onChange={v => setAddModal({ ...addModal, slotId: v })} />
          <Label style={{ marginTop: 12 }}>Start date (optional — defaults to today)</Label>
          <input type="date" style={input} value={addModal.date} onChange={e => setAddModal({ ...addModal, date: e.target.value })} />
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 10, lineHeight: 1.5 }}>
            Creates a second active enrollment and generates 9 weeks of weekly lessons (rate copied from the existing enrollment).
          </div>
          <div style={modalActions}>
            <button style={btnCancel} onClick={() => setAddModal(null)} disabled={addModal.saving}>Cancel</button>
            <button style={btnPrimary} onClick={submitAddSlot} disabled={addModal.saving || !addModal.slotId}>
              {addModal.saving ? 'Adding…' : 'Add slot'}
            </button>
          </div>
        </ModalShell>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: toast.kind === 'ok' ? '#15803d' : '#dc2626', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return <div><span style={{ color: '#9ca3af' }}>{label}:</span> <span style={{ color: '#111', fontWeight: 600 }}>{value || '—'}</span></div>;
}
function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 5, ...style }}>{children}</div>;
}
function SlotSelect({ slots, studentLevel, excludeId, value, onChange }: { slots: SlotOpt[]; studentLevel: string; excludeId: string | null; value: string; onChange: (v: string) => void }) {
  const avail = slots.filter(s => s.id !== excludeId);
  const same = avail.filter(s => sameLevelSlot(studentLevel, s.level));
  const other = avail.filter(s => !sameLevelSlot(studentLevel, s.level));
  return (
    <select style={input} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select a slot…</option>
      {same.length > 0 && <optgroup label={`Same level${studentLevel ? ` (${studentLevel})` : ''}`}>{same.map(s => <option key={s.id} value={s.id}>{s.label} ({s.level})</option>)}</optgroup>}
      {other.length > 0 && <optgroup label="Other slots">{other.map(s => <option key={s.id} value={s.id}>{s.label} ({s.level})</option>)}</optgroup>}
    </select>
  );
}
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' };
const btnGhost: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1e3a5f', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#fff', background: '#1e3a5f', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' };
const btnCancel: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' };
const modalActions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 };
