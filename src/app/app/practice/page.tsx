// /app/practice — the practice flow (topic → Standard/Advanced → question →
// marked working). Open to students during the marking-only beta; Home links
// here. The flow itself lives in practice-flow.tsx (client).
//
// The student's level list is resolved HERE, server-side, and handed to the
// client as the initial state. Before 2026-08-21 the client booted with the
// full nine-level admin list and narrowed it after the overview fetch, so a
// student saw "Sec 1 … JC2" flash for a beat before "E Math / A Math"
// (Adrian spotted it on his phone). Admin (no student session) still resolves
// client-side: the page passes null and the flow falls back to its own check.
import PracticeFlow from './practice-flow';
import PortalFlowStrip from '@/components/PortalFlowStrip';
import { createSupabaseServer } from '@/lib/supabase-server';
import { portalSurfaces } from '@/lib/portal-surfaces';
import { qbLevelsFor } from '@/lib/practice';

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  let initialLevels: { key: string; label: string }[] | null = null;
  // The "you are here" strip only makes sense for a logged-in student — the
  // admin-password testing mode renders a login card, not the journey.
  let isStudent = false;
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: account } = await supabase
        .from('portal_accounts')
        .select('level, subjects')
        .eq('id', user.id)
        .maybeSingle<{ level: string | null; subjects: string[] | null }>();
      if (account) {
        initialLevels = qbLevelsFor(account.level, account.subjects);
        isStudent = true;
      }
    }
  } catch { /* fall back to client-side detection */ }
  const surfaces = await portalSurfaces();
  return (
    <>
      {isStudent && <PortalFlowStrip current="practice" surfaces={surfaces} />}
      <PracticeFlow initialLevels={initialLevels} />
    </>
  );
}
