// 🔁 The same paper handed in twice — the I/O half (5 Oct 2026). The rule is
// lib/duplicate-handin.ts (pure, tested); this reads what it needs and nothing more:
//   - the student's own hand-ins of the last three days (paper_marking_runs), and
//   - each page's content fingerprint: the storage eTag (an MD5 of the bytes) from ONE
//     listing of the student's hand-in folder — no photo is downloaded.
// A failure anywhere answers "nothing known" — a check that cannot read must never stop
// a hand-in.
import { getSupabaseAdmin } from './supabase';
import { STUDENT_FILES_BUCKET, keyFromUrl } from './student-files-url';
import { DUPLICATE_WINDOW_DAYS, type EarlierHandin } from './duplicate-handin';

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** url → eTag for every url under handins/<studentId>/ that the folder listing knows. */
export async function handinFingerprints(admin: Admin, studentId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const prefix = `handins/${studentId}`;
    const { data, error } = await admin.storage.from(STUDENT_FILES_BUCKET)
      .list(prefix, { limit: 600, sortBy: { column: 'created_at', order: 'desc' } });
    if (error || !data) return out;
    for (const o of data) {
      const tag = String((o.metadata as { eTag?: unknown } | null)?.eTag ?? '').replace(/"/g, '');
      if (tag) out.set(`${prefix}/${o.name}`, tag);
    }
  } catch { /* nothing known */ }
  return out;
}

export function fingerprintOf(map: Map<string, string>, url: string): string | null {
  const k = keyFromUrl(url);
  return (k && map.get(k)) || null;
}

/** The student's own hand-ins of the window, with each page's fingerprint. */
export async function earlierHandins(admin: Admin, studentId: string, prints: Map<string, string>, now = new Date()): Promise<EarlierHandin[]> {
  try {
    const since = new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000).toISOString();
    const { data } = await admin.from('paper_marking_runs')
      .select('id, created_at, paper_name, subject, released_at, queue_status, archived_at, superseded_by, photos:result_json->source->photos')
      .eq('student_id', studentId)
      .eq('result_json->>portal_submission', 'true')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      created_at: String(r.created_at),
      paper_name: (r.paper_name as string | null) ?? null,
      subject: (r.subject as string | null) ?? null,
      released_at: (r.released_at as string | null) ?? null,
      queue_status: (r.queue_status as string | null) ?? null,
      archived_at: (r.archived_at as string | null) ?? null,
      superseded_by: (r.superseded_by as string | null) ?? null,
      fingerprints: (Array.isArray(r.photos) ? r.photos as Array<{ original_url?: string }> : [])
        .map((p) => (p?.original_url ? fingerprintOf(prints, p.original_url) : null)),
    }));
  } catch {
    return [];
  }
}

/** The linked copy: one append-only line per repeated hand-in (its photos stay listed here, never deleted). */
export async function logDuplicateHandin(admin: Admin, studentId: string, detail: Record<string, unknown>): Promise<void> {
  try { await admin.from('portal_event_log').insert({ identity: studentId, kind: 'submit:duplicate', detail }); } catch { /* the log is a record, never a gate */ }
}
