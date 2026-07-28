// Printable-PDF listing shared by /api/admin-notes (Adrian's print pages) and
// /api/kiosk/notes (the student kiosk). A "printable" is a PDF Adrian drops into
// the Dropbox app folder (Apps/AdrianMathNotes/), plus — for notes only — the
// legacy Airtable/Blob `PrintNotes` table, merged.
//
// Two kinds live in the same app folder, one parent folder each:
//   notes     → /Notes/<LEVEL>      e.g. /Notes/AM    (kiosk + admin)
//   revision  → /Revision/<LEVEL>   e.g. /Revision/AM (admin only, 2026-07-28)
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

export type PrintableKind = 'notes' | 'revision';

export function isPrintableKind(v: string | null | undefined): v is PrintableKind {
  return v === 'notes' || v === 'revision';
}

/**
 * Dropbox app-folder path for a (kind, level) — the ONE place the folder layout
 * is encoded. Each kind gets a parent folder holding one folder per level.
 * Returns null for an unknown level slug.
 */
export function dropboxFolderFor(kind: PrintableKind, slug: string): string | null {
  const folder = SLUG_TO_DBX_FOLDER[slug];
  if (!folder) return null;
  return kind === 'revision' ? `Revision/${folder}` : `Notes/${folder}`;
}

/**
 * Pre-2026-07-28 layout: notes sat loose at the app-folder root (`/AM`) before
 * the Notes/ parent existed. Read-only fallback so a deploy and the Dropbox
 * move don't have to happen in the same instant — either order works, and a
 * half-moved folder still lists. Revision never had a legacy location.
 * DELETE this (and its use below) once the root-level folders are gone.
 */
export function legacyDropboxFolderFor(kind: PrintableKind, slug: string): string | null {
  if (kind !== 'notes') return null;
  return SLUG_TO_DBX_FOLDER[slug] ?? null;
}

export type NoteEntry = {
  id: string;
  title: string;
  pdfUrl: string;
  uploadedAt: string;
  source: 'dropbox' | 'airtable';
};

export function titleFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
}

/**
 * List the PDFs in one Dropbox folder as NoteEntries. Non-recursive (nested
 * folders are invisible by design) and sorted by filename. A folder that
 * doesn't exist yet is not an error — it's an empty list.
 * pdfUrl points at the open-redirect route, which mints a fresh ~4h temporary
 * link on each click, so a listed link is never stale.
 */
export async function listDropboxPdfs(folder: string): Promise<NoteEntry[]> {
  try {
    const entries = await listFolder(`/${folder}`);
    return entries
      .filter(e => e.tag === 'file' && /\.pdf$/i.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({
        id: `dbx:${e.path}`,
        title: titleFromFilename(e.name),
        pdfUrl: `/api/admin-notes/dropbox-open?path=${encodeURIComponent(e.path)}`,
        uploadedAt: e.modified ?? '',
        source: 'dropbox' as const,
      }));
  } catch (err) {
    if (err instanceof Error && /not_found/.test(err.message)) return [];
    throw err;
  }
}

export type PrintableList = {
  notes: NoteEntry[];
  dropboxEnabled: boolean;
  dropboxFolder: string | undefined;
};

/**
 * A level's printable PDFs. `notes` merges Dropbox (going-forward source, first)
 * with the legacy Airtable/Blob table; `revision` is Dropbox-only — revision
 * worksheets were never in Airtable and are managed entirely in Dropbox.
 */
export async function listPrintablesForLevel(kind: PrintableKind, slug: string): Promise<PrintableList> {
  const folder = dropboxFolderFor(kind, slug);
  const dropboxEnabled = dropboxConfigured();
  if (!folder) return { notes: [], dropboxEnabled, dropboxFolder: undefined };

  let dbx = dropboxEnabled ? await listDropboxPdfs(folder).catch(() => []) : [];
  // Nothing under the new path yet → look where notes used to live (see above).
  const legacy = legacyDropboxFolderFor(kind, slug);
  if (dropboxEnabled && dbx.length === 0 && legacy) {
    dbx = await listDropboxPdfs(legacy).catch(() => []);
  }
  if (kind === 'revision') return { notes: dbx, dropboxEnabled, dropboxFolder: folder };

  const labels = NOTE_SLUG_TO_LEVELS[slug];
  const filterExpr = labels.length === 1
    ? `{Level}='${labels[0]}'`
    : `OR(${labels.map(l => `{Level}='${l}'`).join(',')})`;
  const query = `?filterByFormula=${encodeURIComponent(filterExpr)}&sort[0][field]=Title&sort[0][direction]=asc`;
  const data = await airtableRequestAll('PrintNotes', query);

  const airtableNotes: NoteEntry[] = (data.records as { id: string; fields: Record<string, string> }[]).map(r => ({
    id: r.id,
    title: r.fields['Title'] ?? '',
    pdfUrl: r.fields['PDF URL'] ?? '',
    uploadedAt: r.fields['Uploaded At'] ?? '',
    source: 'airtable' as const,
  }));

  return { notes: [...dbx, ...airtableNotes], dropboxEnabled, dropboxFolder: folder };
}

/** Back-compat alias — notes only (the kiosk's only kind). */
export function listNotesForLevel(slug: string): Promise<PrintableList> {
  return listPrintablesForLevel('notes', slug);
}
