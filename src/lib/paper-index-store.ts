// Server half of the extracted-papers index (lib/paper-index.ts is the pure half).
// Reads paper_library + library_bank_papers() in the maths project and the
// science project, builds the index, caches it for five minutes.
import { getSupabaseAdmin } from './supabase';
import { getScienceClient, scienceConfigured } from './science-bank';
import { buildIndex, summarise, type BankPaper, type IndexLine, type SourceRow, type SubjectSummary } from './paper-index';
import type { SupabaseClient } from '@supabase/supabase-js';

const COLS = 'id, kind, status, storage_path, source_file, level, year, paper, school, exam_type, subject, notes, size_bytes, finished_at';

// PostgREST clips every read at 1000 rows — page through.
async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function bankPapers(db: SupabaseClient): Promise<BankPaper[]> {
  return pageAll<BankPaper>((a, b) => db.rpc('library_bank_papers')
    .order('subject').order('level').order('school').order('year').order('exam_type').order('paper').range(a, b));
}

export interface PaperIndex { lines: IndexLine[]; summary: SubjectSummary[]; builtAt: string; warnings: string[] }

let cache: { at: number; value: PaperIndex } | null = null;
const TTL = 5 * 60_000;

export async function loadPaperIndex(fresh = false): Promise<PaperIndex> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const db = getSupabaseAdmin();
  const warnings: string[] = [];
  if (!scienceConfigured()) warnings.push('science bank not configured');
  const [rows, maths, science] = await Promise.all([
    pageAll<SourceRow>((a, b) => db.from('paper_library').select(COLS).order('id').range(a, b)),
    bankPapers(db),
    scienceConfigured()
      ? bankPapers(getScienceClient()).catch((e: Error) => { warnings.push(`science bank not read: ${e.message}`); return [] as BankPaper[]; })
      : Promise.resolve([] as BankPaper[]),
  ]);
  const sources = rows.filter(r => r.kind === 'source');
  const library = rows.filter(r => r.kind !== 'source');
  const lines = buildIndex(sources, [...maths, ...science], library);
  const value: PaperIndex = { lines, summary: summarise(lines), builtAt: new Date().toISOString(), warnings };
  cache = { at: Date.now(), value };
  return value;
}

/** The workers' notes for one paper's files, newest file first. */
export async function loadPaperNotes(ids: string[]): Promise<Array<{ file: string | null; status: string | null; notes: string | null }>> {
  const clean = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20);
  if (!clean.length) return [];
  const { data, error } = await getSupabaseAdmin().from('paper_library')
    .select('source_file, status, notes, indexed_at').in('id', clean).order('indexed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({ file: r.source_file, status: r.status, notes: r.notes }));
}
