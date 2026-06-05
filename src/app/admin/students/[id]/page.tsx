'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import LessonModal, { type LessonModalLesson } from '@/components/LessonModal';

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
// Slot labels are "Monday 3-5pm" — the first word is the weekday.
function weekdayName(label: string): string { return (label || '').trim().split(/\s+/)[0]; }

interface Enrollment { enrollmentId: string; slotId: string | null; slotLabel: string; slotLevel: string; ratePerLesson: number | null; rateType: string; }
interface UpLesson { id: string; date: string; slotId: string | null; slotLabel: string; type: string; status: string; }
interface Exam { id: string; examType: string; examDate: string; testedTopics: string; noExam: boolean; }
interface Invoice { id: string; month: string; finalAmount: number | null; amountPaid: number | null; isPaid: boolean; status: string; invoiceType: string; pdfUrl: string; }
interface SentInvoice { id: string; subject: string; sentAt: string; toEmail: string; status: string; pdfUrl: string; }
interface SlotOpt { id: string; label: string; level: string; }
interface Contact { name: string; parentName: string; parentEmail: string; parentContact?: string; studentContact?: string; }
interface Profile {
  student: { id: string; name: string; level: string; subjects: string[]; subjectLevel: string; status: string; juneRevision: string };
  enrollments: Enrollment[];
  upcoming: UpLesson[];
  exams: Exam[];
  invoices: Invoice[];
  sentInvoices: SentInvoice[];
  slots: SlotOpt[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function weekdayOf(iso: string): string { return iso ? DAY_NAMES[new Date(iso + 'T00:00:00').getDay()] : ''; }
function fmtDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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
  // Phase 2: lesson actions
  const [reschedModal, setReschedModal] = useState<{ lesson: UpLesson; date: string; slotId: string; saving: boolean } | null>(null);
  const [busyLesson, setBusyLesson] = useState('');
  // Phase 4: contact + exam quick-add
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [examForm, setExamForm] = useState<{ examType: string; examDate: string; topics: string; noExam: boolean; saving: boolean } | null>(null);
  // Phase 3: progress history + lesson modal
  const [history, setHistory] = useState<{ id: string; date: string; type: string; status: string; topicsCovered: string; mood: string; progressLogged: boolean }[]>([]);
  const [lessonModal, setLessonModal] = useState<LessonModalLesson | null>(null);

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

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/progress/students/${studentId}/lessons`, { headers: { Authorization: `Bearer ${savedPw.current}` } });
      if (res.ok) setHistory(((await res.json()).lessons || []).filter((l: any) => l.status === 'Completed' || l.progressLogged));
    } catch { /* non-fatal */ }
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
  useEffect(() => { if (authed && studentId) { fetchProfile(); fetchHistory(); } }, [authed, studentId, fetchProfile, fetchHistory]);

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

  // ── Phase 2: lesson actions ─────────────────────────────────────────────────
  async function markStatus(lesson: UpLesson, status: 'Completed' | 'Absent' | 'Scheduled') {
    setBusyLesson(lesson.id);
    try {
      const res = await fetch(`/api/admin/progress/lessons?id=${lesson.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { Status: status } }),
      });
      if (!res.ok) throw new Error('Failed');
      setData(d => d && { ...d, upcoming: d.upcoming.map(l => l.id === lesson.id ? { ...l, status } : l) });
    } catch { showToast('err', 'Failed to update status'); }
    finally { setBusyLesson(''); }
  }

  async function cancelLesson(lesson: UpLesson) {
    if (!confirm(`Cancel the ${fmtDate(lesson.date)} lesson? This removes it from the schedule.`)) return;
    setBusyLesson(lesson.id);
    try {
      const res = await fetch('/api/admin-schedule/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, action: 'delete', notify: false }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      showToast('ok', 'Lesson cancelled');
      await fetchProfile();
    } catch (e: unknown) { showToast('err', e instanceof Error ? e.message.slice(0, 80) : 'Failed'); }
    finally { setBusyLesson(''); }
  }

  async function submitReschedule() {
    if (!reschedModal || !reschedModal.date || !reschedModal.slotId) return;
    setReschedModal({ ...reschedModal, saving: true });
    try {
      const res = await fetch('/api/admin-schedule/reschedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: reschedModal.lesson.id, newDate: reschedModal.date, newSlotId: reschedModal.slotId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setReschedModal(null);
      showToast('ok', 'Lesson rescheduled');
      await fetchProfile();
    } catch (e: unknown) {
      setReschedModal(m => m && { ...m, saving: false });
      showToast('err', e instanceof Error ? e.message.slice(0, 90) : 'Failed');
    }
  }

  // ── Phase 4: contact + exam quick-add ───────────────────────────────────────
  async function loadContact() {
    setContactLoading(true);
    try {
      const res = await fetch(`/api/admin-schedule/student-contact?id=${studentId}`, { headers: { Authorization: `Bearer ${savedPw.current}` } });
      if (res.ok) setContact(await res.json());
    } catch { showToast('err', 'Failed to load contact'); }
    finally { setContactLoading(false); }
  }

  async function submitExam() {
    if (!examForm || !examForm.examType) return;
    setExamForm({ ...examForm, saving: true });
    try {
      const res = await fetch('/api/admin-schedule/quick-add-exam', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId, examType: examForm.examType, noExam: examForm.noExam,
          examDate: examForm.noExam ? null : (examForm.examDate || null),
          testedTopics: examForm.noExam ? '' : examForm.topics,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setExamForm(null);
      showToast('ok', 'Exam saved');
      await fetchProfile();
    } catch (e: unknown) {
      setExamForm(m => m && { ...m, saving: false });
      showToast('err', e instanceof Error ? e.message.slice(0, 90) : 'Failed');
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
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                {!contact ? (
                  <button style={btnGhost} onClick={loadContact} disabled={contactLoading}>{contactLoading ? 'Loading…' : '👤 Show contact'}</button>
                ) : (
                  <div style={{ fontSize: 13, color: '#374151', display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
                    {contact.parentName && <span><span style={{ color: '#9ca3af' }}>Parent:</span> {contact.parentName}</span>}
                    {contact.parentEmail && <span><span style={{ color: '#9ca3af' }}>Email:</span> {contact.parentEmail}</span>}
                    {contact.parentContact && <span><span style={{ color: '#9ca3af' }}>Parent ☎:</span> {contact.parentContact}</span>}
                    {contact.studentContact && <span><span style={{ color: '#9ca3af' }}>Student ☎:</span> {contact.studentContact}</span>}
                  </div>
                )}
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

            {/* Upcoming lessons with inline actions */}
            <Section title="Upcoming lessons">
              {data.upcoming.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>None scheduled.</div>}
              {data.upcoming.map(l => {
                const busy = busyLesson === l.id;
                const canReschedule = l.type !== 'Revision Sprint' && !!l.slotId;
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14, flexWrap: 'wrap', opacity: busy ? 0.5 : 1 }}>
                    <span style={{ width: 92, color: '#111', fontWeight: 600 }}>{fmtDate(l.date)}</span>
                    <span style={{ flex: 1, minWidth: 80, color: '#6b7280' }}>{l.slotLabel}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TYPE_COLORS[l.type] || '#475569' }}>{l.type}</span>
                    {l.status === 'Completed' && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>✓ Attended</span>}
                    {l.status === 'Absent' && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>✗ Absent</span>}
                    <div style={{ display: 'flex', gap: 4 }}>
                      {l.status !== 'Completed' && <button title="Mark present" style={iconBtn('#16a34a', '#bbf7d0')} disabled={busy} onClick={() => markStatus(l, 'Completed')}>✓</button>}
                      {l.status !== 'Absent' && <button title="Mark absent" style={iconBtn('#dc2626', '#fecaca')} disabled={busy} onClick={() => markStatus(l, 'Absent')}>✗</button>}
                      {(l.status === 'Completed' || l.status === 'Absent') && <button title="Undo" style={iconBtn('#64748b', '#e2e8f0')} disabled={busy} onClick={() => markStatus(l, 'Scheduled')}>↺</button>}
                      {canReschedule && <button title="Reschedule" style={iconBtn('#1d4ed8', '#bfdbfe')} disabled={busy} onClick={() => setReschedModal({ lesson: l, date: '', slotId: '', saving: false })}>🔄</button>}
                      {l.type !== 'Revision Sprint' && <button title="Log progress" style={iconBtn('#7c3aed', '#e9d5ff')} disabled={busy} onClick={() => setLessonModal({ id: l.id, studentId, studentName: s.name, date: l.date, slotId: l.slotId, type: l.type })}>📝</button>}
                      <button title="Cancel lesson" style={iconBtn('#b91c1c', '#fecaca')} disabled={busy} onClick={() => cancelLesson(l)}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </Section>

            {/* Progress history — click to log/edit progress */}
            <Section title="Progress history" action={<a href={`/admin/progress?student=${s.id}`} style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none' }}>Timeline →</a>}>
              {history.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>No logged lessons yet.</div>}
              {history.slice(0, 12).map(h => (
                <button key={h.id} onClick={() => setLessonModal({ id: h.id, studentId, studentName: s.name, date: h.date, slotId: null, type: h.type })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14, width: '100%', background: 'none', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 92, color: '#111', fontWeight: 600 }}>{fmtDate(h.date)}</span>
                  <span style={{ flex: 1, minWidth: 0, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.topicsCovered || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                  {h.mood && <span style={{ fontSize: 15 }}>{h.mood.split(' ')[0]}</span>}
                  {h.progressLogged && <span title="Progress logged" style={{ color: '#16a34a', fontSize: 12 }}>●</span>}
                  <span style={{ color: '#a78bfa', fontSize: 12 }}>📝</span>
                </button>
              ))}
            </Section>

            {/* Exams */}
            <Section title="Exams" action={<button style={btnGhost} onClick={() => setExamForm({ examType: '', examDate: '', topics: '', noExam: false, saving: false })}>＋ Add / update</button>}>
              {data.exams.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>No exams recorded.</div>}
              {data.exams.map(ex => (
                <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, color: '#111' }}>{ex.examType}</span>
                    {' · '}<span style={{ color: '#6b7280' }}>{ex.noExam ? 'No exam' : (ex.examDate ? fmtDate(ex.examDate) : 'date TBC')}</span>
                    {ex.testedTopics && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{ex.testedTopics}</div>}
                  </div>
                  <button style={btnGhost} onClick={() => setExamForm({ examType: ex.examType, examDate: ex.examDate || '', topics: ex.testedTopics || '', noExam: ex.noExam, saving: false })}>Edit</button>
                </div>
              ))}
            </Section>

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

            {/* Every invoice PDF actually emailed to this student */}
            <Section title={`Sent invoice PDFs (${data.sentInvoices.length})`}>
              {data.sentInvoices.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>No invoice emails on record.</div>}
              {data.sentInvoices.map(si => (
                <div key={si.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{si.subject || '(invoice email)'}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDateTime(si.sentAt)}{si.toEmail ? ` · ${si.toEmail}` : ''}{si.status && si.status !== 'sent' ? ` · ${si.status}` : ''}</div>
                  </div>
                  {si.pdfUrl && <a href={si.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none', whiteSpace: 'nowrap' }}>📄 View PDF</a>}
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

      {/* Reschedule modal (one-off move) */}
      {reschedModal && (() => {
        const dayName = weekdayOf(reschedModal.date);
        const daySlots = (data?.slots ?? []).filter(sl => dayName && weekdayName(sl.label) === dayName);
        return (
          <ModalShell title="Reschedule lesson" onClose={() => !reschedModal.saving && setReschedModal(null)}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>From <strong>{fmtDate(reschedModal.lesson.date)} · {reschedModal.lesson.slotLabel}</strong></div>
            <Label>New date</Label>
            <input type="date" style={input} value={reschedModal.date} onChange={e => setReschedModal({ ...reschedModal, date: e.target.value, slotId: '' })} />
            <Label style={{ marginTop: 12 }}>New slot{dayName ? ` on ${dayName}` : ''}</Label>
            {!reschedModal.date ? (
              <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '6px 2px' }}>Pick a date first to see that day&apos;s slots.</div>
            ) : daySlots.length === 0 ? (
              <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '6px 2px' }}>No active slots on {dayName}.</div>
            ) : (
              <SlotSelect slots={daySlots} studentLevel={s?.level || ''} excludeId={null}
                value={reschedModal.slotId} onChange={v => setReschedModal({ ...reschedModal, slotId: v })} />
            )}
            <div style={modalActions}>
              <button style={btnCancel} onClick={() => setReschedModal(null)} disabled={reschedModal.saving}>Cancel</button>
              <button style={btnPrimary} onClick={submitReschedule} disabled={reschedModal.saving || !reschedModal.date || !reschedModal.slotId}>
                {reschedModal.saving ? 'Rescheduling…' : 'Reschedule'}
              </button>
            </div>
          </ModalShell>
        );
      })()}

      {/* Exam quick-add / edit */}
      {examForm && (
        <ModalShell title="Add / update exam" onClose={() => !examForm.saving && setExamForm(null)}>
          <Label>Exam type</Label>
          <select style={input} value={examForm.examType} onChange={e => setExamForm({ ...examForm, examType: e.target.value })}>
            <option value="">Select…</option>
            {['WA1', 'WA2', 'WA3', 'EOY', 'Prelim', 'Promo', 'Mid-Year', 'Final'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 14, color: '#374151' }}>
            <input type="checkbox" checked={examForm.noExam} onChange={e => setExamForm({ ...examForm, noExam: e.target.checked })} />
            No exam this period
          </label>
          {!examForm.noExam && (
            <>
              <Label>Exam date</Label>
              <input type="date" style={input} value={examForm.examDate} onChange={e => setExamForm({ ...examForm, examDate: e.target.value })} />
              <Label style={{ marginTop: 12 }}>Tested topics (comma-separated)</Label>
              <input style={input} value={examForm.topics} placeholder="e.g. Differentiation, Vectors" onChange={e => setExamForm({ ...examForm, topics: e.target.value })} />
            </>
          )}
          <div style={modalActions}>
            <button style={btnCancel} onClick={() => setExamForm(null)} disabled={examForm.saving}>Cancel</button>
            <button style={btnPrimary} onClick={submitExam} disabled={examForm.saving || !examForm.examType}>
              {examForm.saving ? 'Saving…' : 'Save exam'}
            </button>
          </div>
        </ModalShell>
      )}

      {/* Shared progress-logging modal */}
      {lessonModal && (
        <LessonModal
          lesson={lessonModal}
          password={savedPw.current}
          slots={(data?.slots ?? []).map(sl => ({ id: sl.id, time: sl.label }))}
          onClose={() => { setLessonModal(null); fetchHistory(); fetchProfile(); }}
          onProgressLogged={() => { /* refreshed on close */ }}
        />
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
function iconBtn(color: string, border: string): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 6, border: `1px solid ${border}`, background: '#fff', color, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
}
