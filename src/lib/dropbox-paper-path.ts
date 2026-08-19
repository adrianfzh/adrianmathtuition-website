// Where a marked paper lands in Dropbox. Extracted from the route on 19 Aug 2026
// when the images PDF started filing ITSELF the moment it is built: the auto-save
// and the 📁 button must compute the byte-identical path, or the "already there?"
// check that stops a rebuild leaving a " (1)" copy would never match.
//
// Landing spot: /Marked Papers/<YYYY-MM-DD> <paper name>.pdf inside the app folder
// (Dropbox/Apps/AdrianMathNotes/) — flat, no month subfolders (Adrian, 14 Aug 2026);
// the date prefix is what keeps a flat folder sorted.

/** Filename body: the paper name, stripped of anything Dropbox or iOS would choke on. */
export function dropboxPaperStem(name: string | null | undefined): string {
  return String(name || 'marked paper')
    .replace(/\.(pdf|jpe?g|png|heic)$/i, '')
    .replace(/[\\/:*?"<>|]/g, '-')     // Dropbox rejects these outright; iOS hides them
    .replace(/\s+/g, ' ').trim().slice(0, 80).trim() || 'marked paper';
}

/** Folder name: a plain segment, never a path — a caller can't escape "Marked Papers". */
export function dropboxPaperFolder(folder: string | null | undefined): string {
  return String(folder || 'Marked Papers').replace(/[^\w \-]/g, '').trim() || 'Marked Papers';
}

/** SGT date, not UTC: a paper marked at 1am Singapore carries THAT day's date,
 *  where toISOString() would stamp the previous one. */
export function sgtDateStamp(nowMs: number): string {
  return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function dropboxPaperPath(name: string | null | undefined, folder: string | null | undefined, nowMs: number): string {
  return `/${dropboxPaperFolder(folder)}/${sgtDateStamp(nowMs)} ${dropboxPaperStem(name)}.pdf`;
}
