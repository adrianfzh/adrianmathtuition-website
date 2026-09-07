// The roster a paper can be tagged against: every Active or Trial student,
// with the name exactly as Airtable spells it (it is denormalised onto the run
// as student_name, so it must be the record's own). Shared by the ScanSnap
// watcher and the auto-tag sweep (lib/auto-tag-sweep.ts).
import { airtableRequestAll } from './airtable';
import type { RosterStudent } from './scan-inbox';

export async function loadRoster(): Promise<RosterStudent[]> {
  const { records } = await airtableRequestAll(
    'Students',
    `?filterByFormula=${encodeURIComponent("OR({Status}='Active',{Status}='Trial')")}&fields%5B%5D=Student%20Name&fields%5B%5D=Level`,
  );
  return records
    .map((r: { id: string; fields: Record<string, unknown> }) => ({
      id: r.id,
      name: String(r.fields['Student Name'] || ''),
      level: (r.fields['Level'] as string) || null,
    }))
    .filter(s => s.name);
}
