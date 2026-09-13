// /admin/students/[id]/app — "Their app, as they see it" (13 Sep 2026). One
// page that mirrors a student's app with the hidden state beside every row:
// papers grouped the way the app groups them, each paper's sheet (who asked,
// where the job is, released, reminders, handed in, marked), hand-ins in
// progress, work from Adrian and from Find, essays, what the student CANNOT
// see (subject gate, held/revoked rows, superseded markings) and the event
// trail. Read-only. Admin session cookie; data from lib/student-app-view.ts.
import Link from 'next/link';
import { cookies } from 'next/headers';
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';
import { loadStudentAppView, type AppPaper, type AppSheet, type AppJob } from '@/lib/student-app-view';
import { codeLabel } from '@/lib/essay-codes';

export const dynamic = 'force-dynamic';

const fmt = (iso: string | null | undefined, withTime = true) => iso
  ? new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
  : '—';
const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

function Chip({ tone, children }: { tone: 'ok' | 'wait' | 'warn' | 'off' | 'info'; children: React.ReactNode }) {
  const cls = { ok: 'bg-emerald-50 text-emerald-800 border-emerald-200', wait: 'bg-amber-50 text-amber-800 border-amber-200', warn: 'bg-rose-50 text-rose-700 border-rose-200', off: 'bg-gray-100 text-gray-600 border-gray-200', info: 'bg-sky-50 text-sky-800 border-sky-200' }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** The sheet's story as one chain of chips — what the student sees, and what they do not. */
function SheetState({ paper }: { paper: AppPaper }) {
  const s: AppSheet | null = paper.sheet;
  const j: AppJob | null = paper.job;
  if (s) {
    const asked = s.compulsory ? `assigned by Adrian ${fmt(s.required_at)}` : `requested by student ${fmt(s.created_at)}`;
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <Chip tone="info">📘 sheet</Chip>
        <span className="text-gray-600">{asked}</span>
        {s.compulsory && <Chip tone="wait">compulsory</Chip>}
        {s.reminder_count > 0 && <Chip tone="wait">nudged ×{s.reminder_count} · last {fmt(s.reminded_at)}</Chip>}
        {s.status === 'assigned' && <Chip tone="wait">student sees: Hand in</Chip>}
        {s.status === 'submitted' && <Chip tone="info">handed in {fmt(s.submitted_at)} · being marked</Chip>}
        {s.status === 'marked' && <Chip tone="ok">handed in {fmt(s.submitted_at)} · marked {fmt(s.marked_at)} · {s.score ?? '?'}/{s.out_of ?? '?'}</Chip>}
        {s.source_run_ids.length > 1 && <span className="text-gray-400">one sheet for {s.source_run_ids.length} papers</span>}
        {s.pdf_url && <a className="text-sky-700 underline" href={s.pdf_url} target="_blank" rel="noreferrer">pdf</a>}
      </div>
    );
  }
  if (j && (j.status === 'queued' || j.status === 'claimed')) {
    return <div className="flex flex-wrap items-center gap-1.5 text-[12px]"><Chip tone="wait">📘 being written · {j.status}{j.stage ? ` · ${j.stage}` : ''}</Chip><span className="text-gray-600">{j.requested_by === 'student' ? 'student requested' : j.requested_by === 'adrian' ? 'Adrian queued' : 'queued'} {fmt(j.created_at)} · student sees: “being written”</span></div>;
  }
  if (j && j.status === 'done' && j.noSheet) {
    return <div className="flex flex-wrap items-center gap-1.5 text-[12px]"><Chip tone="off">📘 no sheet</Chip><span className="text-gray-600">{j.noSheetReason || 'nothing worth practising'} · student sees: “nothing to practise here”</span></div>;
  }
  if (j && j.status === 'done') {
    return <div className="flex flex-wrap items-center gap-1.5 text-[12px]"><Chip tone="wait">📘 written, with Adrian</Chip><span className="text-gray-600">finished {fmt(j.completed_at)} · NOT released yet · student sees: “Adrian is checking it”</span></div>;
  }
  if (j && (j.status === 'failed' || j.status === 'cancelled')) {
    return <div className="flex flex-wrap items-center gap-1.5 text-[12px]"><Chip tone="warn">📘 job {j.status}</Chip><span className="text-gray-600">{fmt(j.created_at)} · student sees the Request button again</span></div>;
  }
  if (paper.isPracticeAgainHandin) return <div className="text-[12px] text-gray-500">a returned Practice Again sheet — no sheet on a sheet</div>;
  return <div className="text-[12px] text-gray-500">no sheet · student sees: <b>Request Practice Again</b> button</div>;
}

function PaperRow({ p, inBundle }: { p: AppPaper; inBundle?: boolean }) {
  return (
    <div className={`py-2.5 ${inBundle ? 'pl-3 border-l-2 border-emerald-200' : ''}`} data-paper={p.id}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-navy">{p.name}</span>
        <span className="text-[12px] text-gray-500">{p.subject ?? 'no subject'} · handed in {fmt(p.created_at, false)} · released {fmt(p.released_at)}</span>
        <span className="text-[12px] font-mono">{p.awarded}/{p.max}</span>
        {p.earlierMarkings > 0 && <Chip tone="off">{p.earlierMarkings} earlier marking{p.earlierMarkings > 1 ? 's' : ''} folded away</Chip>}
        <a className="text-[12px] text-sky-700 underline" href={`/admin/desk?student=${encodeURIComponent(p.name)}`}>desk</a>
        <a className="text-[12px] text-sky-700 underline" href={`/app/marking/${p.id}`} target="_blank" rel="noreferrer">as student</a>
      </div>
      {p.rawName && p.rawName !== p.name && <div className="text-[11px] text-gray-400">typed as “{p.rawName}”</div>}
      <div className="mt-1"><SheetState paper={p} /></div>
      {p.markedSheet && <div className="mt-1 text-[12px] text-gray-600">↳ marked sheet shown under this paper: {p.markedSheet.name} · {p.markedSheet.awarded}/{p.markedSheet.max}</div>}
    </div>
  );
}

export default async function StudentAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  if (!verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value)) {
    return <div className="p-6 text-sm">Sign in on <Link className="underline" href="/admin">/admin</Link> first, then come back to this page.</div>;
  }
  const v = await loadStudentAppView(id);
  const a = v.account;
  const statusTone = (s: string) => (s === 'marked' ? 'ok' : s === 'submitted' ? 'info' : s === 'assigned' ? 'wait' : 'off') as 'ok' | 'info' | 'wait' | 'off';

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <Link href={`/admin/students/${id}`} className="text-[12px] text-gray-500 hover:text-navy">‹ student</Link>
          <h1 className="text-xl font-bold text-navy">📱 {a?.display_name ?? id} — their app, as they see it</h1>
          <div className="text-[12px] text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {a ? (
              <>
                <span>{a.email}</span>
                <span>level {a.level ?? '—'}</span>
                <span>subjects shown: <b>{v.subjectsAllowed.join(', ') || 'none'}</b></span>
                <span>last seen {fmt(a.last_seen_at)} {ago(a.last_seen_at)}</span>
                <span>{a.telegram_chat_id ? 'Telegram linked' : 'no Telegram'}</span>
                <span>{v.pushSubscriptions} push device{v.pushSubscriptions === 1 ? '' : 's'}</span>
                {a.deactivated_at && <Chip tone="warn">deactivated {fmt(a.deactivated_at)}</Chip>}
                {v.failedHandins > 0 && <Chip tone="warn">{v.failedHandins} failed hand-in{v.failedHandins > 1 ? 's' : ''} in the trail</Chip>}
              </>
            ) : <Chip tone="warn">no app account for this identity — nothing is visible to them</Chip>}
          </div>
        </div>

        {v.pending.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Hand-ins in progress (student sees “being marked”)</h2>
            {v.pending.map(p => (
              <div key={p.id} className="text-sm py-1 flex flex-wrap gap-x-3"><span className="font-semibold text-navy">{p.paper_name ?? 'untitled'}</span><span className="text-gray-500 text-[12px]">{p.num_photos ?? '?'} pages · {fmt(p.created_at)} · queue: {p.queue_status ?? '—'}</span></div>
            ))}
          </section>
        )}

        <section className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Papers — grouped exactly as the app lists them ({v.entries.length} cards)</h2>
          <p className="text-[12px] text-gray-500 mb-2">A green frame = one merged sheet covering those papers, one card in the app. Under each paper: its Practice Again state and what the student sees for it.</p>
          {v.entries.length === 0 && <p className="text-sm text-gray-500">Nothing released to this student.</p>}
          <div className="divide-y divide-gray-100">
            {v.entries.map(e => e.kind === 'paper'
              ? <PaperRow key={e.paper.id} p={e.paper} />
              : (
                <div key={e.sheetId} className="py-2.5" data-bundle={e.sheetId}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">one card · {e.papers.length} papers · one merged sheet</div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 divide-y divide-emerald-100">
                    {e.papers.map(p => <PaperRow key={p.id} p={p} inBundle />)}
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">From Adrian · Find a question · Pages ({v.assignments.length})</h2>
          {v.assignments.length === 0 && <p className="text-sm text-gray-500">Nothing assigned.</p>}
          {v.assignments.map(w => (
            <div key={w.id} className="py-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm border-t border-gray-100 first:border-0">
              <Chip tone={statusTone(w.status)}>{w.status}</Chip>
              <span className="text-[11px] text-gray-400">{w.kind}{w.source && w.source !== 'adrian' ? ` · ${w.source}${w.find_tier ? ` · ${w.find_tier}` : ''}` : ''}</span>
              <span className="text-navy">{w.title ?? '(untitled)'}</span>
              <span className="text-[12px] text-gray-500">assigned {fmt(w.created_at, false)}{w.due_on ? ` · due ${w.due_on}` : ''}{w.submitted_at ? ` · handed in ${fmt(w.submitted_at)}` : ''}{w.marked_at ? ` · marked ${w.marked_at ? fmt(w.marked_at) : ''} ${w.score ?? ''}${w.out_of != null ? `/${w.out_of}` : ''}` : ''}{w.reminder_count ? ` · nudged ×${w.reminder_count}` : ''}</span>
            </div>
          ))}
        </section>

        {v.essays.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Essays ({v.essays.length})</h2>
            {v.essays.map(e => {
              const t = (e.bands as { total?: { min: number; max: number; out_of: number } } | null)?.total;
              return (
                <div key={e.id} className="py-1.5 flex flex-wrap items-baseline gap-x-2 text-sm border-t border-gray-100 first:border-0">
                  <Chip tone={e.status === 'marked' ? 'ok' : e.status === 'held' || e.status === 'failed' ? 'warn' : 'wait'}>{e.status}</Chip>
                  <Link href={`/app/languages/${e.id}`} className="text-navy underline">{(e.question ?? codeLabel('english', e.essay_kind)).slice(0, 70)}</Link>
                  <span className="text-[12px] text-gray-500">{fmt(e.created_at)}{t ? ` · ${t.min}–${t.max}/${t.out_of}` : ''}{e.released_at ? '' : e.status === 'marked' ? ' · not released' : ''}</span>
                </div>
              );
            })}
          </section>
        )}

        {(v.hiddenBySubject.length > 0 || v.hiddenAssignments.length > 0 || v.earlier.length > 0) && (
          <section className="bg-amber-50/60 rounded-2xl border border-amber-100 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">What the student cannot see</h2>
            {v.hiddenBySubject.map(h => <div key={h.id} className="text-sm py-1">🚫 <b>{h.name}</b> — released, but hidden by the subject gate ({h.subject ?? 'no subject'} is not in {v.subjectsAllowed.join(', ') || 'their subjects'}). Fix the paper&apos;s subject on the desk, or their subjects in Airtable.</div>)}
            {v.hiddenAssignments.map(w => <div key={w.id} className="text-sm py-1">🚫 <b>{w.title ?? w.kind}</b> — {w.status}{w.revoked_at ? ` ${fmt(w.revoked_at)}` : ''} ({w.source ?? 'adrian'} · {w.kind})</div>)}
            {v.earlier.map(e => <div key={e.id} className="text-sm py-1">🗂 <b>{e.name}</b> — an earlier marking ({e.awarded}/{e.max}), folded under “Earlier markings” at the foot of their Papers list.</div>)}
          </section>
        )}

        <section className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recent activity (last {v.events.length})</h2>
          {v.events.length === 0 && <p className="text-sm text-gray-500">No app events recorded.</p>}
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
            {v.events.map((e, i) => (
              <div key={i} className="contents"><span className="text-gray-400 whitespace-nowrap">{fmt(e.created_at)}</span><span className="text-gray-700">{e.kind}{e.detail ? ` · ${JSON.stringify(e.detail).slice(0, 120)}` : ''}</span></div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
