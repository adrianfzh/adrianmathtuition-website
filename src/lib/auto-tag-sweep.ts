// The auto-tag sweep — the I/O half of lib/auto-tag.ts, run every 5 minutes
// from /api/cron/scan-inbox (the same tick as the ScanSnap watcher).
//
// For every recent marked paper with no student:
//   1. the typed name ("denise am tys 2021 p2") → one roster student → tagged;
//   2. a name two students share, or nobody has → the first page (or two) is
//      fetched from the private store, downscaled, and read ONCE by the cover
//      reader; the name on it picks among the students the title pointed at;
//   3. still unsure → left for Adrian's tap, with one Telegram line saying why.
// A tag here is exactly what "+ tag" does: student_id + student_name on the
// run, the self-study sheet auto-queued (lib/sheet-queue.ts, same guard), the
// Dropbox tray folder moved out of /Students/_Untagged.
//
// Then the sheet catch-up: a tagged, marked, unreleased paper with NO sheet
// job of any status gets one queued. That closes the gap docs/MARKING.md lists
// under Auto-queue ("papers the Fly queue worker marks by itself" — tagged at
// upload, marked in the 🌙 queue, nothing ever queued the sheet: Megan's JC2
// practice set sat in "Marked, sheet on the way" for a week, 7 Sep 2026).
// Hand-ins are never touched by either half — they arrive tagged and
// auto-release on their own.
import sharp from 'sharp';
import { getSupabaseAdmin } from './supabase';
import { fetchOurFile } from './student-files';
import { readScanCover } from './scan-reader';
import { sendTelegram } from './telegram';
import { autoQueueSheet } from './sheet-queue';
import { refileUntaggedFolder } from './refile-untagged';
import { loadRoster } from './roster';
import type { RosterStudent } from './scan-inbox';
import {
  AUTO_TAG_WINDOW_DAYS, COVER_READS_PER_TICK, autoTagLine, coverAlreadyTried, decideByCover, decideByName,
  eligibleForAutoTag, firstPageUrls, type AutoTagRun, type AutoTagStamp,
} from './auto-tag';

export type AutoTagResult = {
  considered: number;
  tagged: number;
  coverReads: number;
  /** Runs that need a cover read but this tick's budget was spent. */
  pendingCover: number;
  /** Runs left for the desk after everything was tried. */
  left: number;
  sheetsQueued: number;
  items: Array<{ runId: string; paperName: string | null; action: string }>;
};

const PAGE_WIDTH = 1450;

async function pageJpeg(url: string): Promise<Buffer> {
  const r = await fetchOurFile(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`page fetch ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return sharp(buf).rotate().resize({ width: PAGE_WIDTH, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

/** Merge a stamp into result_json.auto_tag without disturbing the rest of the JSON. */
async function stamp(runId: string, patch: AutoTagStamp): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('paper_marking_runs').select('result_json').eq('id', runId).maybeSingle();
  const rj = (data?.result_json && typeof data.result_json === 'object') ? data.result_json as Record<string, unknown> : {};
  const prev = (rj.auto_tag && typeof rj.auto_tag === 'object') ? rj.auto_tag as AutoTagStamp : {};
  await sb.from('paper_marking_runs').update({ result_json: { ...rj, auto_tag: { ...prev, ...patch } } }).eq('id', runId);
}

/** The tag itself — the papers-library "+ tag" in one function. */
async function tagRun(run: AutoTagRun, student: RosterStudent, how: AutoTagStamp): Promise<string> {
  const sb = getSupabaseAdmin();
  // Only ever a run still untagged: a tap on the desk in the same minute wins.
  const { data: updated, error } = await sb.from('paper_marking_runs')
    .update({ student_id: student.id, student_name: student.name })
    .eq('id', run.id).is('student_id', null).select('id');
  if (error) throw new Error(error.message);
  if (!updated?.length) return 'tagged by hand meanwhile';
  await stamp(run.id, how);
  const sheet = await autoQueueSheet(run.id, 'auto-tag');
  const moved = await refileUntaggedFolder(run.id);
  return `tagged → ${student.name} (${how.by}) · sheet ${sheet.ok ? 'queued' : sheet.status}${moved.moved ? ' · folder moved' : ''}`;
}

/**
 * Tagged, marked, no sheet job at all → queue one. Unreleased papers as before;
 * since 8 Sep 2026 ALSO papers the system released (`released_via` auto:…),
 * hand-ins included: auto-release sends the marked paper at once and the sheet
 * follows on the clock, so a released hand-in with no sheet is the gap this
 * closes (Alessi's 2021 AM P2, released with "no sheet job yet").
 */
async function sheetCatchUp(since: string, dry: boolean): Promise<{ queued: number; items: AutoTagResult['items'] }> {
  const sb = getSupabaseAdmin();
  const { data: runs } = await sb.from('paper_marking_runs')
    .select('id, paper_name, released_at, released_via, portal_submission:result_json->portal_submission, telegram_handin:result_json->telegram_handin')
    .not('student_id', 'is', null).is('archived_at', null).gte('created_at', since)
    .or('released_at.is.null,released_via.like.auto:*');
  const rows = ((runs ?? []) as unknown as Array<{ id: string; paper_name: string | null; released_at: string | null; released_via: string | null; portal_submission?: unknown; telegram_handin?: unknown }>)
    // Adrian's own uploads wait for the desk unless still unreleased (as before); hand-ins always.
    .filter(r => !r.released_at || String(r.released_via || '').startsWith('auto:'));
  if (!rows.length) return { queued: 0, items: [] };
  const { data: jobs } = await sb.from('sheet_jobs').select('run_id').in('run_id', rows.map(r => r.id));
  const has = new Set((jobs ?? []).map(j => j.run_id as string));
  const items: AutoTagResult['items'] = [];
  let queued = 0;
  for (const r of rows) {
    if (has.has(r.id)) continue;
    if (dry) { items.push({ runId: r.id, paperName: r.paper_name, action: 'would queue the sheet (no job yet)' }); continue; }
    // The guard refuses a run with no marking yet (still in the queue) — quietly.
    const out = await autoQueueSheet(r.id, 'auto-tag:catch-up', { afterAutoRelease: !!r.released_at });
    if (out.ok) { queued++; items.push({ runId: r.id, paperName: r.paper_name, action: 'sheet queued (none existed)' }); }
    else if (out.status !== 'no-marking') items.push({ runId: r.id, paperName: r.paper_name, action: `sheet not queued: ${out.status}` });
  }
  return { queued, items };
}

export async function sweepAutoTag(opts: { dry?: boolean; now?: Date; roster?: RosterStudent[] } = {}): Promise<AutoTagResult> {
  const dry = !!opts.dry;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - AUTO_TAG_WINDOW_DAYS * 86_400_000).toISOString();
  const res: AutoTagResult = { considered: 0, tagged: 0, coverReads: 0, pendingCover: 0, left: 0, sheetsQueued: 0, items: [] };
  const sb = getSupabaseAdmin();

  const { data, error } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_id, released_at, archived_at, created_at, source:result_json->source, auto_tag:result_json->auto_tag, portal_submission:result_json->portal_submission, telegram_handin:result_json->telegram_handin')
    .is('student_id', null).is('archived_at', null).is('released_at', null).gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const runs = ((data ?? []) as unknown as AutoTagRun[]).filter(r => eligibleForAutoTag(r, now));
  res.considered = runs.length;

  let roster: RosterStudent[] | null = opts.roster ?? null;
  for (const run of runs) {
    const item = { runId: run.id, paperName: run.paper_name, action: '' };
    res.items.push(item);
    try {
      roster = roster ?? await loadRoster();
      const byName = decideByName(run.paper_name, roster);
      if (byName.kind === 'skip') { item.action = 'no name in the title — left for the desk'; res.left++; continue; }
      if (byName.kind === 'tag') {
        if (dry) { item.action = `would tag → ${byName.student.name} (name)`; res.tagged++; continue; }
        item.action = await tagRun(run, byName.student, { at: now.toISOString(), by: 'name' });
        if (item.action.startsWith('tagged')) { res.tagged++; await sendTelegram(autoTagLine({ paperName: run.paper_name, student: byName.student, by: 'name' }), 'marking').catch(() => {}); }
        continue;
      }
      // The cover decides — once per run, a few per tick.
      if (coverAlreadyTried(run)) { item.action = `left for the desk (${run.auto_tag?.reason || 'cover already read'})`; res.left++; continue; }
      const urls = firstPageUrls(run);
      if (!urls.length) { item.action = 'no pages to read — left for the desk'; res.left++; continue; }
      if (res.coverReads >= COVER_READS_PER_TICK) { item.action = 'cover read waits for the next tick'; res.pendingCover++; continue; }
      if (dry) { item.action = `would read the cover (${byName.reason}: ${byName.candidates.length} candidates)`; res.pendingCover++; continue; }
      res.coverReads++;
      const pages: Array<{ jpeg: Buffer }> = [];
      for (const u of urls) { try { pages.push({ jpeg: await pageJpeg(u) }); } catch { /* one page is enough; none is handled below */ } }
      if (!pages.length) { item.action = 'pages could not be fetched — left for the desk'; res.left++; continue; }
      const read = await readScanCover(pages);
      const byCover = decideByCover(read.reading, byName.candidates);
      if (byCover.kind === 'tag') {
        item.action = await tagRun(run, byCover.student, { at: now.toISOString(), by: 'cover', read_name: byCover.readName, cover_tried: true });
        if (item.action.startsWith('tagged')) { res.tagged++; await sendTelegram(autoTagLine({ paperName: run.paper_name, student: byCover.student, by: 'cover', readName: byCover.readName }), 'marking').catch(() => {}); }
        continue;
      }
      await stamp(run.id, { at: now.toISOString(), cover_tried: true, read_name: byCover.readName, reason: byCover.reason });
      item.action = `left for the desk (${byCover.reason}${byCover.readName ? `: "${byCover.readName}"` : ''})`;
      res.left++;
      await sendTelegram(autoTagLine({ paperName: run.paper_name, student: null, reason: byCover.reason, readName: byCover.readName, candidates: byName.candidates.length }), 'marking').catch(() => {});
    } catch (e) {
      item.action = `error: ${(e as Error).message.slice(0, 160)}`;
      res.left++;
    }
  }

  try {
    const c = await sheetCatchUp(since, dry);
    res.sheetsQueued = c.queued;
    res.items.push(...c.items);
  } catch (e) {
    res.items.push({ runId: '', paperName: null, action: `sheet catch-up error: ${(e as Error).message.slice(0, 160)}` });
  }
  return res;
}
