'use client';
// /admin/remediation — review + approve fix-it plans (SPEC-REMEDIATION.md).
// Drafts are invisible to students; the Activate button here is the doctrine
// checkpoint (agent drafts, Adrian approves the outward-facing step). Cookie
// admin session rides every fetch; the API double-checks with verifyAdminAuth.
import { useCallback, useEffect, useState } from 'react';

type Plan = {
  id: string; airtable_student_id: string; student_name: string; level: string;
  status: 'draft' | 'active' | 'done' | 'archived';
  report_md: string | null; created_at: string; source_run_ids: string[];
};
type Item = {
  id: string; seq: number; kind: string; loss_class: string; topic: string; skill: string;
  evidence: string[]; material: { bank_qids?: string[]; docx_url?: string; note?: string; reminder?: string };
  clear_rule: { kind: string }; state: string; attempts: number; assignment_ids: string[];
};
// 🧺 The shelf's cross-student "Later" lane (IDEAS.md "wave 2 waiting").
type ShelfEntry = {
  id: string; airtable_student_id: string; student_name: string; topic: string;
  skill_label: string; status: string; marks_lost: number | null; paper_name: string; created_at: string;
};

const STATUS_BADGE: Record<Plan['status'], string> = {
  draft: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  done: 'bg-blue-100 text-blue-800',
  archived: 'bg-slate-100 text-slate-500',
};

export default function RemediationAdmin() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sel, setSel] = useState<{ plan: Plan; items: Item[] } | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [showReport, setShowReport] = useState(false);

  const [later, setLater] = useState<ShelfEntry[]>([]);

  const loadList = useCallback(async () => {
    const r = await fetch('/api/admin/remediation');
    const d = await r.json();
    if (r.ok) setPlans(d.plans ?? []); else setErr(d.error || 'load failed');
    // The Later lane rides the same load; a shelf hiccup never hides the plans.
    try {
      const s = await fetch('/api/admin/shelf');
      const sd = await s.json();
      if (s.ok) setLater(sd.shelf?.waiting ?? []);
    } catch { /* lane stays empty */ }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const open = useCallback(async (id: string) => {
    setErr('');
    const r = await fetch(`/api/admin/remediation?planId=${id}`);
    const d = await r.json();
    if (r.ok) { setSel(d); setShowReport(false); } else setErr(d.error || 'load failed');
  }, []);

  async function act(body: Record<string, unknown>, label: string) {
    setBusy(label); setErr('');
    try {
      const r = await fetch('/api/admin/remediation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `${label} failed`);
      await loadList();
      if (sel) await open(sel.plan.id);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 mb-1">🎯 Game plans</h1>
      <p className="text-sm text-slate-500 mb-4">
        Drafted from marked papers; nothing reaches a student until you Activate it. Activating archives the student&apos;s previous active plan.
      </p>
      {err && <div className="bg-rose-50 text-rose-700 text-sm rounded-lg px-3 py-2 mb-3">{err}</div>}

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="space-y-2">
          {plans.length === 0 && <div className="text-sm text-slate-400">No plans yet — draft one from a student&apos;s marked runs (API action &apos;draft&apos;, or the student profile button when it lands).</div>}
          {plans.map((p) => (
            <button key={p.id} type="button" onClick={() => open(p.id)}
              className={`w-full text-left bg-white rounded-xl border px-3 py-2.5 hover:border-slate-400 transition-colors ${sel?.plan.id === p.id ? 'border-slate-500' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{p.student_name || p.airtable_student_id}</span>
                <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_BADGE[p.status]}`}>{p.status}</span>
              </div>
              <div className="text-[11px] text-slate-400">{p.level} · {new Date(p.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</div>
            </button>
          ))}
        </div>

        <div>
          {!sel && <div className="text-sm text-slate-400 pt-2">Select a plan.</div>}
          {sel && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <div className="font-bold text-slate-900">{sel.plan.student_name || sel.plan.airtable_student_id}</div>
                <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_BADGE[sel.plan.status]}`}>{sel.plan.status}</span>
                <div className="ml-auto flex gap-2">
                  {sel.plan.report_md && (
                    <button type="button" onClick={() => setShowReport(!showReport)} className="text-xs font-semibold text-slate-600 border border-slate-300 rounded-full px-3 py-1 hover:bg-slate-50">
                      {showReport ? 'Hide brief' : '📋 Teaching brief'}
                    </button>
                  )}
                  {sel.plan.status === 'draft' && (
                    <button type="button" disabled={!!busy} onClick={() => act({ action: 'activate', planId: sel.plan.id }, 'activate')}
                      className="text-xs font-bold text-white bg-emerald-600 rounded-full px-3 py-1 hover:bg-emerald-700 disabled:opacity-50">
                      {busy === 'activate' ? 'Activating…' : '✓ Activate — student sees it'}
                    </button>
                  )}
                  {sel.plan.status !== 'archived' && (
                    <button type="button" disabled={!!busy} onClick={() => act({ action: 'archive', planId: sel.plan.id }, 'archive')}
                      className="text-xs font-semibold text-slate-500 border border-slate-300 rounded-full px-3 py-1 hover:bg-slate-50 disabled:opacity-50">
                      Archive
                    </button>
                  )}
                </div>
              </div>

              {showReport && sel.plan.report_md && (
                <pre className="text-xs bg-slate-50 rounded-xl p-3 mb-3 whitespace-pre-wrap font-mono text-slate-700 max-h-80 overflow-y-auto">{sel.plan.report_md}</pre>
              )}

              <ol className="space-y-2">
                {sel.items.map((it) => (
                  <li key={it.id} className="border border-slate-100 rounded-xl px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-slate-400 mt-0.5">{it.seq}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{it.skill}</div>
                        {it.material?.reminder && (
                          <div className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">💡 {it.material.reminder}</div>
                        )}
                        <div className="text-[11px] text-slate-400">
                          {it.kind} · {it.loss_class} · {it.topic || '—'} · {it.evidence.join(', ')}
                          {' · '}
                          {it.material?.bank_qids?.length
                            ? `${it.material.bank_qids.length} bank Qs ready`
                            : it.material?.docx_url ? 'notes attached' : it.clear_rule.kind === 'self_attest' ? 'self-attest (no bank Qs)' : '⚠ no material'}
                          {' · '}
                          {it.kind === 'learn' ? '—' : it.material?.reminder ? '💡 reminder' : '⚠ no reminder'}
                          {' · '}<span className="font-semibold">{it.state}</span>
                          {it.attempts > 0 && ` · ${it.attempts} retr${it.attempts === 1 ? 'y' : 'ies'}`}
                        </div>
                      </div>
                      {sel.plan.status === 'draft' && (
                        <span className="flex gap-2 shrink-0 items-start">
                          {/* Pruning is a choice, not a deletion: 🧺 keeps the
                              diagnosis on the student's shelf with its evidence
                              (wave 2 waiting); ✕ is for items that were wrong. */}
                          <button type="button" disabled={!!busy} onClick={() => act({ action: 'shelve-item', itemId: it.id }, 'shelve')}
                            title="Take it off this plan but keep it — evidence and all — on the student's shelf for a later wave"
                            className="text-xs font-semibold text-violet-600 hover:text-violet-800">🧺 Shelve</button>
                          <button type="button" disabled={!!busy} onClick={() => act({ action: 'remove-item', itemId: it.id }, 'remove')}
                            title="Remove it entirely — nothing is kept"
                            className="text-xs text-rose-500 hover:text-rose-700">✕</button>
                        </span>
                      )}
                      {sel.plan.status === 'active' && it.state !== 'cleared' && it.state !== 'skipped' && (
                        <button type="button" disabled={!!busy} onClick={() => act({ action: 'skip-item', itemId: it.id }, 'skip')}
                          className="text-xs text-slate-400 hover:text-slate-600 shrink-0">skip</button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* 🧺 Later — every topic parked for a future wave, across students.
          Read-only here: the per-student shelf (evidence, done/reopen, "draft
          a plan from these") lives on /admin/students/[id]. */}
      {later.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-slate-700 mb-1">🧺 Later — waiting on the shelf</h2>
          <p className="text-xs text-slate-400 mb-3">
            Deliberately deferred from earlier waves, evidence attached. Open a student to pick their next wave.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {later.map((s) => (
              <a key={s.id} href={`/admin/students/${s.airtable_student_id}`}
                className="block bg-white rounded-xl border border-slate-200 px-3 py-2 hover:border-violet-300 transition-colors">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">{s.student_name || s.airtable_student_id}</span>
                  <span className="text-xs text-slate-500 truncate flex-1">{s.topic}</span>
                  {s.marks_lost != null && <span className="text-[11px] text-rose-600 font-semibold shrink-0">−{s.marks_lost}</span>}
                </div>
                {s.skill_label && <div className="text-[11px] text-slate-400 truncate">{s.skill_label}</div>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
