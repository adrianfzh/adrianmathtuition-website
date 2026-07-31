import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';
import { dropboxFolderFor, legacyDropboxFolderFor, titleFromFilename, type PrintableKind } from '@/lib/notes-list';

export const runtime = 'nodejs';

// Per-level counts for the /admin/notes hub — notes (Dropbox + Airtable/Blob,
// deduped by title so a note in both sources counts once), revision worksheets
// and prelim practice sets (both Dropbox only). Loaded client-side so the hub renders instantly;
// cached in-process (~2 min) so repeat visits skip the Dropbox round-trips.

const LEVELS = [
  { slug: 's1', atLevel: 'S1' }, { slug: 's2', atLevel: 'S2' },
  { slug: 'em', atLevel: 'EM' }, { slug: 'am', atLevel: 'AM' }, { slug: 'jc', atLevel: 'JC' },
];

const titleKey = (name: string) => titleFromFilename(name).toLowerCase();

async function dbxTitleKeys(folder: string | null): Promise<Set<string>> {
  if (!folder) return new Set();
  try {
    const entries = await listFolder(`/${folder}`);
    return new Set(entries.filter(e => e.tag === 'file' && /\.pdf$/i.test(e.name)).map(e => titleKey(e.name)));
  } catch { return new Set(); }
}

// Same legacy-root fallback as listPrintablesForLevel — the hub pills must not
// read 0 while the Dropbox move is half done. Dies with the shim.
async function dbxTitleKeysFor(kind: PrintableKind, slug: string): Promise<Set<string>> {
  const keys = await dbxTitleKeys(dropboxFolderFor(kind, slug));
  if (keys.size > 0) return keys;
  const legacy = legacyDropboxFolderFor(kind, slug);
  return legacy ? dbxTitleKeys(legacy) : keys;
}

type CountsBody = { counts: Record<string, number>; revisionCounts: Record<string, number>; prelimCounts: Record<string, number>; total: number };
let cache: { at: number; body: CountsBody } | null = null;
const TTL_MS = 2 * 60 * 1000;

async function computeCounts(): Promise<CountsBody> {
  const enabled = dropboxConfigured();
  const empty = () => Promise.resolve(new Set<string>());
  const [data, noteSets, revisionSets, prelimSets] = await Promise.all([
    airtableRequestAll('PrintNotes', '?fields[]=Level&fields[]=Title&fields[]=PDF URL'),
    Promise.all(LEVELS.map(l => enabled ? dbxTitleKeysFor('notes', l.slug) : empty())),
    Promise.all(LEVELS.map(l => enabled ? dbxTitleKeysFor('revision', l.slug) : empty())),
    Promise.all(LEVELS.map(l => enabled ? dbxTitleKeysFor('prelim', l.slug) : empty())),
  ]);

  const keysByLevel: Record<string, Set<string>> = {};
  LEVELS.forEach((l, i) => { keysByLevel[l.atLevel] = new Set(noteSets[i]); });
  for (const r of data.records || []) {
    const lv = r.fields?.['Level'] as string | undefined;
    const title = ((r.fields?.['Title'] as string) || '').trim();
    if (!lv || !title || !r.fields?.['PDF URL'] || !keysByLevel[lv]) continue;
    keysByLevel[lv].add(title.toLowerCase());
  }

  const counts: Record<string, number> = {};
  const revisionCounts: Record<string, number> = {};
  const prelimCounts: Record<string, number> = {};
  LEVELS.forEach((l, i) => {
    counts[l.atLevel] = keysByLevel[l.atLevel].size;
    revisionCounts[l.atLevel] = revisionSets[i].size;
    prelimCounts[l.atLevel] = prelimSets[i].size;
  });
  return { counts, revisionCounts, prelimCounts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.body, { headers: { 'Cache-Control': 'private, max-age=60' } });
  }
  try {
    const body = await computeCounts();
    cache = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch {
    return NextResponse.json({ counts: {}, revisionCounts: {}, prelimCounts: {}, total: 0 });
  }
}
