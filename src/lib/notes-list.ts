// Notes-listing logic consumed by /api/kiosk/notes. Mirrors the same Dropbox+
// Airtable/PrintNotes sources that /api/admin-notes lists (keep the two in sync).
// A "note" is a printable PDF: from the Dropbox drop-in folder (going-forward
// source) or the legacy Airtable/Blob `PrintNotes` table, merged.
import { airtableRequestAll } from '@/lib/airtable';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';

// URL slug → Airtable Level value + Dropbox subfolder. Notes exist for all five
// secondary/JC levels (practice-worksheet levels are a narrower set).
export const NOTE_SLUG_TO_LEVELS: Record<string, string[]> = {
  s1: ['S1'], s2: ['S2'], em: ['EM'], am: ['AM'], jc: ['JC'],
};
const SLUG_TO_DBX_FOLDER: Record<string, string> = {
  s1: 'S1', s2: 'S2', em: 'EM', am: 'AM', jc: 'JC',
};

export type NoteEntry = {
  id: string;
  title: string;
  pdfUrl: string;
  uploadedAt: string;
  source: 'dropbox' | 'airtable';
};

function titleFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
}

async function dropboxNotes(slug: string): Promise<NoteEntry[]> {
  const folder = SLUG_TO_DBX_FOLDER[slug];
  if (!folder) return [];
  try {
    const entries = await listFolder(`/${folder}`);
    return entries
      .filter(e => e.tag === 'file' && /\.pdf$/i.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({
        id: `dbx:${e.path}`,
        title: titleFromFilename(e.name),
        // The open-redirect route mints a fresh temporary link on each open;
        // it accepts kiosk auth as well as admin.
        pdfUrl: `/api/admin-notes/dropbox-open?path=${encodeURIComponent(e.path)}`,
        uploadedAt: e.modified ?? '',
        source: 'dropbox' as const,
      }));
  } catch (err) {
    if (err instanceof Error && /not_found/.test(err.message)) return [];
    throw err;
  }
}

/** List a level's printable notes (Dropbox + Airtable/Blob), Dropbox first. */
export async function listNotesForLevel(slug: string): Promise<{
  notes: NoteEntry[];
  dropboxEnabled: boolean;
  dropboxFolder: string | undefined;
}> {
  const labels = NOTE_SLUG_TO_LEVELS[slug];
  if (!labels) return { notes: [], dropboxEnabled: dropboxConfigured(), dropboxFolder: undefined };

  const filterExpr = labels.length === 1
    ? `{Level}='${labels[0]}'`
    : `OR(${labels.map(l => `{Level}='${l}'`).join(',')})`;
  const query = `?filterByFormula=${encodeURIComponent(filterExpr)}&sort[0][field]=Title&sort[0][direction]=asc`;

  const [dbx, data] = await Promise.all([
    dropboxConfigured() ? dropboxNotes(slug).catch(() => []) : Promise.resolve([]),
    airtableRequestAll('PrintNotes', query),
  ]);

  const airtableNotes: NoteEntry[] = (data.records as { id: string; fields: Record<string, string> }[]).map(r => ({
    id: r.id,
    title: r.fields['Title'] ?? '',
    pdfUrl: r.fields['PDF URL'] ?? '',
    uploadedAt: r.fields['Uploaded At'] ?? '',
    source: 'airtable' as const,
  }));

  return {
    notes: [...dbx, ...airtableNotes],
    dropboxEnabled: dropboxConfigured(),
    dropboxFolder: SLUG_TO_DBX_FOLDER[slug],
  };
}
