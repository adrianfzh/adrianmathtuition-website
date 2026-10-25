// 🎯 Fix one — is it working? (SPEC-STUDENT-FIRST.md §Fix one, 22 Oct 2026).
// Pure counts over the last N days for the admin card (/admin/ops, Fix one
// card ← GET /api/admin/fix-one-stats). Real students only — the caller drops
// preview identities before passing rows in.
//   released  — maths papers released in the window
//   opened    — of those, opened by the student within 24 h (a marking:view /
//               marking:open event by the same student in [release, release+24h])
//   shown / answered / correct — distinct runs with a fix:shown / fix:answered /
//               fix:answered{correct:true} event
//   requested — released papers with a Practice Again request within 24 h
// Baseline before Fix one: 6% requested within 24 h, 11% opened the Practice tab.

export type StatsRun = { id: string; student_id: string; released_at: string };
export type StatsEvent = { identity: string; kind: string; created_at: string; detail?: unknown };

export type FixOneStats = {
  days: number;
  released: number;
  opened: number;
  shown: number;
  answered: number;
  correct: number;
  requested: number;
};

const DAY = 86400_000;

export function summariseFixOne(runs: StatsRun[], events: StatsEvent[], days: number): FixOneStats {
  const runIds = new Set(runs.map((r) => r.id));
  const views = new Map<string, number[]>();
  const shown = new Set<string>();
  const answered = new Set<string>();
  const correct = new Set<string>();
  const requests = new Map<string, number>(); // runId → earliest request time

  for (const e of events) {
    const t = Date.parse(e.created_at);
    const d = (e.detail ?? {}) as { runId?: unknown; runIds?: unknown; correct?: unknown };
    if (e.kind === 'marking:view' || e.kind === 'marking:open') {
      const list = views.get(e.identity) ?? [];
      list.push(t);
      views.set(e.identity, list);
    } else if (e.kind === 'fix:shown' && typeof d.runId === 'string' && runIds.has(d.runId)) {
      shown.add(d.runId);
    } else if (e.kind === 'fix:answered' && typeof d.runId === 'string' && runIds.has(d.runId)) {
      answered.add(d.runId);
      if (d.correct === true) correct.add(d.runId);
    } else if (e.kind === 'practice-again:request') {
      const ids = Array.isArray(d.runIds) ? d.runIds : typeof d.runId === 'string' ? [d.runId] : [];
      for (const id of ids) {
        if (typeof id !== 'string') continue;
        const prev = requests.get(id);
        if (prev == null || t < prev) requests.set(id, t);
      }
    }
  }

  let opened = 0;
  let requested = 0;
  for (const r of runs) {
    const at = Date.parse(r.released_at);
    if ((views.get(r.student_id) ?? []).some((t) => t >= at && t <= at + DAY)) opened++;
    const req = requests.get(r.id);
    if (req != null && req >= at && req <= at + DAY) requested++;
  }

  return { days, released: runs.length, opened, shown: shown.size, answered: answered.size, correct: correct.size, requested };
}
