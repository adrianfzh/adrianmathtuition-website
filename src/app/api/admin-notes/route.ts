import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';

export const runtime = 'nodejs';

// Maps URL slug → Airtable Level value + Dropbox app-folder subfolder name.
const SLUG_TO_LEVELS: Record<string, string[]> = {
  's1': ['S1'], 's2': ['S2'],
  'em': ['EM'], 'am': ['AM'], 'jc': ['JC'],
};
const SLUG_TO_DBX_FOLDER: Record<string, string> = {
  's1': 'S1', 's2': 'S2', 'em': 'EM', 'am': 'AM', 'jc': 'JC',
};

function titleFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
}

// List a level's PDFs from Dropbox (Apps/AdrianMathNotes/<FOLDER>/). Returns []
// if the subfolder doesn't exist yet. pdfUrl points at the open redirect route so
// the ~4h temporary link is always minted fresh on click (never stale).
async function dropboxNotes(slug: string) {
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
        pdfUrl: `/api/admin-notes/dropbox-open?path=${encodeURIComponent(e.path)}`,
        uploadedAt: e.modified ?? '',
        source: 'dropbox' as const,
      }));
  } catch (err) {
    // path/not_found = subfolder not created yet → just no Dropbox notes for this level
    if (err instanceof Error && /not_found/.test(err.message)) return [];
    throw err;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');

  if (!level || !SLUG_TO_LEVELS[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const labels = SLUG_TO_LEVELS[level];
  const filterExpr = labels.length === 1
    ? `{Level}='${labels[0]}'`
    : `OR(${labels.map(l => `{Level}='${l}'`).join(',')})`;
  const query = `?filterByFormula=${encodeURIComponent(filterExpr)}&sort[0][field]=Title&sort[0][direction]=asc`;

  // Dropbox files (new drop-in source) + existing Airtable/Blob notes, merged.
  const [dbx, data] = await Promise.all([
    dropboxConfigured() ? dropboxNotes(level).catch(() => []) : Promise.resolve([]),
    airtableRequestAll('PrintNotes', query),
  ]);

  const airtableNotes = data.records.map((r: { id: string; fields: Record<string, string> }) => ({
    id: r.id,
    title: r.fields['Title'] ?? '',
    pdfUrl: r.fields['PDF URL'] ?? '',
    uploadedAt: r.fields['Uploaded At'] ?? '',
    source: 'airtable' as const,
  }));

  // Dropbox first (the drop-in folder is the going-forward source), then existing.
  return NextResponse.json({
    notes: [...dbx, ...airtableNotes],
    dropboxEnabled: dropboxConfigured(),
    dropboxFolder: SLUG_TO_DBX_FOLDER[level],
  });
}
