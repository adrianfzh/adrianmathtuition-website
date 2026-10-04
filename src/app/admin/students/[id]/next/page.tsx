'use client';

// /admin/students/<id>/next — 📌 the student's Next lesson, print-first (5 Oct
// 2026). The same card as the profile's Overview in full: what's next and why
// (or the exam it is preparing for), the PDFs made the night before with a
// Print button each, "Make something for <name>", what the last lesson logged
// itself as, and everything made for them before. Phone first.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import NextLessonCard from '../next-lesson-card';

export default function NextLessonPage() {
  const { id } = useParams<{ id: string }>();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);
  useEffect(() => {
    if (!authed) return;
    fetch(`/api/admin/student-profile?id=${encodeURIComponent(id)}&part=core`).then((r) => r.json()).then((j) => setName(j?.student?.name ?? '')).catch(() => {});
  }, [authed, id]);

  if (authed === null) return null;
  if (!authed) {
    return (
      <main style={{ maxWidth: 420, margin: '60px auto', padding: 16 }}>
        <form onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>📌 Next lesson</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Admin password"
            style={{ width: '100%', padding: '9px 11px', border: '1px solid #d4d4d4', borderRadius: 9, fontSize: 15, marginBottom: 8 }} />
          <button style={{ width: '100%', padding: 10, borderRadius: 9, background: '#111', color: '#fff', border: 0 }}>Enter</button>
        </form>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 60px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>{name || 'Student'}</h1>
        <a href={`/admin/students/${id}`} style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none' }}>← Profile</a>
      </div>
      <NextLessonCard studentId={id} full />
    </main>
  );
}
