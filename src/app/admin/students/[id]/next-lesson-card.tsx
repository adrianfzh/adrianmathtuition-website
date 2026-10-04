'use client';

// 📌 Next lesson — on the student profile's Overview (compact) and on the print
// page /admin/students/<id>/next (full). 5 Oct 2026, Adrian: "where can i see
// this? student profile … best if i can just go to a student relevant tool then
// print what i need or the system is smart enough to suggest what's next".
//
// What it shows: the next lesson, WHAT'S NEXT per subject with the reason (or,
// inside three weeks of an exam, the exam's topics and the next Set papers),
// and READY TO PRINT — the PDFs the night job made (lib/next-lesson-store). Print
// opens the PDF and stamps the item printed, which is what the lesson's auto log
// reads. The full page adds the worksheet box ("Make something for …"),
// everything made for the student, and what the last lesson logged itself as.
import { useCallback, useEffect, useState } from 'react';
import type { MaterialRow, NextLessonPlan, PackRow, LessonRow } from '@/lib/next-lesson-store';

type Data = { student: { id: string; name: string; level: string | null }; lesson: LessonRow | null; pack: PackRow | null; plan: NextLessonPlan; materials: MaterialRow[]; lastLog: PackRow | null };

const C = { ink: '#0f172a', soft: '#64748b', faint: '#94a3b8', line: '#e5e7eb', blue: '#1d4ed8', amber: '#92400e', amberBg: '#fffbeb', green: '#166534' };

function dayWords(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}
function stamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }) : '';
}
const KIND_WORD: Record<string, string> = { practice: 'Practice', warmup: 'Warm-up', set: 'Set paper', 'practice-again': 'Practice Again', chat: 'Made on request' };

function btn(primary = false): React.CSSProperties {
  return {
    padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    border: primary ? '1px solid #1e3a5f' : `1px solid ${C.line}`, background: primary ? '#1e3a5f' : '#fff', color: primary ? '#fff' : '#334155',
  };
}

function Item({ m, onChanged }: { m: MaterialRow; onChanged: () => void }) {
  const href = `/api/admin/student-materials/pdf?id=${m.id}`;
  const act = async (action: string) => {
    await fetch('/api/admin/student-materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, action }) });
    onChanged();
  };
  const print = () => {
    window.open(href, '_blank'); // open first, inside the tap, so a phone does not block it
    void act('printed');
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{m.label || m.title}</div>
        <div style={{ fontSize: 12, color: C.soft }}>
          {KIND_WORD[m.kind] ?? m.kind}
          {m.meta?.count ? ` · ${m.meta.count as number} questions` : ''}
          {m.kind === 'set' && m.meta?.totalMarks ? ` · ${m.meta.totalMarks as number} marks` : ''}
          {m.printed_at ? <span style={{ color: C.green }}> · printed {stamp(m.printed_at)}</span> : m.given_at ? <span style={{ color: C.green }}> · given {stamp(m.given_at)}</span> : ''}
          {m.status !== 'ready' && <span style={{ color: '#b91c1c' }}> · not made: {m.error}</span>}
        </div>
      </div>
      {m.status === 'ready' && <button style={btn(!m.printed_at)} onClick={print}>🖨 Print</button>}
      {m.status === 'ready' && !m.printed_at && !m.given_at && <button style={btn()} title="Handed over without printing here" onClick={() => act('given')}>Given</button>}
      {(m.printed_at || m.given_at) && <button style={{ ...btn(), color: C.faint }} title="Clear printed/given" onClick={() => act('unmark')}>↺</button>}
    </div>
  );
}

export default function NextLessonCard({ studentId, full = false }: { studentId: string; full?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState('');
  const [chatMsg, setChatMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/next-lesson?student=${encodeURIComponent(studentId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [studentId]);
  useEffect(() => { void load(); }, [load]);

  const prepare = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/next-lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student: studentId, action: 'prepare' }) });
      const j = await r.json();
      if (!r.ok) setErr(j.error || `HTTP ${r.status}`);
      await load();
    } finally { setBusy(false); }
  };
  const make = async () => {
    if (ask.trim().length < 3) return;
    setBusy(true); setChatMsg('Making it…');
    try {
      const r = await fetch('/api/admin/worksheet-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student: studentId, request: ask }) });
      const j = await r.json();
      if (j.ok) { setChatMsg(`✓ ${j.material.title} — ${j.material.meta?.count ?? ''} questions, ready below.`); setAsk(''); }
      else setChatMsg(`✗ ${j.error}`);
      await load();
    } finally { setBusy(false); }
  };

  const box: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 14 };
  if (err && !data) return <div style={box}><div style={{ fontSize: 13, color: '#b91c1c' }}>Next lesson: {err}</div></div>;
  if (!data) return <div style={box}><div style={{ fontSize: 13, color: C.faint }}>Next lesson · loading…</div></div>;

  const { plan, lesson, pack } = data;
  const first = data.student.name.split(/\s+/)[0];
  const packItems = pack ? data.materials.filter((m) => m.pack_id === pack.id) : [];
  const others = data.materials.filter((m) => !pack || m.pack_id !== pack.id);
  const recentChat = others.filter((m) => m.source === 'chat' && Date.now() - Date.parse(m.made_at) < 14 * 86_400_000 && !m.printed_at);
  const ready = [...packItems, ...recentChat];

  return (
    <div style={box} data-next-lesson>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          📌 Next lesson{lesson ? ` · ${dayWords(lesson.date)}${lesson.time ? ` ${lesson.time}` : ''}` : ''}
        </div>
        {!full && <a href={`/admin/students/${studentId}/next`} style={{ fontSize: 13, color: C.blue, textDecoration: 'none', fontWeight: 600 }}>Print page →</a>}
      </div>

      {!lesson && <div style={{ fontSize: 13.5, color: C.soft, marginBottom: 8 }}>No lesson booked in the next 45 days.</div>}

      {/* exam season: the exam replaces "what's next" */}
      {plan.exam && (
        <div style={{ background: C.amberBg, border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>
            {plan.exam.subject} {plan.exam.label}{plan.exam.papers.length ? ` (${plan.exam.papers.join(' + ')})` : ''} on {dayWords(plan.exam.date)} — {plan.exam.daysLeft === 0 ? 'today' : `${plan.exam.daysLeft} day${plan.exam.daysLeft === 1 ? '' : 's'} away`}
          </div>
          <div style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>
            {plan.exam.topics.length ? <>Tested: {plan.exam.topics.join(', ')}</> : 'No tested topics keyed for this exam yet.'}
          </div>
          {plan.exam.sets.length > 0 && <div style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>Next paper to sit: {plan.exam.sets.map((s) => `Set ${s.set} ${s.paper}`).join(' and ')}.</div>}
        </div>
      )}

      {/* what's next, per subject */}
      {plan.courses.filter((c) => c.next).map((c) => (
        <div key={c.subject} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 15, color: C.ink }}>
            <span style={{ color: C.soft, fontSize: 12.5, fontWeight: 600 }}>{plan.exam ? `${c.subjectLabel} after the exam` : `${c.subjectLabel} next`} · </span>
            <b>{c.next!.label}</b>
          </div>
          <div style={{ fontSize: 12.5, color: C.soft }}>{c.next!.why}</div>
        </div>
      ))}
      {plan.weak.length > 0 && (
        <div style={{ fontSize: 12.5, color: C.soft, marginBottom: 8 }}>
          Recent mistakes: {plan.weak.slice(0, 3).map((w) => w.topic).join(', ')}
        </div>
      )}

      {/* ready to print */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: '0.04em' }}>READY TO PRINT</div>
          {lesson && <button style={btn()} disabled={busy} onClick={prepare}>{busy ? 'Working…' : pack && packItems.length ? '↻ Remake' : 'Prepare now'}</button>}
        </div>
        {ready.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint, padding: '8px 0' }}>
            {lesson ? 'Nothing made yet — the night before the lesson it is made by itself, or tap Prepare now.' : 'Made the night before each lesson.'}
          </div>
        )}
        {ready.map((m) => <Item key={m.id} m={m} onChanged={load} />)}
      </div>

      {full && (
        <>
          {/* the worksheet box */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: '0.04em', marginBottom: 6 }}>MAKE SOMETHING FOR {first.toUpperCase()}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void make(); }}
                placeholder="10 questions on sine rule, harder ones"
                style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 15 }} />
              <button style={btn(true)} disabled={busy || ask.trim().length < 3} onClick={make}>Make</button>
            </div>
            {chatMsg && <div style={{ fontSize: 13, color: chatMsg.startsWith('✗') ? '#b91c1c' : C.soft, marginTop: 6 }}>{chatMsg}</div>}
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>Bank questions, answers at the back. Kept on {first}&apos;s list below.</div>
          </div>

          {/* the last lesson's auto log */}
          {data.lastLog?.auto_log && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: '0.04em', marginBottom: 4 }}>LAST LESSON · {dayWords(data.lastLog.lesson_date)}</div>
              <div style={{ fontSize: 13.5, color: C.ink }}>
                {data.lastLog.auto_log.empty ? 'Nothing printed or handed in.' : data.lastLog.auto_log.phrases.join(', ')}
              </div>
              <div style={{ fontSize: 12, color: data.lastLog.confirmed_at ? C.green : C.soft }}>
                {data.lastLog.confirmed_at ? `Confirmed${data.lastLog.reply_text ? `: "${data.lastLog.reply_text.slice(0, 120)}"` : ''}` : 'Logged by itself — not confirmed'}
              </div>
            </div>
          )}

          {/* everything made for them */}
          {others.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: '0.04em' }}>MADE FOR {first.toUpperCase()} BEFORE</div>
              {others.filter((m) => !recentChat.includes(m)).slice(0, 25).map((m) => <Item key={m.id} m={m} onChanged={load} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
