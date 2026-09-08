// lib/auto-release-report.ts — the weekly number (8 Sep 2026). Pure; tested.
// Rows: runs released by the system in the window. A run "changed after" when
// any question carries a triage_override — Adrian corrected a mark after the
// student had it. shouldPause: five or more released and more than one in ten
// changed.
type Row = { id: string; student_name: string | null; paper_name: string | null; released_at: string | null; checked_at: string | null; result_json: unknown };

export type AutoReleaseReport = {
  released: number; changed: number; looked: number;
  changes: { student: string; paper: string; questions: number; delta: number }[];
  shouldPause: boolean; pauseReason: string | null; telegram: string;
};

export function summariseAutoReleases(rows: Row[]): AutoReleaseReport {
  const changes: AutoReleaseReport['changes'] = [];
  let looked = 0;
  for (const r of rows) {
    if (r.checked_at) looked += 1;
    const rj = (r.result_json && typeof r.result_json === 'object') ? r.result_json as { results?: unknown[] } : {};
    let questions = 0, delta = 0;
    for (const q of Array.isArray(rj.results) ? rj.results : []) {
      const ov = (q as { triage_override?: { awarded?: unknown; previous?: unknown } }).triage_override;
      if (!ov || typeof ov !== 'object') continue;
      questions += 1;
      const a = Number(ov.awarded), b = Number(ov.previous);
      if (Number.isFinite(a) && Number.isFinite(b)) delta += a - b;
    }
    if (questions) changes.push({ student: r.student_name || 'A student', paper: r.paper_name || 'a paper', questions, delta });
  }
  const released = rows.length, changed = changes.length;
  const shouldPause = released >= 5 && changed / released > 0.1;
  const pauseReason = shouldPause ? `${changed} of ${released} auto-released papers needed a change this week` : null;
  const lines = [`📊 <b>Auto-release this week</b>: ${released} paper${released === 1 ? '' : 's'} went to students on their own · ${changed} changed by you afterwards · ${looked} looked at.`];
  for (const c of changes.slice(0, 8)) lines.push(`• ${c.student} — ${c.paper}: ${c.questions} question${c.questions === 1 ? '' : 's'} changed (${c.delta >= 0 ? '+' : ''}${c.delta} marks)`);
  if (released && !changed) lines.push('Nothing needed a change.');
  return { released, changed, looked, changes, shouldPause, pauseReason, telegram: lines.join('\n') };
}
