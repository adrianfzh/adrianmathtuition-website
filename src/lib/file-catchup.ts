// The filing catch-up — a released paper that never reached its Dropbox folder.
//
// Adrian, 10 Sep 2026: "kiara should have an em tys 2022 p2 → but i don't see it
// in dropbox?" Her paper was marked, the images PDF was built and is still in the
// private store, the run was released to her at 06:57 — and
// /Students/Kiara Tan Jia Min/ has no 2026-09-09 folder at all.
//
// The marked copy is filed by ONE fail-soft HTTP call: the bot's deliverQueuedRun
// posts the images PDF to /api/admin/mark-paper-dropbox once, and on any failure
// logs "[mark-queue] dropbox file failed" and carries on. There is no retry, no
// Telegram line, and nothing downstream ever looks again — so a single 429, 5xx
// or timed-out upload loses the paper from the tray silently, and the only trace
// is dropbox_path IS NULL. It is rare (4 real runs since launch: Kiara and Tin
// Tze Hin on 9 Sep, Kassandra 8 Sep, Alessi 30 Aug) and completely invisible,
// which is the worst combination: Adrian finds out by opening Dropbox to vet a
// paper that is not there.
//
// So the sweep runs on the same 15-minute tick as the ScanSnap watcher and files
// whatever is missing. It is idempotent by construction — a run leaves the set
// the moment its dropbox_path is recorded — and it re-tries by simply coming
// round again, which is exactly what the one-shot call could not do.
//
// The pure half (needsFiling / pickForFiling) is tested; the I/O half is the
// same fetch + uploadFile + record the route does, against the same
// lib/paper-folder.ts path rule, so the two cannot drift.
import { getSupabaseAdmin } from './supabase';
import { sendTelegram } from './telegram';
import { fetchOurFile, isOurFileUrl } from './student-files';
import { uploadFile } from './dropbox';
import { markedAiPath, paperFolder, RETURNED_NAME, type PaperRun } from './paper-folder';

/** How far back the sweep looks. The Dropbox tray is deleted a month after
 *  release anyway (/api/cron/dropbox-tray), so filing a paper older than this
 *  would only mint a folder that is about to be swept away again. */
export const FILE_CATCHUP_WINDOW_DAYS = 14;
/** Uploads per tick — a handful is plenty; the sweep runs every 15 minutes. */
export const FILE_CATCHUP_PER_TICK = 3;

export type FilingRun = PaperRun & {
  id: string;
  released_at?: string | null;
  archived_at?: string | null;
  dropbox_path?: string | null;
  photos_pdf_url?: string | null;
  /** result_json.assignment_id — set when the hand-in ANSWERS a sheet. */
  assignment_id?: string | null;
  /** result_json.filing_alert_at — when Adrian was last told this copy is still missing. */
  filing_alert_at?: string | null;
};

function ageDays(iso: string | null | undefined, now: Date): number {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return Infinity;
  return (now.getTime() - t) / 86_400_000;
}

/**
 * Is this run a paper that SHOULD be in Dropbox and is not?
 *
 * Released, not archived, no recorded path, still inside the window, and it has
 * an images PDF of ours to file. A run that has never been released is left
 * alone: it is either still being marked or waiting on the desk, and the
 * marking-time call owns it.
 */
export function needsFiling(run: FilingRun, now: Date, windowDays = FILE_CATCHUP_WINDOW_DAYS): boolean {
  if (!run || !run.id) return false;
  if (run.dropbox_path) return false;
  if (run.archived_at) return false;
  if (!run.released_at) return false;
  if (ageDays(run.released_at, now) > windowDays) return false;
  return isOurFileUrl(run.photos_pdf_url || '');
}

/**
 * Where this run's copy belongs — the SAME rule /api/admin/mark-paper-dropbox
 * applies, so a catch-up and a marking-time filing can never disagree about a
 * folder. A hand-in that ANSWERS a sheet (`parent` = the paper the sheet came
 * from) files into that paper's folder as "4 Practice Again — returned.pdf",
 * never in a folder of its own (Adrian, 6 Sep 2026). Everything else is the
 * paper's own "1 Marked by AI.pdf". Pure.
 */
export function filingPathFor(run: FilingRun, parent: PaperRun | null): string {
  return parent ? `${paperFolder(parent)}/${RETURNED_NAME}` : markedAiPath(run);
}

/** The runs this tick will file, oldest release first — the longest missing one wins. */
export function pickForFiling(runs: FilingRun[], now: Date, perTick = FILE_CATCHUP_PER_TICK): FilingRun[] {
  return (runs || [])
    .filter(r => needsFiling(r, now))
    .sort((a, b) => Date.parse(a.released_at || '') - Date.parse(b.released_at || ''))
    .slice(0, perTick);
}

export type FileCatchupResult = {
  considered: number;
  filed: number;
  failed: number;
  items: Array<{ runId: string; student: string | null; paper: string | null; path?: string; error?: string }>;
};
export type FileCatchupItem = FileCatchupResult['items'][number];

/** Adrian hears about it (10 Sep 2026: "can we make sure it doesn't fail silently?"). */
export const FILING_ALERT_AFTER_MS = 60 * 60_000;      // a copy still missing an hour after release
export const FILING_ALERT_EVERY_MS = 24 * 60 * 60_000;  // then at most once a day per paper

/** The Telegram line for the papers the sweep just filed — the release-time copy had failed. */
export function filedAlertLine(items: FileCatchupItem[]): string {
  const ok = items.filter(i => i.path && !i.error);
  if (!ok.length) return '';
  const who = ok.map(i => `${i.student || 'a student'} · ${i.paper || 'paper'}`).join('; ');
  return `📁 Filed ${ok.length} marked paper${ok.length === 1 ? '' : 's'} whose Dropbox copy had failed at release: ${who}`;
}

/**
 * Whether a still-missing copy is worth a line now: an hour after release, and not
 * more than once a day for the same paper (the sweep runs every 15 minutes — a
 * paper that keeps failing is one problem, not ninety-six).
 */
export function shouldAlertUnfiled(run: { released_at?: string | null; filing_alert_at?: string | null }, now: Date): boolean {
  const rel = Date.parse(String(run.released_at || ''));
  if (!Number.isFinite(rel) || now.getTime() - rel < FILING_ALERT_AFTER_MS) return false;
  const last = Date.parse(String(run.filing_alert_at || ''));
  return !Number.isFinite(last) || now.getTime() - last >= FILING_ALERT_EVERY_MS;
}

/** The Telegram line for copies that are STILL failing. */
export function unfiledAlertLine(items: FileCatchupItem[]): string {
  const bad = items.filter(i => i.error);
  if (!bad.length) return '';
  const who = bad.map(i => `${i.student || 'a student'} · ${i.paper || 'paper'} (${i.error})`).join('; ');
  return `⚠️ Dropbox copy still not filed for ${bad.length} marked paper${bad.length === 1 ? '' : 's'} — the sweep keeps trying every 15 min: ${who}`;
}

/** One line for the cron's job_runs stamp. */
export function fileCatchupLine(r: FileCatchupResult): string {
  return `filing: ${r.filed} filed, ${r.failed} failed, ${r.considered} missing`;
}

/**
 * The paper a returned-sheet hand-in belongs to, or null for an ordinary paper.
 * Two cheap reads, and a miss is a null (the copy then files under its own name
 * rather than not at all).
 */
async function sheetParentOf(run: FilingRun): Promise<PaperRun | null> {
  if (!run.assignment_id) return null;
  try {
    const sb = getSupabaseAdmin();
    const { data: a } = await sb.from('portal_assignments').select('source_run_id').eq('id', run.assignment_id).maybeSingle();
    const parentId = (a as { source_run_id?: string | null } | null)?.source_run_id;
    if (!parentId) return null;
    const { data: parent } = await sb.from('paper_marking_runs')
      .select('student_id, student_name, paper_name, created_at').eq('id', parentId).maybeSingle();
    return (parent as PaperRun | null) || null;
  } catch { return null; }
}

/**
 * File every released paper that has no Dropbox copy. Best-effort throughout —
 * a failure here must never fail the tick; the run simply stays in the set and
 * the next tick tries again.
 */
export async function sweepUnfiledPapers({ dry = false, now = new Date() }: { dry?: boolean; now?: Date } = {}): Promise<FileCatchupResult> {
  const out: FileCatchupResult = { considered: 0, filed: 0, failed: 0, items: [] };
  if (process.env.STUDENT_FILES_TO_DROPBOX === '0') return out;
  const sb = getSupabaseAdmin();
  const since = new Date(now.getTime() - FILE_CATCHUP_WINDOW_DAYS * 86_400_000).toISOString();
  const { data } = await sb
    .from('paper_marking_runs')
    .select('id, student_id, student_name, paper_name, created_at, released_at, archived_at, dropbox_path, photos_pdf_url, assignment_id:result_json->>assignment_id, filing_alert_at:result_json->>filing_alert_at')
    .is('dropbox_path', null)
    .not('released_at', 'is', null)
    .gte('released_at', since)
    .order('released_at', { ascending: true })
    .limit(50);

  const runs = (data || []) as FilingRun[];
  const picks = pickForFiling(runs, now);
  out.considered = runs.filter(r => needsFiling(r, now)).length;
  if (dry) {
    out.items = await Promise.all(picks.map(async r =>
      ({ runId: r.id, student: r.student_name ?? null, paper: r.paper_name ?? null, path: filingPathFor(r, await sheetParentOf(r)) })));
    return out;
  }

  for (const run of picks) {
    try {
      const path = filingPathFor(run, await sheetParentOf(run));
      const r = await fetchOurFile(run.photos_pdf_url as string, { signal: AbortSignal.timeout(45_000) });
      if (!r.ok) throw new Error(`fetch failed (${r.status})`);
      const buf = Buffer.from(await r.arrayBuffer());
      const saved = await uploadFile(path, buf, 'application/pdf', 'overwrite');
      await sb.from('paper_marking_runs').update({ dropbox_path: saved.path }).eq('id', run.id);
      out.filed++;
      out.items.push({ runId: run.id, student: run.student_name ?? null, paper: run.paper_name ?? null, path: saved.path });
    } catch (e) {
      out.failed++;
      out.items.push({ runId: run.id, student: run.student_name ?? null, paper: run.paper_name ?? null, error: (e as Error).message.slice(0, 200) });
      console.warn('[file-catchup]', run.id, (e as Error).message);
    }
  }
  // Never silent: the papers just rescued get one line; the ones still failing get
  // one line an hour after release and then once a day (the flag rides the run).
  try {
    const filedLine = filedAlertLine(out.items);
    if (filedLine) await sendTelegram(filedLine, 'marking');
    const byId = new Map(picks.map(r => [r.id, r]));
    const due = out.items.filter(i => i.error && shouldAlertUnfiled(byId.get(i.runId) || { released_at: null }, now));
    if (due.length) {
      const sent = await sendTelegram(unfiledAlertLine(due), 'marking');
      if (sent) {
        for (const i of due) {
          const { data: row } = await sb.from('paper_marking_runs').select('result_json').eq('id', i.runId).maybeSingle();
          const rj = (row as { result_json?: Record<string, unknown> } | null)?.result_json || {};
          await sb.from('paper_marking_runs').update({ result_json: { ...rj, filing_alert_at: now.toISOString() } }).eq('id', i.runId);
        }
      }
    }
  } catch (e) { console.warn('[file-catchup] alert skipped:', (e as Error).message); }
  return out;
}
