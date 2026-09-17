// Adrian's folded lines under each card on the profile's Papers tab (17 Sep
// 2026, SPEC-STUDENT-FIRST §3 step 2): what the student cannot see, in plain
// words, in this order — who asked for the sheet and where the writer is, a
// sheet not handed in, held or withdrawn sheets, the marking receipt (pages,
// who read them, what it cost, the watch-outs). Pure; tested. The view
// renders the strings; nothing here decides anything.

export interface AdminSheetRow {
  status: string;
  required_at: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  reminded_at?: string | null;
  reminder_count?: number | null;
  source_run_ids?: string[] | null;
}
export interface AdminJobRow {
  status: string;
  stage?: string | null;
  requested_by?: string | null;
  created_at?: string | null;
  noSheet: boolean;
}
export interface AdminRunFacts {
  pages: number;
  /** result_json.usage — Mac reads and the API cost. */
  usage?: { costUsd?: number; externalReads?: number; external?: boolean } | null;
  /** result_json.review.notes — the marker's watch-outs. */
  notes?: string[] | null;
  /** result_json.queue.remark — this marking is a re-mark. */
  remark?: boolean;
}

const day = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
};

export function sheetStoryLine(sheet: AdminSheetRow | null, job: AdminJobRow | null): string | null {
  if (sheet) {
    const asked = sheet.required_at ? `sheet assigned by Adrian ${day(sheet.required_at)}` : `sheet requested by the student ${day(sheet.created_at)}`;
    const batch = (sheet.source_run_ids?.length ?? 0) > 1 ? ` · one sheet for ${sheet.source_run_ids!.length} papers` : '';
    const nudges = (sheet.reminder_count ?? 0) > 0 ? ` · nudged ×${sheet.reminder_count}, last ${day(sheet.reminded_at)}` : '';
    if (sheet.status === 'assigned') return `${asked}${batch} · not handed in yet${nudges}`;
    if (sheet.status === 'submitted') return `${asked}${batch} · handed in ${day(sheet.submitted_at)}, being marked`;
    if (sheet.status === 'marked') return `${asked}${batch} · handed in ${day(sheet.submitted_at)} and marked`;
    return `${asked}${batch} · ${sheet.status}`;
  }
  if (!job) return null;
  const who = job.requested_by === 'student' ? 'the student asked' : job.requested_by ? `asked by ${job.requested_by}` : 'queued';
  if (job.status === 'queued' || job.status === 'claimed') return `sheet being written (${who}${job.stage ? `, ${job.stage}` : ''})`;
  if (job.status === 'done' && job.noSheet) return 'no sheet — the writer found nothing worth practising';
  if (job.status === 'done') return 'sheet written, with Adrian — not released';
  if (job.status === 'failed' || job.status === 'cancelled') return `sheet job ${job.status} ${day(job.created_at)} — the student sees the Request button`;
  return null;
}

export function heldSheetsLine(held: { status: string }[]): string | null {
  const h = held.filter(s => s.status === 'held').length;
  const r = held.filter(s => s.status === 'revoked').length;
  const parts = [h ? `${h} sheet${h > 1 ? 's' : ''} held` : '', r ? `${r} withdrawn` : ''].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} — the student does not see ${h + r > 1 ? 'these' : 'this'}` : null;
}

export function receiptLine(f: AdminRunFacts): string {
  const mac = f.usage?.externalReads ?? 0;
  const cost = typeof f.usage?.costUsd === 'number' ? f.usage.costUsd : null;
  const reads = mac >= f.pages && f.pages > 0 ? 'all read on the Mac' : mac > 0 ? `${mac} of ${f.pages} read on the Mac` : 'read on the API';
  const money = cost == null ? '' : cost < 0.005 ? ' · $0 API' : ` · $${cost.toFixed(2)} API`;
  return `${f.pages} page${f.pages === 1 ? '' : 's'} · ${reads}${money}${f.remark ? ' · re-marked' : ''}`;
}

/** Every line, in order. Empty strings never appear. */
export function adminLines(o: { sheet: AdminSheetRow | null; job: AdminJobRow | null; held: { status: string }[]; facts: AdminRunFacts }): string[] {
  const out: string[] = [];
  const story = sheetStoryLine(o.sheet, o.job); if (story) out.push(story);
  const held = heldSheetsLine(o.held); if (held) out.push(held);
  out.push(receiptLine(o.facts));
  for (const n of (o.facts.notes ?? []).map(n => (n || '').trim()).filter(Boolean).slice(0, 4)) out.push(`⚠ ${n}`);
  return out;
}
