// 🖼 Figures we need — the reads and writes (table figure_needs, maths project). Pure rules in
// lib/figure-needs.ts. Fail-soft: recording a need never breaks the caller.
import { getSupabaseAdmin } from './supabase';
import { normShape, type FigureNeedRow } from './figure-needs';

export type NewFigureNeed = {
  bank: 'maths' | 'science'; seed_id?: string | null; subject?: string | null; level?: string | null; topic?: string | null;
  what: string; shape?: string | null; source: 'twins-lane' | 'science-twins-lane' | 'cloud-door' | 'legacy'; note?: string | null;
};

/** One need; a second report of the same seed + shape is ignored. Returns the shape key, or null on a failed write. */
export async function recordFigureNeed(n: NewFigureNeed): Promise<string | null> {
  const what = String(n.what ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!what) return null;
  const shape = normShape(n.shape, what);
  const row = { bank: n.bank, seed_id: n.seed_id ?? null, subject: n.subject ?? null, level: n.level ?? null, topic: n.topic ?? null, what, shape, source: n.source, note: n.note ?? null };
  const sb = getSupabaseAdmin();
  const q = n.seed_id
    ? sb.from('figure_needs').upsert(row, { onConflict: 'bank,seed_id,shape', ignoreDuplicates: true })
    : sb.from('figure_needs').insert(row);
  const { error } = await q;
  if (error) { console.warn('[figure-needs] write failed:', error.message); return null; }
  return shape;
}

export async function listFigureNeeds(): Promise<FigureNeedRow[]> {
  const { data, error } = await getSupabaseAdmin().from('figure_needs').select('*').order('created_at', { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as FigureNeedRow[];
}

/** Adrian's tick on /admin/generated: a shape built (with the family's name) or dropped closes every open row of it. */
export async function closeShape(shape: string, status: 'built' | 'dropped', family?: string | null): Promise<number> {
  const rows = (await listFigureNeeds()).filter((r) => r.status === 'open' && normShape(r.shape, r.what) === shape);
  if (!rows.length) return 0;
  const { error } = await getSupabaseAdmin().from('figure_needs').update({ status, built_family: family ?? null }).in('id', rows.map((r) => r.id));
  if (error) throw new Error(error.message);
  return rows.length;
}
