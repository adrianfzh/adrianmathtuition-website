// The Airtable read behind lib/ask-signal.ts: the student's own asks from the
// bot's `Questions` log, last ASK_LOOKBACK_DAYS, folded into "Keeps coming up"
// lines. Server-only (Airtable token).
//
// Linked-record trap (CLAUDE.md § Gotchas): `{Student}='rec…'` and
// FIND(rec, ARRAYJOIN({Student})) both fail on a linked field — so the formula
// narrows by Timestamp + a non-empty Topic only and the student match happens
// here in JS on the record id. The window is ~30 days of asks across everyone
// (about 100 rows a fortnight in Sep 2026), well inside one or two pages.
//
// Fail-soft: any Airtable error yields no lines — the Notebook renders without
// the band, never an error page (the same rule as the mistakes read).
import { airtableRequestAll } from './airtable';
import { ASK_LOOKBACK_DAYS, askSignalLines, type AskRow, type AskSignalLine } from './ask-signal';

export async function loadAskSignal(airtableStudentId: string, now: Date = new Date()): Promise<AskSignalLine[]> {
  if (!airtableStudentId) return [];
  try {
    const since = new Date(now.getTime() - (ASK_LOOKBACK_DAYS + 1) * 86_400_000).toISOString();
    const formula = `AND(IS_AFTER({Timestamp}, '${since}'), {Topic}!='')`;
    const qs =
      `?filterByFormula=${encodeURIComponent(formula)}` +
      '&fields[]=Topic&fields[]=Timestamp&fields[]=Student';
    const { records } = await airtableRequestAll('Questions', qs);
    const rows: AskRow[] = [];
    for (const r of records) {
      const f = (r && r.fields) || {};
      const linked: unknown = f.Student;
      if (!Array.isArray(linked) || !linked.includes(airtableStudentId)) continue;
      rows.push({ topic: f.Topic, at: f.Timestamp });
    }
    return askSignalLines(rows, now);
  } catch (e) {
    console.warn('[ask-signal] skipped:', (e as Error).message);
    return [];
  }
}
