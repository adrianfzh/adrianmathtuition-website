import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, practiceLevelAllowed, practiceLevelsFor, bankScope, rpcAudience } from '@/lib/practice';
import { isScienceLevel } from '@/lib/science-levels';
import { scienceTopicCounts } from '@/lib/science-bank';

export const runtime = 'nodejs';

// GET /api/portal/practice/topics?level=AM
// Topics (with answerable-question counts) for the practice picker. Service role —
// the bank is locked to the anon key, so serving goes through us, not direct reads.
// Auth: portal student session (level-gated) OR admin Bearer (testing).
// ?auth=check lets the admin page validate the password.
export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });

  const url = new URL(req.url);
  const levels = caller.kind === 'student' ? await practiceLevelsFor(caller) : null;
  const level = url.searchParams.get('level') || levels?.[0]?.key;
  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });
  if (!(await practiceLevelAllowed(caller, level))) return NextResponse.json({ error: 'Level not available' }, { status: 403 });
  // Science levels (lib/science-bank): counts over the eligible physics pool.
  if (isScienceLevel(level)) {
    try {
      const topics = await scienceTopicCounts(level);
      return NextResponse.json({ topics, level, ...(levels ? { levels } : {}) });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message, topics: [] }, { status: 500 });
    }
  }

  const scope = bankScope(level);
  // Sub-group audience: topics with no visible sub-group for this caller are absent.
  const { data, error } = await getSupabaseAdmin().rpc('practice_topics', { p_level: scope.level, p_qlevel: scope.qlevel, ...rpcAudience(caller) });
  if (error) return NextResponse.json({ error: error.message, topics: [] }, { status: 500 });
  return NextResponse.json({ topics: data || [], level, ...(levels ? { levels } : {}) });
}
