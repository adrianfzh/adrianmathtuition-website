'use client';

import { useEffect, useState, useCallback } from 'react';
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
  subjects: string[];
  revisionStatus: RevisionStatus;
  revisionSubjects: string[];
  revisionTotal: number;
  revisionInvoiceId: string | null;
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
      await fetchStudents();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
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
  }

  function closeManage() {
    if (reverting) return;
    setManageStudent(null);
    setRevertError('');
    setRevertConfirm(false);
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
        {!loading && !error && filtered.map(student => (
          <StudentCard
            key={student.id}
            student={student}
            onSignup={() => openSignup(student)}
            onOptOut={() => updateStatus(student.id, 'Opted Out')}
            onRemoveOptOut={() => updateStatus(student.id, 'No Response')}
            onManage={() => openManage(student)}
          />
        ))}
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
            </div>

            {revertError && <div className="rs-dialog-error">{revertError}</div>}

            {!revertConfirm ? (
              <div className="rs-dialog-actions">
                <button className="rs-btn-ghost" onClick={closeManage} disabled={reverting}>Close</button>
                <button className="rs-btn-danger" onClick={() => setRevertConfirm(true)}>Revert Sign-up</button>
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
  onSignup,
  onOptOut,
  onRemoveOptOut,
  onManage,
}: {
  student: Student;
  onSignup: () => void;
  onOptOut: () => void;
  onRemoveOptOut: () => void;
  onManage: () => void;
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
      </div>

      {student.revisionStatus === 'Signed Up' && (
        <div className="rs-card-subjects">
          {student.revisionSubjects.join(' + ')} · ${student.revisionTotal.toLocaleString()}
        </div>
      )}

      <div className="rs-card-actions">
        {student.revisionStatus === 'No Response' && (
          <>
            <button className="rs-btn-primary rs-btn-sm" onClick={onSignup}>Sign Up</button>
            <button className="rs-btn-ghost rs-btn-sm" onClick={onOptOut}>Opted Out</button>
          </>
        )}
        {student.revisionStatus === 'Signed Up' && (
          <button className="rs-btn-amber rs-btn-sm" onClick={onManage}>Manage</button>
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
