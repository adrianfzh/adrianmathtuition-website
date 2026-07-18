// Adrian's block-out periods (holidays / away dates) — stored as ONE JSON row
// in the Airtable Settings table (Setting Name = 'blocked_dates') so the
// website and the Telegram bot read the same source of truth. Distinct from
// NO_LESSON_DATES in holidays.ts, which is the fixed CNY/Christmas policy.
//
// Value JSON shape: { "ranges": [{ "start": "2026-08-01", "end": "2026-08-09", "reason": "Japan trip" }] }
// start/end are YYYY-MM-DD, both inclusive.
import { airtableRequest } from '@/lib/airtable';

export interface BlockedRange {
  start: string;
  end: string;
  reason: string;
}

const SETTING_NAME = 'blocked_dates';
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidRange(r: any): r is BlockedRange {
  return !!r && ISO_RE.test(r.start) && ISO_RE.test(r.end) && r.start <= r.end;
}

export async function fetchBlockedRecord(): Promise<{ id: string | null; ranges: BlockedRange[] }> {
  const data = await airtableRequest(
    'Settings',
    `?filterByFormula=${encodeURIComponent(`{Setting Name}='${SETTING_NAME}'`)}&maxRecords=1`
  );
  const rec = data.records?.[0];
  if (!rec) return { id: null, ranges: [] };
  let ranges: BlockedRange[] = [];
  try {
    const parsed = JSON.parse(rec.fields['Value'] || '{}');
    if (Array.isArray(parsed.ranges)) {
      ranges = parsed.ranges
        .filter(isValidRange)
        .map((r: BlockedRange) => ({ start: r.start, end: r.end, reason: String(r.reason || '') }));
    }
  } catch {}
  ranges.sort((a, b) => a.start.localeCompare(b.start));
  return { id: rec.id, ranges };
}

export async function saveBlockedRanges(id: string | null, ranges: BlockedRange[]): Promise<void> {
  const valueJson = JSON.stringify({ ranges });
  if (id) {
    await airtableRequest('Settings', `/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Value: valueJson } }),
    });
  } else {
    await airtableRequest('Settings', '', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          'Setting Name': SETTING_NAME,
          Value: valueJson,
          Notes: 'Managed from /admin/schedule → 🏖 Away dates. Read by the website reschedule/add APIs and the bot student-reschedule options.',
        },
      }),
    });
  }
}

// The range covering `date` (YYYY-MM-DD), or null.
export function findBlock(ranges: BlockedRange[], date: string): BlockedRange | null {
  return ranges.find(r => r.start <= date && date <= r.end) ?? null;
}
