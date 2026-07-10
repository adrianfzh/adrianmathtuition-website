import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequestAll } from '@/lib/airtable';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';

export const runtime = 'nodejs';

// Per-level note counts for the /admin/notes hub — merges Dropbox folder files
// with Airtable/Blob notes, deduped by title (a note in both sources counts
// once; blank/no-PDF junk ignored). Loaded client-side so the hub renders
// instantly; cached in-process (~2 min) so repeat visits skip the Dropbox round-trips.

const LEVELS = [
  { slug: 's1', atLevel: 'S1' }, { slug: 's2', atLevel: 'S2' },
  { slug: 'em', atLevel: 'EM' }, { slug: 'am', atLevel: 'AM' }, { slug: 'jc', atLevel: 'JC' },
];

const titleKey = (name: string) => name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim().toLowerCase();

async function dbxTitleKeys(folder: string): Promise<Set<string>> {
  try {
    const entries = await listFolder(`/${folder}`);
    return new Set(entries.filter(e => e.tag === 'file' && /\.pdf$/i.test(e.name)).map(e => titleKey(e.name)));
  } catch { return new Set(); }
}

let cache: { at: number; body: { counts: Record<string, number>; total: number } } | null = null;
const TTL_MS = 2 * 60 * 1000;

async function computeCounts() {
  const [data, ...dbxSets] = await Promise.all([
    airtableRequestAll('PrintNotes', '?fields[]=Level&fields[]=Title&fields[]=PDF URL'),
    ...LEVELS.map(l => dropboxConfigured() ? dbxTitleKeys(l.atLevel) : Promise.resolve(new Set<string>())),
  ]);
  const keysByLevel: Record<string, Set<string>> = {};
  LEVELS.forEach((l, i) => { keysByLevel[l.atLevel] = new Set(dbxSets[i]); });
  for (const r of data.records || []) {
    const lv = r.fields?.['Level'] as string | undefined;
    const title = ((r.fields?.['Title'] as string) || '').trim();
    if (!lv || !title || !r.fields?.['PDF URL'] || !keysByLevel[lv]) continue;
    keysByLevel[lv].add(title.toLowerCase());
  }
  const counts: Record<string, number> = {};
  for (const l of LEVELS) counts[l.atLevel] = keysByLevel[l.atLevel].size;
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
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
    return NextResponse.json({ counts: {}, total: 0 });
  }
}
