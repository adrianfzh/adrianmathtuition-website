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
interface UpLesson { id: string; date: string; slotId: string | null; slotLabel: string; type: string; status: string; isMakeup: boolean; }
interface AttRow { id: string; outcomeLessonId: string; date: string; monthLabel: string; type: string; status: string; rescheduledToDate: string; slotLabel: string; notes: string; }
interface MakeupRow { id: string; date: string; monthLabel: string; status: string; slotLabel: string; makeupForDate: string; isRevision: boolean; }
interface Exam { id: string; examType: string; examDate: string; testedTopics: string; noExam: boolean; }
interface Invoice { id: string; month: string; finalAmount: number | null; amountPaid: number | null; isPaid: boolean; status: string; invoiceType: string; pdfUrl: string; }
interface SentInvoice { id: string; subject: string; sentAt: string; toEmail: string; status: string; pdfUrl: string; }
interface SlotOpt { id: string; label: string; level: string; }
interface Contact { name: string; parentName: string; parentEmail: string; parentContact?: string; studentContact?: string; }
interface MonthPayment { month: string; charge: number; paid: number; open: number; status: 'paid' | 'partial' | 'open' | 'nil'; invoices: { id: string; type: string; pdfUrl: string }[]; }
interface PaymentSummary { months: MonthPayment[]; totalCharged: number; totalPaid: number; outstanding: number; credit: number; }
interface Profile {
  student: { id: string; name: string; level: string; subjects: string[]; subjectLevel: string; status: string; juneRevision: string };
  enrollments: Enrollment[];
  upcoming: UpLesson[];
  attendance: AttRow[];
  makeups: MakeupRow[];
  exams: Exam[];
  invoices: Invoice[];
  payments: PaymentSummary;
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
  Trial: '#15803d', 'Revision Sprint': '#0e7490', 'Revision Makeup': '#c2410c',
};

// Effective outcome of an attendance row. `status` is already the traced final
// outcome of any reschedule chain; `rescheduledToDate` (moved) adds the ↻.
type OutKind = 'done' | 'missed' | 'pending' | 'notcoming' | 'cancelled' | 'scheduled';
function rowOutcome(r: AttRow): { kind: OutKind; moved: boolean } {
  const moved = !!r.rescheduledToDate;
  if (r.status === 'Completed') return { kind: 'done', moved };
  if (r.status === 'Absent') return { kind: 'missed', moved };
  if (r.status === 'Cancelled - Prorated') return { kind: 'notcoming', moved };
  if (r.status === 'Cancelled') return { kind: 'cancelled', moved };
  if (moved) return { kind: 'pending', moved };          // rescheduled, makeup not yet held
  return { kind: 'scheduled', moved };
}
function pipColors(kind: OutKind): { bg: string; fg: string } {
  if (kind === 'done') return { bg: '#E1F5EE', fg: '#0F6E56' };
  if (kind === 'missed') return { bg: '#FCEBEB', fg: '#A32D2D' };
  if (kind === 'pending') return { bg: '#E6F1FB', fg: '#185FA5' };
  return { bg: '#F1EFE8', fg: '#5F5E5A' };                 // notcoming / cancelled / scheduled
}
function dayNum(iso: string): number { return +(iso.split('-')[2] || 0); }

export default function StudentProfilePage() {
  const params = useParams();
  const studentId = (Array.isArray(params.id) ? params.id[0] : params.id) || '';

  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const savedPw = useRef('');

  const [data, setData] = useState<Profile | null>(null);
  // Ad-hoc billing: un-billed Completed Ad-hoc lessons → one Draft invoice on demand.
  const [adhoc, setAdhoc] = useState<{ lessons: { id: string; date: string; charge: number }[]; total: number } | null>(null);
  const [adhocBilling, setAdhocBilling] = useState(false);
  async function loadAdhoc() {
    try {
      const r = await fetch(`/api/admin/bill-adhoc?studentId=${studentId}`, { headers: { Authorization: `Bearer ${savedPw.current}` } });
      if (r.ok) setAdhoc(await r.json());
    } catch { /* non-fatal */ }
  }
  async function billAdhoc() {
    if (adhocBilling) return;
    setAdhocBilling(true);
    try {
      const r = await fetch('/api/admin/bill-adhoc', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedPw.current}` },
        body: JSON.stringify({ studentId }),
      });
      const d = await r.json();
      if (!r.ok) { showToast('err', d.error || 'Failed to bill'); return; }
      showToast('ok', `Draft invoice created — ${d.count} session(s), $${d.total}`);
      loadAdhoc();
    } catch { showToast('err', 'Failed to bill'); }
    finally { setAdhocBilling(false); }
  }
  useEffect(() => { if (authed && studentId) loadAdhoc(); /* eslint-disable-next-line */ }, [authed, studentId]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Discontinue student — one atomic action: end Active enrollments, delete future
  // Scheduled Regular lessons, set Inactive; reports live invoices for review.
  const [discModal, setDiscModal] = useState<{ date: string; saving: boolean } | null>(null);
  const [discResult, setDiscResult] = useState<{ enrollmentsEnded: number; lessonsDeleted: number; invoicesToReview: { id: string; month: string; status: string; amount: number }[] } | null>(null);
  async function discontinue() {
    if (!discModal || discModal.saving) return;
    setDiscModal({ ...discModal, saving: true });
    try {
      const r = await fetch('/api/admin/student-discontinue', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedPw.current}` },
        body: JSON.stringify({ studentId, effectiveDate: discModal.date }),
      });
      const d = await r.json();
      if (!r.ok) { showToast('err', d.error || 'Discontinue failed'); setDiscModal({ ...discModal, saving: false }); return; }
      setDiscResult(d);
      setDiscModal(null);
      showToast('ok', `Discontinued — ${d.enrollmentsEnded} enrollment(s) ended, ${d.lessonsDeleted} future lesson(s) removed`);
      fetchProfile();
    } catch { showToast('err', 'Discontinue failed'); setDiscModal(prev => prev ? { ...prev, saving: false } : prev); }
  }

  // Holiday opt-out — June/Oct/Nov/Dec are optional (billed per attendance).
  // Skipping a date cancels its lesson record (creating it as Cancelled if it
  // doesn't exist yet — durably blocks the generators); unticking restores.
  type OptoutDate = { date: string; slotId: string; slotLabel: string; state: string; lessonId?: string; lockReason?: string; skip: boolean; orig: boolean };
  type OptoutMonth = { label: string; dates: OptoutDate[] };
  const [holidayModal, setHolidayModal] = useState<{ loading: boolean; months: OptoutMonth[]; saving: boolean; noSlots?: boolean } | null>(null);
  async function openHoliday() {
    setHolidayModal({ loading: true, months: [], saving: false });
    try {
      const r = await fetch(`/api/admin/holiday-optout?studentId=${studentId}`, { headers: { Authorization: `Bearer ${savedPw.current}` } });
      const d = await r.json();
      if (!r.ok) { showToast('err', d.error || 'Failed to load'); setHolidayModal(null); return; }
      setHolidayModal({
        loading: false, saving: false, noSlots: d.noSlots,
        months: (d.months || []).map((m: { label: string; dates: Omit<OptoutDate, 'skip' | 'orig'>[] }) => ({
          label: m.label,
          dates: m.dates.map((e) => ({ ...e, skip: e.state === 'skipped', orig: e.state === 'skipped' })),
        })),
      });
    } catch { showToast('err', 'Failed to load'); setHolidayModal(null); }
  }
  async function saveHoliday() {
    if (!holidayModal || holidayModal.saving) return;
    const changes = holidayModal.months.flatMap(m => m.dates.filter(e => e.state !== 'locked' && e.skip !== e.orig).map(e => ({ date: e.date, slotId: e.slotId, skip: e.skip })));
    if (!changes.length) { setHolidayModal(null); return; }
    setHolidayModal({ ...holidayModal, saving: true });
    try {
      const r = await fetch('/api/admin/holiday-optout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedPw.current}` },
        body: JSON.stringify({ studentId, changes }),
      });
      const d = await r.json();
      if (!r.ok) { showToast('err', d.error || 'Failed to save'); setHolidayModal(prev => prev ? { ...prev, saving: false } : prev); return; }
      const parts = [
        d.cancelled ? `${d.cancelled} cancelled` : '', d.created ? `${d.created} pre-blocked` : '',
        d.restored ? `${d.restored} restored` : '', d.removed ? `${d.removed} unblocked` : '',
      ].filter(Boolean).join(', ');
      showToast('ok', `Holiday opt-out saved — ${parts || 'no changes'}`);
      setHolidayModal(null);
      fetchProfile();
    } catch { showToast('err', 'Failed to save'); setHolidayModal(prev => prev ? { ...prev, saving: false } : prev); }
  }
  function toggleOptoutDate(mi: number, di: number) {
    setHolidayModal(prev => {
      if (!prev) return prev;
      const months = prev.months.map((m, i) => i !== mi ? m : { ...m, dates: m.dates.map((e, j) => j !== di || e.state === 'locked' ? e : { ...e, skip: !e.skip }) });
      return { ...prev, months };
    });
  }
  function toggleOptoutMonth(mi: number) {
    setHolidayModal(prev => {
      if (!prev) return prev;
      const m = prev.months[mi];
      const unlocked = m.dates.filter(e => e.state !== 'locked');
      const allSkipped = unlocked.length > 0 && unlocked.every(e => e.skip);
      const months = prev.months.map((mm, i) => i !== mi ? mm : { ...mm, dates: mm.dates.map(e => e.state === 'locked' ? e : { ...e, skip: !allSkipped }) });
      return { ...prev, months };
    });
  }

  // Slot-management modals
  const [switchModal, setSwitchModal] = useState<{ enr: Enrollment; date: string; newSlotId: string; saving: boolean } | null>(null);
  const [addModal, setAddModal] = useState<{ slotId: string; date: string; saving: boolean } | null>(null);
  // Phase 2: lesson actions
  const [reschedModal, setReschedModal] = useState<{ lesson: UpLesson; date: string; slotId: string; saving: boolean } | null>(null);
  const [busyLesson, setBusyLesson] = useState('');
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());   // attendance months expanded to detail
  // Phase 4: contact + exam quick-add
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [inviteState, setInviteState] = useState<'idle' | 'sending'>('idle');
  const [examForm, setExamForm] = useState<{ examType: string; examDate: string; topics: string; noExam: boolean; saving: boolean } | null>(null);
  // Phase 3: progress history + lesson modal
  const [history, setHistory] = useState<{ id: string; date: string; type: string; status: string; topicsCovered: string; mood: string; progressLogged: boolean }[]>([]);
  const [lessonModal, setLessonModal] = useState<LessonModalLesson | null>(null);
  const [tab, setTab] = useState<'overview' | 'billing'>('overview');
  const [glance, setGlance] = useState<Glance | null>(null);

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

  const fetchGlance = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/progress/students/${studentId}/at-a-glance`, { headers: { Authorization: `Bearer ${savedPw.current}` } });
      if (res.ok) { const j = await res.json(); setGlance(j?.error ? null : j); }
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
  useEffect(() => { if (authed && studentId) { fetchProfile(); fetchHistory(); fetchGlance(); } }, [authed, studentId, fetchProfile, fetchHistory, fetchGlance]);

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
      const adj = json.adjustment
        ? ` · ${json.adjustment > 0 ? '+' : ''}$${json.adjustment} ${json.adjustmentMonth} adjustment`
        : '';
      showToast('ok', `Switched to ${json.newSlotName} (${json.created} lessons)${adj}`);
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
  // Set a lesson's status (Completed / Absent / Cancelled - Prorated [= not
  // coming] / Scheduled). Targets the outcome lesson; updates both sections.
  async function setAttStatus(lessonId: string, status: string) {
    setBusyLesson(lessonId);
    setData(d => d && {
      ...d,
      attendance: d.attendance.map(a => a.outcomeLessonId === lessonId ? { ...a, status } : a),
      upcoming: d.upcoming.map(u => u.id === lessonId ? { ...u, status } : u),
    });
    try {
      const res = await fetch(`/api/admin/progress/lessons?id=${lessonId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${savedPw.current}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { Status: status } }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch { showToast('err', 'Failed to update'); fetchProfile(); }
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
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <a href="/admin/schedule" style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none' }}>🗓 Schedule →</a>
                  <button
                    style={btnGhost}
                    disabled={inviteState === 'sending'}
                    onClick={async () => {
                      if (!confirm(`Email a portal invite to ${s.name}'s parent?`)) return;
                      setInviteState('sending');
                      try {
                        const r = await fetch('/api/portal/invite', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedPw.current}` },
                          body: JSON.stringify({ airtableStudentId: studentId }),
                        });
                        const d = await r.json();
                        alert(r.ok ? `✅ Invite sent to ${d.sentTo}` : `❌ ${d.error || 'Failed'}`);
                      } catch { alert('❌ Network error'); }
                      setInviteState('idle');
                    }}
                  >
                    {inviteState === 'sending' ? 'Sending…' : '🎓 Send portal invite'}
                  </button>
                </div>
                {s.status !== 'Inactive' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={openHoliday}
                      style={{ fontSize: 12, fontWeight: 600, color: '#0369a1', background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
                      🏖 Holiday opt-out…
                    </button>
                    <button onClick={() => setDiscModal({ date: new Date().toISOString().slice(0, 10), saving: false })}
                      style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
                      ⏹ Discontinue…
                    </button>
                  </div>
                )}
              </div>
            </Section>

            {/* Discontinue result — invoices needing review */}
            {discResult && discResult.invoicesToReview.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⚠️ Invoices to review (not auto-voided)</div>
                {discResult.invoicesToReview.map(inv => (
                  <div key={inv.id} style={{ color: '#78350f', padding: '2px 0' }}>
                    {inv.month} — ${inv.amount} — <b>{inv.status}</b>{inv.status === 'Sent' ? ' (parent has this — consider messaging them)' : ''}
                  </div>
                ))}
                <a href="/admin/invoices" style={{ fontSize: 12.5, color: '#1d4ed8' }}>Review in Invoices →</a>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['overview', 'billing'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                    border: tab === t ? '1px solid #1d4ed8' : '1px solid #e5e7eb',
                    background: tab === t ? '#eff6ff' : '#fff',
                    color: tab === t ? '#1d4ed8' : '#64748b',
                  }}>
                  {t === 'overview' ? '⭐ Overview' : '💳 Billing & Slots'}
                </button>
              ))}
            </div>

            {/* ── Overview: at a glance ── */}
            <AtAGlanceSection glance={glance} show={tab === 'overview'} />

            {/* Enrollments / slots */}
            <Section title="Weekly slots" show={tab === 'billing'} action={<button style={btnGhost} onClick={() => setAddModal({ slotId: '', date: '', saving: false })}>＋ Add slot</button>}>
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

            {/* Attendance — grouped by month, merged reschedules, missed in red */}
            <Section title="Attendance" show={tab === 'billing'}>
              {data.attendance.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 14 }}>No lessons on record.</div>
              ) : (() => {
                const rows = data.attendance;
                const kindOf = (r: AttRow) => rowOutcome(r).kind;
                const done = rows.filter(r => kindOf(r) === 'done').length;
                const missed = rows.filter(r => kindOf(r) === 'missed').length;
                const madeUp = rows.filter(r => kindOf(r) === 'done' && !!r.rescheduledToDate).length;
                const denom = done + missed;                    // lessons that were actually due
                const rate = denom ? Math.round((done / denom) * 100) : null;
                const next = data.upcoming?.[0];
                const chip = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 8, background: bg, color: fg });
                // Group newest-first (rows already sorted that way).
                const groups: { label: string; rows: AttRow[] }[] = [];
                for (const r of rows) {
                  let g = groups.find(x => x.label === r.monthLabel);
                  if (!g) { g = { label: r.monthLabel, rows: [] }; groups.push(g); }
                  g.rows.push(r);
                }
                const pipTitle = (r: AttRow, k: OutKind) =>
                  k === 'done' ? `Attended${r.rescheduledToDate ? ' (made up ' + fmtDate(r.rescheduledToDate) + ')' : ''}`
                  : k === 'missed' ? `Missed${r.rescheduledToDate ? ' (makeup also missed)' : ''}`
                  : k === 'pending' ? `Rescheduled → ${fmtDate(r.rescheduledToDate)} (pending)`
                  : k === 'notcoming' ? 'Not coming' : k === 'cancelled' ? 'Cancelled' : 'Scheduled';
                return (
                  <>
                    {/* Summary — this-term rate + breakdown + next lesson */}
                    <div style={{ background: '#f8fafc', border: '0.5px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{rate === null ? '—' : rate + '%'}</span>
                        <span style={{ fontSize: 12.5, color: '#64748b' }}>this term · {done} of {denom} effectively attended</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={chip('#E1F5EE', '#0F6E56')}>✓ {done} attended</span>
                        {madeUp > 0 && <span style={chip('#E6F1FB', '#185FA5')}>↻ {madeUp} made up</span>}
                        {missed > 0 && <span style={chip('#FCEBEB', '#A32D2D')}>✗ {missed} missed</span>}
                      </div>
                      {next && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475569', borderTop: '0.5px solid #e2e8f0', paddingTop: 8, marginTop: 10 }}>
                          <span style={{ color: '#94a3b8' }}>Next lesson</span>
                          <span style={{ fontWeight: 700, marginLeft: 'auto' }}>{fmtDate(next.date)} · {next.slotLabel}</span>
                        </div>
                      )}
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: '#64748b', margin: '0 0 14px' }}>
                      {[
                        { c: '#5DCAA5', t: 'attended / made up' },
                        { c: '#85B7EB', t: 'makeup pending' },
                        { c: '#F09595', t: 'missed' },
                      ].map(x => (
                        <span key={x.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: x.c, display: 'inline-block' }} />{x.t}
                        </span>
                      ))}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, border: '1.5px dashed #185FA5', display: 'inline-block' }} />dashed = was rescheduled
                      </span>
                    </div>

                    {/* Month strips — collapsed by default, tap to expand to detail */}
                    {groups.map(g => {
                      const open = openMonths.has(g.label);
                      const gdone = g.rows.filter(r => kindOf(r) === 'done').length;
                      const gmiss = g.rows.filter(r => kindOf(r) === 'missed').length;
                      const gresch = g.rows.filter(r => !!r.rescheduledToDate).length;
                      const sorted = g.rows.slice().sort((a, b) => a.date.localeCompare(b.date));
                      return (
                        <div key={g.label} style={{ marginBottom: 22, paddingBottom: 4, borderBottom: '0.5px solid #f1f5f9' }}>
                          <button
                            onClick={() => setOpenMonths(prev => { const n = new Set(prev); n.has(g.label) ? n.delete(g.label) : n.add(g.label); return n; })}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1e3a5f' }}>{g.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>{gdone} attended</span>
                            {gmiss > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>· {gmiss} missed</span>}
                            {gresch > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>· {gresch} resch.</span>}
                            <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>{open ? '▴' : '▾'}</span>
                          </button>

                          {/* Make-up-needed callout — red boxes are missed lessons not yet rescheduled */}
                          {gmiss > 0 && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#FCEBEB', color: '#A32D2D', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', margin: '6px 0 2px' }}>⚠ {gmiss} to make up</div>
                          )}
                          {/* Main lessons row — real lessons only (cancelled go to their own row below) */}
                          {(() => {
                            const main = sorted.filter(r => { const k = kindOf(r); return k !== 'cancelled' && k !== 'notcoming'; });
                            if (!main.length) return null;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '10px 0 6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', width: 64, flexShrink: 0 }}>Lessons</span>
                                {main.map(r => {
                                  const o = rowOutcome(r); const pc = pipColors(o.kind);
                                  return (
                                    <span key={r.id} title={`${fmtDate(r.date)} · ${pipTitle(r, o.kind)}`}
                                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 32, borderRadius: 7, fontSize: 15, fontWeight: 700, background: pc.bg, color: pc.fg, ...(o.moved ? { border: '1.5px dashed #185FA5' } : {}) }}>
                                      {dayNum(r.date)}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {/* Rescheduled list — one row per moved lesson: original date → makeup date · outcome */}
                          {(() => {
                            const moved = sorted.filter(r => !!r.rescheduledToDate);
                            if (!moved.length) return null;
                            return (
                              <div style={{ margin: '8px 0 4px' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Rescheduled</span>
                                {moved.map(r => {
                                  const k = rowOutcome(r).kind;
                                  const txt = k === 'done' ? '✓ made up' : k === 'missed' ? '✗ makeup missed' : 'makeup pending';
                                  const col = k === 'done' ? '#0F6E56' : k === 'missed' ? '#A32D2D' : '#185FA5';
                                  return (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#334155', padding: '3px 0 3px 8px' }}>
                                      <span style={{ fontWeight: 600 }}>{fmtDate(r.date)}</span>
                                      <span style={{ color: '#94a3b8' }}>→</span>
                                      <span style={{ fontWeight: 600 }}>{fmtDate(r.rescheduledToDate)}</span>
                                      <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: col }}>{txt}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {/* Cancelled row — info only, muted, with reason */}
                          {(() => {
                            const reasonOf = (n: string) => (n || '').replace(/^cancelled\s*[—-]\s*/i, '').trim();
                            const canc = sorted.filter(r => { const k = kindOf(r); return k === 'cancelled' || k === 'notcoming'; });
                            if (!canc.length) return null;
                            const reasons = [...new Set(canc.map(r => reasonOf(r.notes)).filter(Boolean))];
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 4px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 64, flexShrink: 0 }}>Cancelled</span>
                                {canc.map(r => (
                                  <span key={r.id} title={`${fmtDate(r.date)}${reasonOf(r.notes) ? ' · ' + reasonOf(r.notes) : ''}`}
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 24, borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#94a3b8', textDecoration: 'line-through' }}>
                                    {dayNum(r.date)}
                                  </span>
                                ))}
                                {reasons.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>{reasons.join(', ')}</span>}
                              </div>
                            );
                          })()}

                          {/* Detail rows (only when expanded) */}
                          {open && sorted.map(r => {
                            const isMissed = r.status === 'Absent';
                            const isDone = r.status === 'Completed';
                            const isOptOut = r.status === 'Cancelled - Prorated';
                            const isCancelled = r.status === 'Cancelled' || isOptOut;
                            const moved = !!r.rescheduledToDate;
                            const color = isMissed ? '#dc2626' : isDone ? '#15803d' : isCancelled ? '#94a3b8' : moved ? '#1d4ed8' : '#475569';
                            const busy = busyLesson === r.outcomeLessonId;
                            const lid = r.outcomeLessonId;
                            const markable = r.status !== 'Rescheduled';
                            return (
                              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f6f7f9', fontSize: 13.5, flexWrap: 'wrap', opacity: busy ? 0.5 : 1 }}>
                                <span style={{ width: 96, fontWeight: 600, color: isMissed ? '#dc2626' : '#111' }}>{fmtDate(r.date)}</span>
                                <span style={{ flex: 1, minWidth: 70, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.slotLabel}
                                  {r.rescheduledToDate && <span style={{ color: '#1d4ed8' }}> → {fmtDate(r.rescheduledToDate)}</span>}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 78, textAlign: 'right' }}>
                                  {isDone ? `✓ Attended${moved ? ' ↻' : ''}`
                                    : isMissed ? `✗ Missed${moved ? ' ↻' : ''}`
                                    : isOptOut ? 'Not coming'
                                    : isCancelled ? 'Cancelled'
                                    : moved ? '↻ Rescheduled'
                                    : r.status}
                                </span>
                                {markable && (
                                  <div style={{ display: 'flex', gap: 3 }}>
                                    {!isDone && <button title="Attended" style={iconBtn('#16a34a', '#bbf7d0')} disabled={busy} onClick={() => setAttStatus(lid, 'Completed')}>✓</button>}
                                    {!isMissed && <button title="Missed" style={iconBtn('#dc2626', '#fecaca')} disabled={busy} onClick={() => setAttStatus(lid, 'Absent')}>✗</button>}
                                    {!isOptOut && <button title="Not coming (not billed)" style={iconBtn('#64748b', '#e2e8f0')} disabled={busy} onClick={() => setAttStatus(lid, 'Cancelled - Prorated')}>⊘</button>}
                                    {r.status !== 'Scheduled' && <button title="Reset to scheduled" style={iconBtn('#94a3b8', '#e2e8f0')} disabled={busy} onClick={() => setAttStatus(lid, 'Scheduled')}>↺</button>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </Section>

            {/* Upcoming lessons with inline actions */}
            <Section title="Upcoming lessons" show={tab === 'billing'}>
              {data.upcoming.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>None scheduled.</div>}
              {data.upcoming.map(l => {
                const busy = busyLesson === l.id;
                const canReschedule = l.type !== 'Revision Sprint' && !!l.slotId;
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14, flexWrap: 'wrap', opacity: busy ? 0.5 : 1 }}>
                    <span style={{ width: 92, color: '#111', fontWeight: 600 }}>{fmtDate(l.date)}</span>
                    <span style={{ flex: 1, minWidth: 80, color: '#6b7280' }}>{l.slotLabel}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: l.isMakeup ? '#c2410c' : (TYPE_COLORS[l.type] || '#475569') }}>{l.isMakeup ? 'Makeup' : l.type}</span>
                    {l.status === 'Completed' && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>✓ Attended</span>}
                    {l.status === 'Absent' && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>✗ Absent</span>}
                    {l.status === 'Cancelled - Prorated' && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>⊘ Not coming</span>}
                    <div style={{ display: 'flex', gap: 4 }}>
                      {l.status !== 'Completed' && <button title="Mark present" style={iconBtn('#16a34a', '#bbf7d0')} disabled={busy} onClick={() => setAttStatus(l.id, 'Completed')}>✓</button>}
                      {l.status !== 'Absent' && <button title="Mark absent" style={iconBtn('#dc2626', '#fecaca')} disabled={busy} onClick={() => setAttStatus(l.id, 'Absent')}>✗</button>}
                      {l.status !== 'Cancelled - Prorated' && <button title="Not coming (not billed)" style={iconBtn('#64748b', '#e2e8f0')} disabled={busy} onClick={() => setAttStatus(l.id, 'Cancelled - Prorated')}>⊘</button>}
                      {l.status !== 'Scheduled' && <button title="Reset to scheduled" style={iconBtn('#94a3b8', '#e2e8f0')} disabled={busy} onClick={() => setAttStatus(l.id, 'Scheduled')}>↺</button>}
                      {canReschedule && <button title="Reschedule" style={iconBtn('#1d4ed8', '#bfdbfe')} disabled={busy} onClick={() => setReschedModal({ lesson: l, date: '', slotId: '', saving: false })}>🔄</button>}
                      {l.type !== 'Revision Sprint' && <button title="Log progress" style={iconBtn('#7c3aed', '#e9d5ff')} disabled={busy} onClick={() => setLessonModal({ id: l.id, studentId, studentName: s.name, date: l.date, slotId: l.slotId, type: l.type })}>📝</button>}
                      <button title="Cancel lesson" style={iconBtn('#b91c1c', '#fecaca')} disabled={busy} onClick={() => cancelLesson(l)}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </Section>

            {/* Progress history — click to log/edit progress */}
            <Section title="Progress history" show={tab === 'overview'}>
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
            <Section title="Exams" show={tab === 'overview'} action={<button style={btnGhost} onClick={() => setExamForm({ examType: '', examDate: '', topics: '', noExam: false, saving: false })}>＋ Add / update</button>}>
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

            {/* Payment records — true per-month outstanding (own-month charge with
                the carry-forward lump stripped, payments re-attributed oldest-first). */}
            <Section title="Payment records" show={tab === 'billing'}>
              {(() => {
                const p = data.payments;
                if (!p || p.months.length === 0) return <div style={{ color: '#9ca3af', fontSize: 14 }}>No invoices on record.</div>;
                const STAT: Record<string, { label: string; bg: string; fg: string }> = {
                  paid:    { label: '✅ Paid',    bg: '#dcfce7', fg: '#15803d' },
                  partial: { label: '🟡 Partial', bg: '#fef9c3', fg: '#a16207' },
                  open:    { label: '🔴 Unpaid',  bg: '#fee2e2', fg: '#b91c1c' },
                  nil:     { label: '— $0',       bg: '#f1f5f9', fg: '#64748b' },
                };
                return (
                  <>
                    {/* Outstanding banner */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '4px 0 12px' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>Outstanding</span>
                      <span style={{ fontSize: 26, fontWeight: 800, color: p.outstanding > 0.005 ? '#b91c1c' : '#15803d' }}>{money(p.outstanding)}</span>
                      {p.credit > 0.005 && <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>+{money(p.credit)} credit</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                        billed {money(p.totalCharged)} · paid {money(p.totalPaid)}
                      </span>
                    </div>
                    {/* Per-month rows, newest first */}
                    {[...p.months].reverse().map(m => {
                      const s = STAT[m.status] || STAT.open;
                      const pdf = m.invoices.find(i => i.pdfUrl)?.pdfUrl || '';
                      return (
                        <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                          <span style={{ width: 96, fontWeight: 600, color: '#111' }}>{m.month.replace(/ (20\d\d)$/, " '$1").replace(" '20", " '")}</span>
                          <span style={{ width: 120, color: '#6b7280', fontSize: 13 }}>
                            charge {money(m.charge)}
                            {m.status === 'partial' && <span style={{ color: '#a16207' }}> · paid {money(m.paid)}</span>}
                          </span>
                          <span style={{ flex: 1, fontWeight: 700, color: m.open > 0.005 ? '#b91c1c' : '#94a3b8' }}>
                            {m.open > 0.005 ? `owes ${money(m.open)}` : ''}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: s.fg, background: s.bg, padding: '2px 8px', borderRadius: 999 }}>{s.label}</span>
                          {pdf && <a href={pdf} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'none' }}>📄</a>}
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8, lineHeight: 1.45 }}>
                      Per-month view: each month shows its own charge; payments are applied oldest-first. Independent of how invoices were bundled.
                    </div>
                  </>
                );
              })()}
            </Section>

            {/* Ad-hoc lessons ready to bill (Completed, not yet invoiced) */}
            {adhoc && adhoc.lessons.length > 0 && (
              <Section title="Ad-hoc lessons to bill">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14, color: '#374151' }}>
                    <b>{adhoc.lessons.length}</b> completed session{adhoc.lessons.length === 1 ? '' : 's'} · <b>{money(adhoc.total)}</b>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{adhoc.lessons.map(l => l.date).join(', ')}</div>
                  </div>
                  <button onClick={billAdhoc} disabled={adhocBilling}
                    style={{ background: '#a21caf', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: adhocBilling ? 0.5 : 1 }}>
                    {adhocBilling ? 'Billing…' : 'Create draft invoice'}
                  </button>
                </div>
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
      {discModal && (
        <ModalShell title="Discontinue student" onClose={() => !discModal.saving && setDiscModal(null)}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            Ends <strong>{s?.name}</strong>&apos;s lessons in one step. Pick the first day with <strong>no more regular lessons</strong>.
          </div>
          <Label>No regular lessons from</Label>
          <input type="date" style={input} value={discModal.date} onChange={e => setDiscModal({ ...discModal, date: e.target.value })} />
          <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 12, lineHeight: 1.7, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
            This will:<br />
            • End all <b>Active enrollments</b> (End Date = day before)<br />
            • Delete future <b>Scheduled Regular</b> lessons from that date<br />
            • Set the student to <b>Inactive</b><br />
            • List any live invoices from that month for your review (not auto-voided)<br />
            <span style={{ color: '#16a34a' }}>Makeup / rescheduled lessons and history are kept.</span>
          </div>
          <div style={modalActions}>
            <button style={btnCancel} onClick={() => setDiscModal(null)} disabled={discModal.saving}>Cancel</button>
            <button style={{ ...btnPrimary, background: '#b91c1c' }} onClick={discontinue} disabled={discModal.saving || !discModal.date}>
              {discModal.saving ? 'Discontinuing…' : 'Discontinue'}
            </button>
          </div>
        </ModalShell>
      )}

      {holidayModal && (
        <ModalShell title="Holiday opt-out" onClose={() => !holidayModal.saving && setHolidayModal(null)}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            June / Oct / Nov / Dec are <strong>optional months</strong> — billed only for attended lessons.
            Tick the dates <strong>{s?.name}</strong> will <strong>skip</strong>; unticked dates stay on the schedule.
          </div>
          {holidayModal.loading ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, padding: '24px 0' }}>Loading dates…</div>
          ) : holidayModal.noSlots ? (
            <div style={{ fontSize: 13, color: '#64748b', padding: '12px 0' }}>No active weekly slots — nothing to opt out of.</div>
          ) : (
            <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
              {holidayModal.months.map((m, mi) => {
                const unlocked = m.dates.filter(e => e.state !== 'locked');
                const allSkipped = unlocked.length > 0 && unlocked.every(e => e.skip);
                return (
                  <div key={m.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b' }}>{m.label}</span>
                      {unlocked.length > 0 && (
                        <button onClick={() => toggleOptoutMonth(mi)}
                          style={{ fontSize: 11.5, fontWeight: 600, color: allSkipped ? '#b45309' : '#0369a1', background: allSkipped ? '#fef3c7' : '#f0f9ff', border: `1px solid ${allSkipped ? '#fcd34d' : '#bae6fd'}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                          {allSkipped ? 'Skipping whole month — undo' : 'Skip whole month'}
                        </button>
                      )}
                    </div>
                    {m.dates.length === 0 && <div style={{ fontSize: 12.5, color: '#94a3b8' }}>No lesson dates this month.</div>}
                    {m.dates.map((e, di) => {
                      const d = new Date(e.date + 'T00:00:00');
                      const label = d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
                      const locked = e.state === 'locked';
                      return (
                        <label key={`${e.date}|${e.slotId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, cursor: locked ? 'default' : 'pointer', background: e.skip && !locked ? '#fffbeb' : 'transparent', opacity: locked ? 0.55 : 1 }}>
                          <input type="checkbox" checked={locked ? false : e.skip} disabled={locked} onChange={() => toggleOptoutDate(mi, di)} />
                          <span style={{ fontSize: 13, color: '#1e293b', minWidth: 92 }}>{label}</span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>{e.slotLabel}</span>
                          {locked && <span style={{ fontSize: 11.5, color: '#94a3b8', marginLeft: 'auto' }}>{e.lockReason}</span>}
                          {!locked && e.skip && <span style={{ fontSize: 11.5, color: '#b45309', marginLeft: 'auto', fontWeight: 600 }}>skip</span>}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          <div style={modalActions}>
            <button style={btnCancel} onClick={() => setHolidayModal(null)} disabled={holidayModal.saving}>Cancel</button>
            <button style={btnPrimary} onClick={saveHoliday}
              disabled={holidayModal.saving || holidayModal.loading || !holidayModal.months.some(m => m.dates.some(e => e.state !== 'locked' && e.skip !== e.orig))}>
              {holidayModal.saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </ModalShell>
      )}

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
function Section({ title, action, children, show = true }: { title: string; action?: React.ReactNode; children: React.ReactNode; show?: boolean }) {
  if (!show) return null;
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

interface GlanceExam { id: string; examType: string; customName: string; examDate: string; testedTopics: string; resultScore: number | null; resultTotal: number | null; resultGrade: string; noExam: boolean; }
interface Glance {
  upcomingExam: GlanceExam | null;
  exams: GlanceExam[];
  weakTopics: { topic: string; missed: number }[];
  stats: { submissionsMarked: number; submissionsWrong: number };
}
function glanceExamLabel(e: GlanceExam): string { return e.customName?.trim() || e.examType || 'Exam'; }

function AtAGlanceSection({ glance, show }: { glance: Glance | null; show: boolean }) {
  if (!show) return null;
  const g = glance;
  const withResults = (g?.exams || []).filter(e => e.resultScore != null && e.resultTotal);
  return (
    <Section title="At a glance">
      {!g ? (
        <div style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Next exam */}
          {g.upcomingExam && (
            <div>
              <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 3 }}>NEXT EXAM</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                {glanceExamLabel(g.upcomingExam)} · {g.upcomingExam.examDate ? fmtDate(g.upcomingExam.examDate) : ''}
              </div>
              {g.upcomingExam.testedTopics && <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Tests: {g.upcomingExam.testedTopics}</div>}
            </div>
          )}
          {/* Work on next */}
          <div>
            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>WORK ON NEXT</div>
            {g.weakTopics.length === 0 ? (
              <div style={{ fontSize: 13.5, color: '#9ca3af' }}>
                {g.stats.submissionsMarked === 0 ? 'No marked submissions yet — weak topics appear here as work is marked.' : 'No wrong answers recorded. 🎉'}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {g.weakTopics.map(w => (
                    <span key={w.topic} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef2f2', color: '#b91c1c', fontSize: 12.5, fontWeight: 500, padding: '3px 10px', borderRadius: 999 }}>
                      {w.topic}
                      <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 10.5, fontWeight: 700, padding: '0 6px', borderRadius: 999 }}>{w.missed}</span>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>From {g.stats.submissionsWrong} wrong of {g.stats.submissionsMarked} marked · number = times missed.</div>
              </>
            )}
          </div>
          {/* Exam results */}
          {withResults.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>EXAM RESULTS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {withResults.map(e => {
                  const pct = e.resultTotal ? Math.round((e.resultScore! / e.resultTotal) * 100) : null;
                  const color = pct == null ? '#475569' : pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                      <span style={{ fontWeight: 600, color: '#374151', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{glanceExamLabel(e)}</span>
                      <span style={{ fontSize: 12, color: '#9ca3af', width: 78, flexShrink: 0 }}>{e.examDate ? fmtDate(e.examDate) : ''}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 700, color }}>{e.resultScore}/{e.resultTotal}{pct != null ? ` · ${pct}%` : ''}{e.resultGrade ? ` · ${e.resultGrade}` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
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
