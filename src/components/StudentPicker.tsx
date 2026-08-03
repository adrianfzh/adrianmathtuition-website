'use client';
// The ONE student dropdown for admin surfaces (2026-08-04). Before this, each
// page fetched its own list — mark-paper and the batch page both leaned on
// /api/mark-batch/init's GET — and rendered its own <select>. This component
// keeps the NATIVE <select> on purpose: mark-paper lives on Adrian's iPad,
// where the native wheel beats any custom combobox, and a custom dropdown
// would re-fight the focus-vs-fetch race the old eager-load comment in
// mark-paper documented (the native sheet snapshots its options on open).
// What IS shared now: one fetch + module-level cache across every instance on
// the page (data from /api/admin/students-lite), and level <optgroup>s so a
// 60-name list stops being one undifferentiated column.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export type LiteStudent = { id: string; name: string; level: string; status: string };

// One fetch per page load, shared by every picker instance. Reset on failure so
// a transient error doesn't poison the page until reload.
let studentsPromise: Promise<LiteStudent[]> | null = null;
function fetchStudentsOnce(authHeaders?: Record<string, string>): Promise<LiteStudent[]> {
  if (!studentsPromise) {
    studentsPromise = fetch('/api/admin/students-lite', authHeaders ? { headers: authHeaders } : undefined)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`students-lite ${r.status}`))))
      .then((d) => (d.students || []) as LiteStudent[])
      .catch((err) => { studentsPromise = null; throw err; });
  }
  return studentsPromise;
}

const LEVEL_ORDER = ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'JC1', 'JC2'];

export default function StudentPicker({
  value, onChange, authHeaders, placeholder = 'Student…', className, style,
  autoFocus, disabled, onBlur, children,
}: {
  value: string;
  /** Fires with the picked id and the full lite record (null when cleared or unknown). */
  onChange: (id: string, student: LiteStudent | null) => void;
  /** Bearer headers for pages using savedPw auth; cookie-session pages can omit. */
  authHeaders?: Record<string, string>;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  /** Extra <option>s appended after the level groups (e.g. an Ad-hoc entry). */
  children?: ReactNode;
}) {
  const [students, setStudents] = useState<LiteStudent[] | null>(null);
  // Eager-load on mount — a focus-triggered fetch loses the race against the
  // iPad's native picker sheet, which doesn't refresh options once open.
  useEffect(() => {
    let alive = true;
    fetchStudentsOnce(authHeaders)
      .then((s) => { if (alive) setStudents(s); })
      .catch(() => { if (alive) setStudents([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups: [string, LiteStudent[]][] = [];
  if (students) {
    const by: Record<string, LiteStudent[]> = {};
    for (const s of students) (by[s.level || 'Other'] ||= []).push(s);
    const rest = Object.keys(by).filter((l) => !LEVEL_ORDER.includes(l)).sort();
    for (const lv of [...LEVEL_ORDER, ...rest]) {
      if (by[lv]?.length) groups.push([lv, by[lv]]);
    }
  }

  return (
    <select
      value={value}
      className={className}
      style={style}
      autoFocus={autoFocus}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(e) => {
        const id = e.target.value;
        onChange(id, students?.find((s) => s.id === id) || null);
      }}
    >
      <option value="">{students === null ? 'Loading…' : placeholder}</option>
      {groups.map(([lv, list]) => (
        <optgroup key={lv} label={lv}>
          {list.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </optgroup>
      ))}
      {children}
    </select>
  );
}
