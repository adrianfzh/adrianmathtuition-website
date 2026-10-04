// 5 Oct 2026 leak audit: an essay / humanities page that lost its session passed
// a null identity and the loader then returned ANY run by id. A missing scope must
// open nothing, without even asking the database.
import { describe, it, expect, vi } from 'vitest';

const from = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from }) }));

import { loadEssay } from './essay-runs';
import { loadHumanitiesRun } from './humanities-runs';

describe('run loaders refuse a missing scope', () => {
  it('loadEssay(id, null) and loadEssay(id, "") open nothing', async () => {
    expect(await loadEssay('00000000-0000-0000-0000-000000000000', null)).toBeNull();
    expect(await loadEssay('00000000-0000-0000-0000-000000000000', '')).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it('loadHumanitiesRun(id, null) opens nothing', async () => {
    expect(await loadHumanitiesRun('00000000-0000-0000-0000-000000000000', null)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it('a student scope filters by that identity', async () => {
    const eqs: [string, string][] = [];
    const q: any = { eq: (c: string, v: string) => { eqs.push([c, v]); return q; }, maybeSingle: async () => ({ data: null, error: null }) };
    from.mockReturnValue({ select: () => q });
    await loadEssay('abc', 'recSTUDENT');
    expect(eqs).toContainEqual(['airtable_student_id', 'recSTUDENT']);
  });
});
