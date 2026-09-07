// When a paper marked UNTAGGED gets its student, its Dropbox tray folder moves
// from /Students/_untagged/<paper> to /Students/<Student>/<paper> (Adrian,
// 7 Sep 2026: "there is no folder for Gavin Woon in the Students folder" — his
// paper was filed before he was tagged and nothing moved it afterwards).
// Called after set-student (mark-paper proxy) and after the papers-library tag.
// Fail-soft: a Dropbox hiccup is logged; the copy is still there, just untagged.
import { getSupabaseAdmin } from './supabase';
import { dropboxConfigured, movePath } from './dropbox';
import { paperFolder, STUDENTS_ROOT, UNTAGGED_FOLDER } from './paper-folder';

export async function refileUntaggedFolder(runId: string): Promise<{ moved: boolean; from?: string; to?: string; reason?: string }> {
  try {
    if (!dropboxConfigured()) return { moved: false, reason: 'dropbox not configured' };
    const sb = getSupabaseAdmin();
    const { data: run } = await sb.from('paper_marking_runs')
      .select('id, student_id, student_name, paper_name, created_at, dropbox_path')
      .eq('id', runId).maybeSingle();
    if (!run || !run.student_id || !run.dropbox_path) return { moved: false, reason: 'nothing to move' };
    const path = String(run.dropbox_path);
    const untaggedPrefix = `${STUDENTS_ROOT}/${UNTAGGED_FOLDER}/`.toLowerCase();
    if (!path.toLowerCase().startsWith(untaggedPrefix)) return { moved: false, reason: 'not under _untagged' };
    const cut = path.lastIndexOf('/');
    const fromFolder = path.slice(0, cut);
    const fileName = path.slice(cut + 1);
    const toFolder = paperFolder(run);
    if (fromFolder.toLowerCase() === toFolder.toLowerCase()) return { moved: false, reason: 'already in place' };
    await movePath(fromFolder, toFolder, { autorename: true });
    await sb.from('paper_marking_runs').update({ dropbox_path: `${toFolder}/${fileName}` }).eq('id', runId);
    console.log(`[refile-untagged] ${fromFolder} → ${toFolder}`);
    return { moved: true, from: fromFolder, to: toFolder };
  } catch (e) {
    console.warn('[refile-untagged] skipped:', (e as Error).message);
    return { moved: false, reason: (e as Error).message };
  }
}
