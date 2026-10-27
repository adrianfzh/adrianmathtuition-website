// Release a finished paper the moment it is tagged (27 Oct 2026) — the pure half.
//
// Since 9 Sep 2026 every TAGGED paper releases itself when its marking
// finishes. A paper tagged AFTER that moment (the desk's "+ tag", the auto-tag
// sweep, the send row's student pick) had nothing to release it: the marker had
// already looked, found no student and moved on, and the catch-up sweep skipped
// papers whose only marked copy is the images PDF. Kiara's and Lakshanya's
// papers sat unreleased for two days that way (Adrian, 27 Oct 2026: "yes set it
// up"). Now the tag itself releases it, through the same automatic door
// (mark-triage {release, auto:true, sweep:true} — the site delivers the copy).
// The I/O is lib/release-on-tag-run.ts.

export type TaggedRunRow = {
  student_id?: string | null;
  released_at?: string | null;
  archived_at?: string | null;
  annotated_pdf_url?: string | null;
  photos_pdf_url?: string | null;
  queue_status?: string | null;
  result_json?: unknown;
};

type Rj = { results?: unknown; auto_release?: { outcome?: string } | null };

/** A marked copy exists: the full annotated PDF, or the marked-images PDF the plan-marker delivers. */
export function hasMarkedCopy(row: Pick<TaggedRunRow, 'annotated_pdf_url' | 'photos_pdf_url'>): boolean {
  return !!(row.annotated_pdf_url || row.photos_pdf_url);
}

/** Should tagging this run release it now? One reason either way, for the log. */
export function releaseOnTagVerdict(row: TaggedRunRow | null | undefined): { go: boolean; why: string } {
  if (!row) return { go: false, why: 'run not found' };
  const rj: Rj = (row.result_json && typeof row.result_json === 'object') ? row.result_json as Rj : {};
  if (!row.student_id) return { go: false, why: 'no student' };
  if (row.released_at) return { go: false, why: 'already released' };
  if (row.archived_at) return { go: false, why: 'archived' };
  if (row.queue_status === 'queued' || row.queue_status === 'claimed') return { go: false, why: 'still being marked — it releases itself when done' };
  if (!Array.isArray(rj.results) || rj.results.length === 0) return { go: false, why: 'not marked yet' };
  if (!hasMarkedCopy(row)) return { go: false, why: 'no marked PDF yet' };
  // A hold (ticks fell to the margin; the working matched another paper and is
  // being marked again) is the desk's call — a tag does not overrule it.
  if (rj.auto_release?.outcome === 'held') return { go: false, why: 'held — release it from the desk' };
  return { go: true, why: 'marked and now tagged' };
}
