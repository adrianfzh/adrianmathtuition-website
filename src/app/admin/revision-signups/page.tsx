'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────────

type RevisionStatus = 'No Response' | 'Signed Up' | 'Opted Out';
type FilterChip = 'All' | 'Sec 4' | 'JC2' | 'No Response' | 'Signed Up' | 'Opted Out';

interface Student {
  id: string;
  name: string;
  level: 'Sec 4' | 'JC2';
  parentName: string;
  parentContact: string;
  parentEmail: string;
  subjects: string[];
  revisionStatus: RevisionStatus;
  revisionSubjects: string[];
  revisionTotal: number;
  revisionInvoiceId: string | null;
  revisionInvoiceStatus: string | null;
}

// ── Price config ───────────────────────────────────────────────────────────────

const SUBJECTS_SEC4 = [
  { key: 'EM', label: 'E Math', price: 420, lessons: 6 },
  { key: 'AM', label: 'A Math', price: 560, lessons: 8 },
];

const SUBJECTS_JC2 = [
  { key: 'JC', label: 'H2 Mathematics', price: 640, lessons: 8 },
];

function subjectTotal(subjects: string[], level: string): number {
  if (level === 'JC2') return subjects.includes('JC') ? 640 : 0;
  return subjects.reduce((sum, s) => {
    const found = SUBJECTS_SEC4.find(x => x.key === s);
    return sum + (found?.price ?? 0);
  }, 0);
}

function subjectLabel(subjects: string[]): string {
  return subjects.join(' + ');
}

// ── WhatsApp reminder message ──────────────────────────────────────────────────

function generateWhatsAppMsg(student: Student): string {
  const firstName = student.name.split(' ')[0];

  if (student.level === 'JC2') {
    return [
      `Hi ${firstName}! 👋`,
      ``,
      `Just a heads-up — I'm running June Holiday H2 Math Revision lessons this year (details were sent to your parents via email).`,
      ``,
      `📅 H2 Mathematics — Tuesdays & Fridays, 2–5pm`,
      `8 lessons · 2 Jun – 26 Jun · $640`,
      ``,
      `I'd highly recommend signing up. We'll cover the majority of the H2 Math syllabus — things like integration, vectors, stats, complex numbers, and more. The holidays are genuinely the best window to consolidate everything before the final stretch. If you skip the revision and wait until Term 3, you'll find yourself very tight on time trying to cover all of this alongside school.`,
      ``,
      `Let me know if you'd like to join! 😊`,
    ].join('\n');
  }

  const hasEM = student.subjects.includes('EM');
  const hasAM = student.subjects.includes('AM');

  const lines: string[] = [
    `Hi ${firstName}! 👋`,
    ``,
    `Just a heads-up — I'm running June Holiday Revision lessons this year (details were sent to your parents via email).`,
    ``,
    `📅 Schedule:`,
  ];

  if (hasEM) lines.push(`• E Math — Tues & Fri, 10am–12pm · 6 lessons · 2–19 Jun · $420`);
  if (hasAM) lines.push(`• A Math — Tues & Fri, 1–3pm · 8 lessons · 2–26 Jun · $560`);

  lines.push(``);
  lines.push(`I'd highly recommend signing up — the revision covers the majority of the O-Level syllabus, and the holidays are the most effective time to do this. If you don't revise during the holidays, you'll find yourself very tight on time once school reopens and new topics come in.`);

  if (hasEM && hasAM) {
    lines.push(``);
    lines.push(`If budget is a concern and you're only considering one subject, I'd prioritise the A Math revision — it's the heavier subject with more ground to cover. E Math topics are generally easier to pick up during our regular lessons if needed.`);
  } else if (hasAM && !hasEM) {
    lines.push(``);
    lines.push(`A Math has a lot of ground to cover — these 8 lessons will make a real difference heading into the O-Level year.`);
  }

  lines.push(``);
  lines.push(`Let me know if you'd like to sign up! 😊`);

  return lines.join('\n');
}

// ── Cookie helper ──────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RevisionSignupsPage() {
  const router = useRouter();
  const [adminPw, setAdminPw] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterChip>('No Response');

  // Sign-up dialog
  const [signupStudent, setSignupStudent] = useState<Student | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Manage dialog
  const [manageStudent, setManageStudent] = useState<Student | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState('');
  const [revertConfirm, setRevertConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [customEmailText, setCustomEmailText] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [emailViewMode, setEmailViewMode] = useState<'edit' | 'preview'>('edit');
  const [quickSendingId, setQuickSendingId] = useState<string | null>(null);
  const [quickSendMsg, setQuickSendMsg] = useState<Record<string, string>>({});
  const emailTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auth check
  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw') || getCookie('progress_pw');
    if (!pw) {
      router.replace('/admin');
      return;
    }
    setAdminPw(pw);
  }, [router]);

  const fetchStudents = useCallback(async () => {
    if (!adminPw) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin-revision-list', {
        headers: { Authorization: `Bearer ${adminPw}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStudents(data.students);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [adminPw]);

  useEffect(() => {
    if (adminPw) fetchStudents();
  }, [adminPw, fetchStudents]);

  // Filter
  const filtered = students.filter(s => {
    if (filter === 'All') return true;
    if (filter === 'Sec 4') return s.level === 'Sec 4';
    if (filter === 'JC2') return s.level === 'JC2';
    return s.revisionStatus === filter;
  });

  // Summary
  const signedUp = students.filter(s => s.revisionStatus === 'Signed Up');
  const optedOut = students.filter(s => s.revisionStatus === 'Opted Out');
  const noResponse = students.filter(s => s.revisionStatus === 'No Response');
  const totalRevenue = signedUp.reduce((sum, s) => sum + s.revisionTotal, 0);

  // Open sign-up dialog
  function openSignup(student: Student) {
    setSignupStudent(student);
    setSaveError('');
    // Defaults
    if (student.level === 'JC2') {
      setSelectedSubjects(['JC']);
    } else {
      setSelectedSubjects([]);
    }
  }

  function closeSignup() {
    if (saving) return;
    setSignupStudent(null);
    setSaveError('');
  }

  function toggleSubject(key: string) {
    setSelectedSubjects(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  }

  async function confirmSignup() {
    if (!signupStudent || selectedSubjects.length === 0) return;
    setSaving(true);
    setSaveError('');
    const studentIdForManage = signupStudent.id;
    try {
      const total = subjectTotal(selectedSubjects, signupStudent.level);
      const res = await fetch('/api/admin-revision-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminPw}`,
        },
        body: JSON.stringify({
          studentId: signupStudent.id,
          level: signupStudent.level,
          subjects: selectedSubjects,
          total,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Sign-up failed');
      }
      setSignupStudent(null);
      // Re-fetch and auto-open Manage for the newly signed-up student
      const listRes = await fetch('/api/admin-revision-list', {
        headers: { Authorization: `Bearer ${adminPw}` },
      });
      if (listRes.ok) {
        const data = await listRes.json();
        setStudents(data.students);
        const fresh = (data.students as Student[]).find(s => s.id === studentIdForManage);
        if (fresh) openManage(fresh);
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  // WhatsApp reminder
  const [waStudent, setWaStudent] = useState<Student | null>(null);
  const [waMsg, setWaMsg] = useState('');
  const [waCopied, setWaCopied] = useState(false);

  function openWhatsApp(student: Student) {
    setWaStudent(student);
    setWaMsg(generateWhatsAppMsg(student));
    setWaCopied(false);
  }

  function closeWhatsApp() {
    setWaStudent(null);
    setWaCopied(false);
  }

  async function copyWaMsg() {
    await navigator.clipboard.writeText(waMsg);
    setWaCopied(true);
    setTimeout(() => setWaCopied(false), 2000);
  }

  function waLink(student: Student): string | null {
    const raw = student.parentContact?.replace(/\D/g, '') ?? '';
    if (!raw) return null;
    const num = raw.startsWith('65') ? raw : `65${raw}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(waMsg)}`;
  }

  // Rich-text helpers for email editor
  function getDefaultEmail(student: Student): string {
    return [
      `Dear Parent/Student,`,
      ``,
      `Thank you for signing up for the June 2026 Revision Sprint!`,
      ``,
      `Please find attached the invoice for ${student.name} — $${student.revisionTotal.toLocaleString()}, due by 1 June 2026.`,
      ``,
      `Please disregard the regular June 2026 invoice sent earlier — it has been voided and this invoice replaces it.`,
      ``,
      `To pay, PayNow to 91397985 with reference ${student.name.toUpperCase()} – JUNE 2026.`,
      ``,
      `What you've signed up for:`,
      ...(student.revisionSubjects.includes('EM') ? [`• Sec 4 EM June Holiday Revision Sprint (6 lessons) — $420`] : []),
      ...(student.revisionSubjects.includes('AM') ? [`• Sec 4 AM June Holiday Revision Sprint (8 lessons) — $560`] : []),
      ...(student.revisionSubjects.includes('JC') ? [`• JC2 H2 Math June Holiday Revision Sprint (8 lessons) — $640`] : []),
      ``,
      `Best regards,`,
      `Adrian`,
    ].join('\n');
  }

  function wrapSelection(tag: string) {
    const ta = emailTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = customEmailText ?? (manageStudent ? getDefaultEmail(manageStudent) : '');
    const selected = current.slice(start, end);
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    // Toggle off if already wrapped
    if (selected.startsWith(open) && selected.endsWith(close)) {
      const inner = selected.slice(open.length, selected.length - close.length);
      const next = current.slice(0, start) + inner + current.slice(end);
      setCustomEmailText(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start, start + inner.length); }, 0);
    } else {
      const next = current.slice(0, start) + open + selected + close + current.slice(end);
      setCustomEmailText(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + open.length, start + open.length + selected.length); }, 0);
    }
  }

  // Status update (Opted Out / No Response)
  async function updateStatus(studentId: string, status: 'Opted Out' | 'No Response') {
    const res = await fetch('/api/admin-revision-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminPw}`,
      },
      body: JSON.stringify({ studentId, status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to update status');
      return;
    }
    await fetchStudents();
  }

  // Open manage dialog
  function openManage(student: Student) {
    setManageStudent(student);
    setRevertError('');
    setRevertConfirm(false);
    setSendMsg('');
    setCustomEmailText(null);
    setEmailViewMode('edit');
  }

  function closeManage() {
    if (reverting || sending) return;
    setManageStudent(null);
    setRevertError('');
    setRevertConfirm(false);
    setSendMsg('');
  }

  async function handleSendInvoice() {
    if (!manageStudent?.revisionInvoiceId) return;
    setSending(true); setSendMsg('Generating PDF…');
    try {
      // Step 1: generate PDF and attach to invoice record
      const pdfRes = await fetch('/api/generate-pdf-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminPw}` },
        body: JSON.stringify({ recordIds: [manageStudent.revisionInvoiceId], force: true }),
      });
      if (!pdfRes.ok) throw new Error('PDF generation failed');
      // Step 2: patch custom email message if edited, then send
      setSendMsg('Sending email…');
      if (customEmailText !== null) {
        await fetch(`/api/admin-invoices`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminPw}` },
          body: JSON.stringify({ recordId: manageStudent.revisionInvoiceId, fields: { 'Custom Email Message': customEmailText } }),
        });
      }
      await sendInvoice(manageStudent.revisionInvoiceId);
      setSendMsg('✅ Invoice sent!');
      // Update the stale manageStudent snapshot so the badge flips immediately
      setManageStudent(prev => prev ? { ...prev, revisionInvoiceStatus: 'Sent' } : null);
    } catch (e: unknown) {
      setSendMsg(`❌ ${e instanceof Error ? e.message : 'Send failed'}`);
    } finally {
      setSending(false);
    }
  }

  async function sendInvoice(invoiceId: string) {
    const res = await fetch('/api/send-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminPw}` },
      body: JSON.stringify({ recordIds: [invoiceId] }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Failed to send invoice');
    }
    await fetchStudents();
  }

  async function quickSendInvoice(student: Student) {
    if (!student.revisionInvoiceId) return;
    setQuickSendingId(student.id);
    setQuickSendMsg(prev => ({ ...prev, [student.id]: 'Generating PDF…' }));
    try {
      const pdfRes = await fetch('/api/generate-pdf-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminPw}` },
        body: JSON.stringify({ recordIds: [student.revisionInvoiceId], force: true }),
      });
      if (!pdfRes.ok) throw new Error('PDF generation failed');
      setQuickSendMsg(prev => ({ ...prev, [student.id]: 'Sending email…' }));
      const res = await fetch('/api/send-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminPw}` },
        body: JSON.stringify({ recordIds: [student.revisionInvoiceId] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to send');
      }
      setQuickSendMsg(prev => ({ ...prev, [student.id]: '✅ Sent!' }));
      await fetchStudents();
    } catch (e: unknown) {
      setQuickSendMsg(prev => ({ ...prev, [student.id]: `❌ ${e instanceof Error ? e.message : 'Error'}` }));
    } finally {
      setQuickSendingId(null);
    }
  }

  async function confirmRevert() {
    if (!manageStudent) return;
    setReverting(true);
    setRevertError('');
    try {
      const res = await fetch('/api/admin-revision-revert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminPw}`,
        },
        body: JSON.stringify({ studentId: manageStudent.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Revert failed');
      }
      setManageStudent(null);
      await fetchStudents();
    } catch (e: unknown) {
      setRevertError(e instanceof Error ? e.message : 'Error');
    } finally {
      setReverting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{CSS}</style>

      {/* Header */}
      <div className="rs-header">
        <a href="/admin" className="rs-back">← Admin</a>
        <h1 className="rs-title">June 2026 Revision Sprint</h1>
      </div>

      {/* Filter chips */}
      <div className="rs-chips-wrap">
        <div className="rs-chips">
          {(['All', 'Sec 4', 'JC2', 'No Response', 'Signed Up', 'Opted Out'] as FilterChip[]).map(chip => (
            <button
              key={chip}
              className={`rs-chip${filter === chip ? ' active' : ''}`}
              onClick={() => setFilter(chip)}
            >
              {chip}
              {chip === 'No Response' && noResponse.length > 0 && (
                <span className="rs-chip-count">{noResponse.length}</span>
              )}
              {chip === 'Signed Up' && signedUp.length > 0 && (
                <span className="rs-chip-count" style={{ background: '#16a34a' }}>{signedUp.length}</span>
              )}
              {chip === 'Opted Out' && optedOut.length > 0 && (
                <span className="rs-chip-count" style={{ background: '#dc2626' }}>{optedOut.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="rs-body">
        {loading && <div className="rs-loading">Loading…</div>}
        {error && (
          <div className="rs-error">
            {error}
            <button className="rs-retry" onClick={fetchStudents}>Retry</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="rs-empty">No students in this group.</div>
        )}
        {!loading && !error && (() => {
          const showGroups = filter !== 'Sec 4' && filter !== 'JC2' &&
            filtered.some(s => s.level === 'Sec 4') && filtered.some(s => s.level === 'JC2');
          const groups: { label: string; students: Student[] }[] = showGroups
            ? [
                { label: 'Sec 4', students: filtered.filter(s => s.level === 'Sec 4') },
                { label: 'JC2', students: filtered.filter(s => s.level === 'JC2') },
              ]
            : [{ label: '', students: filtered }];
          return groups.map(group => (
            <div key={group.label}>
              {group.label && <div className="rs-level-header">{group.label}</div>}
              {group.students.map(student => (
                <StudentCard
                  key={student.id}
                  student={student}
                  quickSendMsg={quickSendMsg[student.id] || ''}
                  isSendingQuick={quickSendingId === student.id}
                  onSignup={() => openSignup(student)}
                  onOptOut={() => updateStatus(student.id, 'Opted Out')}
                  onRemoveOptOut={() => updateStatus(student.id, 'No Response')}
                  onManage={() => openManage(student)}
                  onWhatsApp={() => openWhatsApp(student)}
                  onQuickSend={() => quickSendInvoice(student)}
                />
              ))}
            </div>
          ));
        })()}
      </div>

      {/* Bottom summary bar */}
      <div className="rs-summary-bar">
        <span className="rs-summary-item signed">&#10003; {signedUp.length} signed up</span>
        <span className="rs-summary-sep">·</span>
        <span className="rs-summary-item opted">&#10007; {optedOut.length} opted out</span>
        <span className="rs-summary-sep">·</span>
        <span className="rs-summary-item none">? {noResponse.length} no response</span>
        <span className="rs-summary-sep">·</span>
        <span className="rs-summary-item revenue">${totalRevenue.toLocaleString()}</span>
      </div>

      {/* Sign-up dialog */}
      {signupStudent && (
        <div className="rs-overlay" onClick={closeSignup}>
          <div className="rs-dialog" onClick={e => e.stopPropagation()}>
            <div className="rs-dialog-title">Sign up — {signupStudent.name}</div>
            <div className="rs-dialog-sub">{signupStudent.level} · Select subjects</div>

            <div className="rs-subject-list">
              {(signupStudent.level === 'JC2' ? SUBJECTS_JC2 : SUBJECTS_SEC4).map(sub => (
                <label key={sub.key} className="rs-subject-row">
                  <input
                    type="checkbox"
                    checked={selectedSubjects.includes(sub.key)}
                    onChange={() => signupStudent.level === 'JC2' ? undefined : toggleSubject(sub.key)}
                    readOnly={signupStudent.level === 'JC2'}
                  />
                  <span className="rs-subject-label">
                    {sub.label} — {sub.lessons} lessons, ${sub.price}
                  </span>
                </label>
              ))}
            </div>

            <div className="rs-subject-total">
              Total: <strong>${subjectTotal(selectedSubjects, signupStudent.level).toLocaleString()}</strong>
            </div>

            {saveError && <div className="rs-dialog-error">{saveError}</div>}

            <div className="rs-dialog-actions">
              <button className="rs-btn-ghost" onClick={closeSignup} disabled={saving}>Cancel</button>
              <button
                className="rs-btn-primary"
                onClick={confirmSignup}
                disabled={saving || selectedSubjects.length === 0}
              >
                {saving ? <span className="rs-spinner" /> : 'Confirm Sign-up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp reminder dialog */}
      {waStudent && (
        <div className="rs-overlay" onClick={closeWhatsApp}>
          <div className="rs-dialog" onClick={e => e.stopPropagation()}>
            <div className="rs-dialog-title">📱 WhatsApp Reminder</div>
            <div className="rs-dialog-sub">{waStudent.name} · {waStudent.level}</div>

            <textarea
              className="rs-email-textarea"
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 10, minHeight: 260 }}
              value={waMsg}
              onChange={e => setWaMsg(e.target.value)}
              rows={14}
            />

            <div className="rs-dialog-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="rs-btn-ghost" onClick={closeWhatsApp}>Close</button>
              <button className="rs-btn-ghost" onClick={copyWaMsg}>
                {waCopied ? '✅ Copied!' : '📋 Copy'}
              </button>
              {waLink(waStudent) && (
                <a
                  href={waLink(waStudent)!}
                  target="_blank"
                  rel="noreferrer"
                  className="rs-btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  Open WhatsApp →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF preview overlay */}
      {pdfPreviewUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12, background: '#fff' }}>
            <button
              onClick={() => setPdfPreviewUrl(null)}
              style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 600, color: '#1e3a5f', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              ← Back
            </button>
            <span style={{ fontSize: 14, color: '#6b7280', flex: 1 }}>Invoice Preview</span>
            <a href={pdfPreviewUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>Open ↗</a>
          </div>
          <iframe src={pdfPreviewUrl} style={{ flex: 1, width: '100%', border: 'none' }} title="Invoice PDF" />
        </div>
      )}

      {/* Manage dialog */}
      {manageStudent && (
        <div className="rs-overlay" onClick={closeManage}>
          <div className="rs-dialog" onClick={e => e.stopPropagation()}>
            <div className="rs-dialog-title">Manage — {manageStudent.name}</div>
            <div className="rs-dialog-sub">Currently signed up</div>

            <div className="rs-manage-info">
              <div className="rs-manage-row">
                <span className="rs-manage-label">Subjects</span>
                <span>{subjectLabel(manageStudent.revisionSubjects)}</span>
              </div>
              <div className="rs-manage-row">
                <span className="rs-manage-label">Total</span>
                <span>${manageStudent.revisionTotal.toLocaleString()}</span>
              </div>
              <div className="rs-manage-row">
                <span className="rs-manage-label">Invoice</span>
                <span className={`rs-invoice-status-badge rs-invoice-${(manageStudent.revisionInvoiceStatus || 'draft').toLowerCase()}`}>
                  {manageStudent.revisionInvoiceStatus === 'Sent' ? '📧 Sent' :
                   manageStudent.revisionInvoiceStatus === 'Paid' ? '✅ Paid' :
                   manageStudent.revisionInvoiceStatus === 'Approved' ? '✓ Approved' :
                   '— Not sent'}
                </span>
              </div>
            </div>

            {/* Preview PDF */}
            {manageStudent.revisionInvoiceId && (
              <div className="rs-manage-send">
                <button
                  className="rs-btn-ghost rs-btn-sm"
                  onClick={() => setPdfPreviewUrl(`/api/preview-invoice?id=${manageStudent.revisionInvoiceId}`)}
                >
                  📄 Preview PDF
                </button>
              </div>
            )}
            {sendMsg && !sending && <div className="rs-send-msg" style={{ marginTop: 4 }}>{sendMsg}</div>}

            {/* Editable email text */}
            {manageStudent.revisionInvoiceId && (() => {
              const defaultEmail = getDefaultEmail(manageStudent);
              return (
                <details className="rs-email-preview">
                  <summary>📋 Edit email text</summary>
                  {/* Tab row */}
                  <div className="rs-email-tabs">
                    <button
                      className={`rs-email-tab${emailViewMode === 'edit' ? ' active' : ''}`}
                      onClick={() => setEmailViewMode('edit')}
                    >Edit</button>
                    <button
                      className={`rs-email-tab${emailViewMode === 'preview' ? ' active' : ''}`}
                      onClick={() => setEmailViewMode('preview')}
                    >Preview</button>
                    {emailViewMode === 'edit' && (
                      <span className="rs-email-tabs-right">
                        <button className="rs-fmt-btn" title="Bold" onMouseDown={e => { e.preventDefault(); wrapSelection('strong'); }}><strong>B</strong></button>
                        <button className="rs-fmt-btn" title="Italic" onMouseDown={e => { e.preventDefault(); wrapSelection('em'); }}><em>I</em></button>
                        <button className="rs-fmt-btn" title="Underline" onMouseDown={e => { e.preventDefault(); wrapSelection('u'); }}><u>U</u></button>
                      </span>
                    )}
                  </div>
                  {emailViewMode === 'edit' ? (
                    <textarea
                      ref={emailTextareaRef}
                      className="rs-email-textarea"
                      value={customEmailText ?? defaultEmail}
                      onChange={e => setCustomEmailText(e.target.value)}
                      rows={16}
                    />
                  ) : (
                    <div
                      className="rs-email-rendered"
                      dangerouslySetInnerHTML={{
                        __html: `<p>${(customEmailText ?? defaultEmail).trim().replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
                      }}
                    />
                  )}
                  {customEmailText !== null && customEmailText !== defaultEmail && (
                    <button
                      className="rs-reset-email"
                      onClick={() => setCustomEmailText(null)}
                    >↩ Reset to default</button>
                  )}
                </details>
              );
            })()}

            {revertError && <div className="rs-dialog-error">{revertError}</div>}

            {!revertConfirm ? (
              <div className="rs-dialog-actions">
                <button className="rs-btn-ghost" onClick={closeManage} disabled={reverting || sending}>Close</button>
                <button className="rs-btn-ghost rs-btn-danger-outline" onClick={() => setRevertConfirm(true)} disabled={sending}>Revert Sign-up</button>
                {manageStudent.revisionInvoiceId && (
                  <button className="rs-btn-primary" onClick={handleSendInvoice} disabled={sending}>
                    {sending ? sendMsg || 'Working…' : '📧 Send Invoice'}
                  </button>
                )}
              </div>
            ) : (
              <div className="rs-revert-confirm">
                <div className="rs-revert-warning">This will cancel all revision lessons and void the invoice. Are you sure?</div>
                <div className="rs-dialog-actions">
                  <button className="rs-btn-ghost" onClick={() => setRevertConfirm(false)} disabled={reverting}>Cancel</button>
                  <button className="rs-btn-danger" onClick={confirmRevert} disabled={reverting}>
                    {reverting ? <span className="rs-spinner" /> : 'Yes, Revert'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Student card ───────────────────────────────────────────────────────────────

function StudentCard({
  student,
  quickSendMsg,
  isSendingQuick,
  onSignup,
  onOptOut,
  onRemoveOptOut,
  onManage,
  onWhatsApp,
  onQuickSend,
}: {
  student: Student;
  quickSendMsg: string;
  isSendingQuick: boolean;
  onSignup: () => void;
  onOptOut: () => void;
  onRemoveOptOut: () => void;
  onManage: () => void;
  onWhatsApp: () => void;
  onQuickSend: () => void;
}) {
  const levelColor = student.level === 'Sec 4' ? 'blue' : 'purple';
  const statusColor =
    student.revisionStatus === 'Signed Up' ? 'green'
    : student.revisionStatus === 'Opted Out' ? 'red'
    : 'gray';

  return (
    <div className="rs-card">
      <div className="rs-card-top">
        <div className="rs-card-name">{student.name}</div>
        <div className="rs-card-badges">
          <span className={`rs-badge level-${levelColor}`}>{student.level}</span>
          <span className={`rs-badge status-${statusColor}`}>{student.revisionStatus}</span>
        </div>
      </div>

      <div className="rs-card-contact">
        {student.parentName && <span>{student.parentName}</span>}
        {student.parentContact && <span> · {student.parentContact}</span>}
        {student.parentEmail && <span> · {student.parentEmail}</span>}
      </div>

      {student.revisionStatus === 'Signed Up' && (
        <div className="rs-card-subjects">
          <span>{student.revisionSubjects.join(' + ')} · ${student.revisionTotal.toLocaleString()}</span>
          {student.revisionInvoiceStatus && (
            <span className={`rs-invoice-status-badge rs-invoice-${student.revisionInvoiceStatus.toLowerCase()}`}>
              {student.revisionInvoiceStatus === 'Sent' ? '📧 Sent' :
               student.revisionInvoiceStatus === 'Paid' ? '✅ Paid' :
               student.revisionInvoiceStatus === 'Approved' ? '✓ Approved' :
               '— Not sent'}
            </span>
          )}
        </div>
      )}

      <div className="rs-card-actions">
        {student.revisionStatus === 'No Response' && (
          <>
            <button className="rs-btn-primary rs-btn-sm" onClick={onSignup}>Sign Up</button>
            <button className="rs-btn-ghost rs-btn-sm" onClick={onWhatsApp}>📱 Remind</button>
            <button className="rs-btn-ghost rs-btn-sm" onClick={onOptOut}>Opted Out</button>
          </>
        )}
        {student.revisionStatus === 'Signed Up' && (
          <>
            <button className="rs-btn-amber rs-btn-sm" onClick={onManage}>Manage</button>
            {student.revisionInvoiceId && student.revisionInvoiceStatus !== 'Sent' && student.revisionInvoiceStatus !== 'Paid' && (
              <button
                className="rs-btn-primary rs-btn-sm"
                onClick={onQuickSend}
                disabled={isSendingQuick}
              >
                {isSendingQuick ? (quickSendMsg || 'Sending…') : '📧 Send Invoice'}
              </button>
            )}
            {quickSendMsg && !isSendingQuick && (
              <span className="rs-card-send-msg">{quickSendMsg}</span>
            )}
          </>
        )}
        {student.revisionStatus === 'Opted Out' && (
          <>
            <button className="rs-btn-primary rs-btn-sm" onClick={onSignup}>Sign Up</button>
            <button className="rs-btn-ghost rs-btn-sm" onClick={onRemoveOptOut}>Remove Opt-out</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── CSS ────────────────────────────────────────────────────────────────────────

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #111827; }

.rs-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 12px 16px;
}
.rs-back {
  font-size: 13px;
  color: #6b7280;
  text-decoration: none;
  display: block;
  margin-bottom: 4px;
}
.rs-back:hover { color: #1e3a5f; }
.rs-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.rs-chips-wrap {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.rs-chips {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  white-space: nowrap;
}
.rs-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s;
}
.rs-chip.active {
  background: #1e3a5f;
  border-color: #1e3a5f;
  color: #fff;
}
.rs-chip-count {
  background: #ef4444;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  padding: 0 5px;
  min-width: 18px;
  text-align: center;
}
.rs-chip.active .rs-chip-count { background: rgba(255,255,255,0.3); }

.rs-body {
  max-width: 640px;
  margin: 0 auto;
  padding: 12px 16px 100px;
}

.rs-loading { text-align: center; color: #9ca3af; padding: 40px; }
.rs-empty { text-align: center; color: #9ca3af; padding: 40px; }
.rs-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 14px;
  color: #dc2626;
  font-size: 14px;
  margin-bottom: 12px;
}
.rs-retry {
  background: none; border: none; color: #dc2626; text-decoration: underline; cursor: pointer; font-size: 14px; margin-left: 8px;
}

/* Cards */
.rs-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
}
.rs-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.rs-card-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}
.rs-card-badges {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.rs-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.rs-badge.level-blue { background: #dbeafe; color: #1d4ed8; }
.rs-badge.level-purple { background: #ede9fe; color: #7c3aed; }
.rs-badge.status-gray { background: #f3f4f6; color: #6b7280; }
.rs-badge.status-green { background: #dcfce7; color: #15803d; }
.rs-badge.status-red { background: #fef2f2; color: #dc2626; }

.rs-card-contact {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 8px;
}
.rs-card-subjects {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 8px;
}
.rs-card-actions {
  display: flex;
  gap: 8px;
}

/* Buttons */
.rs-btn-primary {
  background: #1e3a5f;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rs-btn-primary:disabled { opacity: 0.45; cursor: default; }
.rs-btn-ghost {
  background: transparent;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.rs-btn-ghost:disabled { opacity: 0.45; cursor: default; }
.rs-btn-ghost:not(:disabled):hover { background: #f9fafb; }
.rs-btn-amber {
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.rs-btn-danger {
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rs-btn-danger:disabled { opacity: 0.45; cursor: default; }
.rs-btn-danger-outline {
  color: #ef4444;
  border-color: #fecaca;
}
.rs-btn-danger-outline:not(:disabled):hover { background: #fef2f2; }
.rs-btn-sm { padding: 7px 13px; font-size: 13px; }

/* Summary bar */
.rs-summary-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  flex-wrap: wrap;
  z-index: 10;
}
.rs-summary-item { font-weight: 600; }
.rs-summary-item.signed { color: #15803d; }
.rs-summary-item.opted { color: #dc2626; }
.rs-summary-item.none { color: #6b7280; }
.rs-summary-item.revenue { color: #1e3a5f; }
.rs-summary-sep { color: #d1d5db; }

/* Dialog / overlay */
.rs-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}
@media (min-width: 520px) {
  .rs-overlay { align-items: center; padding: 24px; }
}
.rs-dialog {
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding: 24px 20px;
  width: 100%;
  max-width: 480px;
}
@media (min-width: 520px) {
  .rs-dialog { border-radius: 20px; }
}
.rs-dialog-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
}
.rs-dialog-sub {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 16px;
}
.rs-subject-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.rs-subject-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  cursor: pointer;
}
.rs-subject-row input[type=checkbox] {
  width: 18px;
  height: 18px;
  accent-color: #1e3a5f;
  flex-shrink: 0;
  cursor: pointer;
}
.rs-subject-label { color: #111827; }
.rs-subject-total {
  font-size: 15px;
  color: #374151;
  margin-bottom: 16px;
}
.rs-dialog-error {
  font-size: 13px;
  color: #dc2626;
  margin-bottom: 12px;
  background: #fef2f2;
  border-radius: 8px;
  padding: 8px 12px;
}
.rs-dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.rs-manage-info {
  background: #f9fafb;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
}
.rs-manage-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #374151;
  padding: 4px 0;
}
.rs-manage-label { color: #9ca3af; font-weight: 500; }

/* Level section header */
.rs-level-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af;
  padding: 10px 2px 4px;
}
.rs-level-header:first-child { padding-top: 0; }

.rs-card-send-msg {
  font-size: 12px;
  color: #6b7280;
  margin-left: 2px;
}

/* Invoice status badge */
.rs-invoice-status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.rs-invoice-draft { background: #f3f4f6; color: #6b7280; }
.rs-invoice-approved { background: #fef9c3; color: #92400e; }
.rs-invoice-sent { background: #dcfce7; color: #15803d; }
.rs-invoice-paid { background: #d1fae5; color: #065f46; }

/* Formatting toolbar */
.rs-format-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #f9fafb;
  border-top: 1px solid #f1f5f9;
}
.rs-fmt-btn {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
  color: #374151;
  line-height: 1.6;
  min-width: 28px;
}
.rs-fmt-btn:hover { background: #f3f4f6; border-color: #d1d5db; }
.rs-fmt-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-left: 4px;
}

/* Email edit/preview tabs */
.rs-email-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 6px 10px;
  background: #f9fafb;
  border-top: 1px solid #f1f5f9;
}
.rs-email-tab {
  background: none;
  border: 1px solid #e5e7eb;
  padding: 3px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
}
.rs-email-tab:first-child { border-radius: 6px 0 0 6px; }
.rs-email-tab:nth-child(2) { border-radius: 0 6px 6px 0; border-left: none; }
.rs-email-tab.active { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
.rs-email-tabs-right {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.rs-email-rendered {
  padding: 12px 14px;
  font-size: 13px;
  color: #374151;
  line-height: 1.7;
  background: #fff;
  border-top: 1px solid #f1f5f9;
  min-height: 120px;
}
.rs-email-rendered p { margin: 0 0 10px; }
.rs-email-rendered p:last-child { margin: 0; }

.rs-manage-send {
  display: flex; align-items: center; gap: 8px;
  margin: 12px 0 4px; flex-wrap: wrap;
}
.rs-send-msg { font-size: 13px; }
.rs-email-preview {
  margin-top: 12px; border: 1px solid #e5e7eb;
  border-radius: 8px; overflow: hidden;
}
.rs-email-preview summary {
  padding: 8px 12px; cursor: pointer; font-size: 13px;
  font-weight: 600; color: #374151; background: #f9fafb;
  list-style: none; user-select: none;
}
.rs-email-preview summary::-webkit-details-marker { display: none; }
.rs-email-textarea {
  width: 100%; padding: 10px 12px; font-size: 13px; line-height: 1.6;
  font-family: inherit; color: #374151; background: #fff;
  border: none; border-top: 1px solid #f1f5f9; resize: vertical;
  outline: none; display: block;
}
.rs-reset-email {
  width: 100%; padding: 6px; font-size: 12px; color: #6b7280;
  background: #f9fafb; border: none; border-top: 1px solid #f1f5f9;
  cursor: pointer; text-align: center;
}
.rs-reset-email:hover { color: #374151; }
.rs-email-body {
  padding: 12px 14px; font-size: 13px; color: #374151;
  line-height: 1.6; background: #fff;
}
.rs-email-body p { margin: 0 0 8px; }
.rs-email-body p:last-child { margin: 0; }

.rs-revert-confirm { margin-top: 8px; }
.rs-revert-warning {
  font-size: 13px;
  color: #374151;
  margin-bottom: 12px;
  padding: 10px;
  background: #fef9c3;
  border-radius: 8px;
}

/* Spinner */
.rs-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: rs-spin 0.7s linear infinite;
}
@keyframes rs-spin { to { transform: rotate(360deg); } }
`;
