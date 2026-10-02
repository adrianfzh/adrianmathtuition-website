// /admin/desk — RETIRED 30 Sep 2026 (Adrian: "do we need the desk? 'mark a
// paper' already shows the list of papers" … "make Annotate as the only way to
// change marks"). Mark a paper holds the list, the auto-release switch, 📤
// Release, the ticks for a merged Practice Again sheet and ✏️ Annotate, whose
// Done re-issues a released paper. Old links (Telegram lines, bookmarks) land
// there: ?run=<id> opens that paper. The /api/admin/desk/* routes stay — the
// annotate tool, the health-check and the crons read them.
import { redirect } from 'next/navigation';

export default async function DeskRedirect({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  redirect(run && /^[0-9a-f-]{36}$/i.test(run) ? `/admin/mark-paper?run=${run}` : '/admin/mark-paper');
}
