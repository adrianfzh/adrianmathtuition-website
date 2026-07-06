'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ensureAdminSession } from '@/lib/admin-client';

type Student = { id: string; name: string; level: string };
type Lesson = {
  id: string; date: string; status: string; type: string;
  slotLabel: string; notes: string; lessonNotes: string;
  topicsCovered: string; mastery: string; mood: string; progressLogged: boolean;
};
type AttendanceData = {
  studentName: string; studentLevel: string;
  total: number; totalPages: number; page: number; perPage: number;
  stats: { total: number; completed: number; absent: number; attended: number };
  lessons: Lesson[];
};

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  Completed:  { label: 'Completed',  bg: '#f0fdf4', color: '#16a34a', icon: '✅' },
  Absent:     { label: 'Absent',     bg: '#fef2f2', color: '#dc2626', icon: '❌' },
  Scheduled:  { label: 'Scheduled',  bg: '#eff6ff', color: '#1d4ed8', icon: '📅' },
  Rescheduled:{ label: 'Rescheduled',bg: '#f0f9ff', color: '#0369a1', icon: '🔄' },
};

const MASTERY_CFG: Record<string, string> = { Strong: '🟢', OK: '🟡', Slow: '🔴' };

export default function AttendancePage() {
  const [search, setSearch]           = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [data, setData]               = useState<AttendanceData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [page, setPage]               = useState(1);
  const [error, setError]             = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Establish the admin session (silently upgrades a legacy cookie); redirect if not authed
  useEffect(() => {
    ensureAdminSession().then(ok => { if (!ok) window.location.href = '/admin'; });
  }, []);

  // Search debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/admin/attendance?search=${encodeURIComponent(search)}`);
        const json = await res.json();
        setSearchResults(json.students || []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAttendance = useCallback(async (studentId: string, p: number) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/attendance?studentId=${studentId}&page=${p}`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectStudent(s: Student) {
    setSelectedStudent(s);
    setSearch(s.name);
    setSearchResults([]);
    setPage(1);
    loadAttendance(s.id, 1);
  }

  function changePage(p: number) {
    setPage(p);
    if (selectedStudent) loadAttendance(selectedStudent.id, p);
  }

  function formatDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  const attendancePct = data
    ? data.stats.total > 0 ? Math.round((data.stats.attended / (data.stats.attended + data.stats.absent)) * 100) : 100
    : 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="att-wrap">
        {/* Header */}
        <div className="att-header">
          <a href="/admin" className="att-back">← Admin</a>
          <span className="att-title">Attendance</span>
        </div>

        {/* Search */}
        <div className="att-search-wrap">
          <div className="att-search-box">
            <input
              className="att-search-input"
              type="text"
              placeholder="Search student…"
              value={search}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) { setSelectedStudent(null); setData(null); } }}
              autoFocus
            />
            {searchLoading && <span className="att-search-spin">⏳</span>}
          </div>
          {searchResults.length > 0 && (
            <div className="att-search-dropdown">
              {searchResults.map(s => (
                <button key={s.id} className="att-search-item" onClick={() => selectStudent(s)}>
                  <span className="att-search-name">{s.name}</span>
                  <span className="att-search-level">{s.level}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && <div className="att-error">{error}</div>}

        {/* Loading */}
        {loading && <div className="att-loading">Loading…</div>}

        {/* Attendance data */}
        {data && !loading && (
          <div className="att-content">
            {/* Student header */}
            <div className="att-student-header">
              <div>
                <div className="att-student-name">{data.studentName}</div>
                <div className="att-student-level">{data.studentLevel}</div>
              </div>
            </div>

            {/* Stats bar */}
            <div className="att-stats">
              <div className="att-stat">
                <div className="att-stat-num">{data.stats.total}</div>
                <div className="att-stat-lbl">Total lessons</div>
              </div>
              <div className="att-stat">
                <div className="att-stat-num" style={{ color: '#16a34a' }}>{data.stats.attended}</div>
                <div className="att-stat-lbl">Attended</div>
              </div>
              <div className="att-stat">
                <div className="att-stat-num" style={{ color: '#dc2626' }}>{data.stats.absent}</div>
                <div className="att-stat-lbl">Absent</div>
              </div>
              <div className="att-stat">
                <div className="att-stat-num" style={{ color: attendancePct >= 80 ? '#16a34a' : attendancePct >= 60 ? '#d97706' : '#dc2626' }}>
                  {data.stats.attended + data.stats.absent > 0 ? `${attendancePct}%` : '—'}
                </div>
                <div className="att-stat-lbl">Attendance</div>
              </div>
            </div>

            {/* Lessons list */}
            <div className="att-list">
              {data.lessons.map(lesson => {
                const cfg = STATUS_CFG[lesson.status] || { label: lesson.status, bg: '#f8fafc', color: '#64748b', icon: '•' };
                return (
                  <div key={lesson.id} className="att-row">
                    <div className="att-row-top">
                      <span className="att-date">{formatDate(lesson.date)}</span>
                      <span className="att-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    <div className="att-row-meta">
                      {lesson.slotLabel && <span className="att-slot">⏰ {lesson.slotLabel}</span>}
                      {lesson.type !== 'Regular' && <span className="att-type">{lesson.type}</span>}
                      {lesson.mastery && <span className="att-mastery">{MASTERY_CFG[lesson.mastery] || ''} {lesson.mastery}</span>}
                      {lesson.mood && <span className="att-mood">{lesson.mood.split(' ')[0]}</span>}
                    </div>
                    {(lesson.topicsCovered || lesson.lessonNotes || lesson.notes) && (
                      <div className="att-row-notes">
                        {lesson.topicsCovered && (
                          <div className="att-topics">
                            📌 {lesson.topicsCovered.split(',').map(t => t.trim()).filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {lesson.lessonNotes && <div className="att-note">📝 {lesson.lessonNotes}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="att-pagination">
                <button className="att-page-btn" onClick={() => changePage(1)} disabled={page === 1}>«</button>
                <button className="att-page-btn" onClick={() => changePage(page - 1)} disabled={page === 1}>‹</button>
                <span className="att-page-info">Page {data.page} of {data.totalPages} · {data.total} lessons</span>
                <button className="att-page-btn" onClick={() => changePage(page + 1)} disabled={page === data.totalPages}>›</button>
                <button className="att-page-btn" onClick={() => changePage(data.totalPages)} disabled={page === data.totalPages}>»</button>
              </div>
            )}
            {data.totalPages === 1 && (
              <div className="att-total">{data.total} lesson{data.total !== 1 ? 's' : ''} total</div>
            )}
          </div>
        )}

        {!data && !loading && !selectedStudent && (
          <div className="att-empty">Search for a student to see their attendance record</div>
        )}
      </div>
    </>
  );
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; color: #1e293b; min-height: 100vh; }

.att-wrap { max-width: 680px; margin: 0 auto; padding-bottom: 40px; }

.att-header { background: #1e3a5f; color: white; padding: 14px 20px; display: flex; align-items: center; gap: 14px; position: sticky; top: 0; z-index: 100; }
.att-back { font-size: 14px; color: rgba(255,255,255,0.65); text-decoration: none; }
.att-back:hover { color: white; }
.att-title { font-size: 20px; font-weight: 700; }

.att-search-wrap { position: relative; padding: 16px; }
.att-search-box { position: relative; }
.att-search-input { width: 100%; padding: 12px 40px 12px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 16px; font-family: inherit; outline: none; background: white; }
.att-search-input:focus { border-color: #1e3a5f; box-shadow: 0 0 0 3px rgba(30,58,95,0.1); }
.att-search-spin { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; }
.att-search-dropdown { position: absolute; left: 16px; right: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 200; overflow: hidden; }
.att-search-item { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: none; border: none; border-bottom: 1px solid #f1f5f9; cursor: pointer; text-align: left; }
.att-search-item:last-child { border-bottom: none; }
.att-search-item:hover { background: #f8fafc; }
.att-search-name { font-size: 15px; font-weight: 500; }
.att-search-level { font-size: 12px; color: #94a3b8; }

.att-error { margin: 0 16px; padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #dc2626; font-size: 14px; }
.att-loading { text-align: center; padding: 40px; color: #94a3b8; font-size: 15px; }
.att-empty { text-align: center; padding: 60px 24px; color: #94a3b8; font-size: 15px; }

.att-content { padding: 0 16px; }

.att-student-header { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.att-student-name { font-size: 22px; font-weight: 700; }
.att-student-level { font-size: 14px; color: #64748b; margin-top: 2px; }

.att-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
.att-stat { background: white; border-radius: 10px; padding: 12px 8px; text-align: center; }
.att-stat-num { font-size: 24px; font-weight: 700; line-height: 1; }
.att-stat-lbl { font-size: 11px; color: #94a3b8; margin-top: 4px; }

.att-list { display: flex; flex-direction: column; gap: 8px; }
.att-row { background: white; border-radius: 10px; padding: 14px; }
.att-row-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.att-date { font-size: 14px; font-weight: 600; }
.att-status-badge { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }
.att-row-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #64748b; }
.att-slot { }
.att-type { background: #eff6ff; color: #1d4ed8; padding: 1px 7px; border-radius: 8px; font-weight: 600; }
.att-mastery { }
.att-mood { }
.att-row-notes { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
.att-topics { font-size: 12px; color: #475569; margin-bottom: 4px; line-height: 1.5; }
.att-note { font-size: 12px; color: #64748b; font-style: italic; }

.att-pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px 0; flex-wrap: wrap; }
.att-page-btn { width: 36px; height: 36px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.att-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.att-page-btn:hover:not(:disabled) { background: #f1f5f9; }
.att-page-info { font-size: 13px; color: #64748b; }
.att-total { text-align: center; padding: 16px; font-size: 13px; color: #94a3b8; }
`;
