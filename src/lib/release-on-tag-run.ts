// Release a finished paper the moment it is tagged — the I/O half of
// lib/release-on-tag.ts (27 Oct 2026). Called after the desk's "+ tag" (the
// mark-paper proxy's set-student) and after the auto-tag sweep tags a run.
// Uses the SAME automatic door as the bot and the sweep —
// mark-triage {release, auto:true, sweep:true}: the auto-release switch, the
// "nothing was marked" refusal and the watch-outs all apply, and `sweep:true`
// makes the site deliver the copy (the bot is not sending one this time).
// The outcome is stamped on result_json.auto_release like every other
// automatic release, so the desk and the sweep read it. Silent: an admin action.
import { getSupabaseAdmin } from './supabase';
import { releaseOnTagVerdict, type TaggedRunRow } from './release-on-tag';

export type ReleaseOnTagResult = { released: boolean; why: string; via?: string };

export async function releaseOnTag(runId: string, by: 'desk' | 'auto-tag' | 'upload'): Promise<ReleaseOnTagResult> {
  const sb = getSupabaseAdmin();
  const { data: row } = await sb.from('paper_marking_runs')
    .select('student_id, released_at, archived_at, annotated_pdf_url, photos_pdf_url, queue_status, result_json')
    .eq('id', runId).maybeSingle();
  const verdict = releaseOnTagVerdict(row as TaggedRunRow | null);
  if (!verdict.go) return { released: false, why: verdict.why };

  const base = process.env.WEBSITE_URL || 'https://www.adrianmathtuition.com';
  const pw = (process.env.ADMIN_PASSWORD || '').trim();
  const at = new Date().toISOString();
  let record: Record<string, unknown>;
  let out: ReleaseOnTagResult;
  try {
    const res = await fetch(`${base}/api/admin/mark-triage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
      body: JSON.stringify({ action: 'release', runId, auto: true, sweep: true }), signal: AbortSignal.timeout(50_000),
    });
    const d = await res.json().catch(() => ({}));
    const one = Array.isArray(d.results) ? d.results[0] : null;
    if (res.ok && one?.released) {
      record = { at, outcome: 'released', via: one.via, on_tag: by, ...(Array.isArray(one.watch) && one.watch.length ? { watch: one.watch } : {}) };
      out = { released: true, why: 'released on tag', via: one.via };
    } else if (res.ok && one && one.released === false) {
      record = { at, outcome: 'refused', note: String(one.note || 'refused').slice(0, 160), on_tag: by };
      out = { released: false, why: `refused: ${one.note}` };
    } else {
      // A failure the sweep retries every 10 min (lib/auto-release-sweep.ts).
      record = { at, outcome: 'failed', note: `HTTP ${res.status}${d.error ? `: ${String(d.error).slice(0, 120)}` : ''}`, on_tag: by };
      out = { released: false, why: String(record.note) };
    }
  } catch (e) {
    record = { at, outcome: 'failed', note: String((e as Error).message).slice(0, 160), on_tag: by };
    out = { released: false, why: String(record.note) };
  }
  try {
    const { data: fresh } = await sb.from('paper_marking_runs').select('result_json').eq('id', runId).maybeSingle();
    const rj = (fresh?.result_json && typeof fresh.result_json === 'object') ? fresh.result_json as Record<string, unknown> : {};
    const prev = (rj.auto_release && typeof rj.auto_release === 'object') ? rj.auto_release as Record<string, unknown> : {};
    await sb.from('paper_marking_runs').update({ result_json: { ...rj, auto_release: { ...record, attempts: Number(prev.attempts || 0) + 1 } } }).eq('id', runId);
  } catch { /* the release itself stands; the stamp is for the desk */ }
  return out;
}
