// /app/plan — merged into "My Notebook" (/app/my-notes) on 2026-08-28
// (Adrian: "yes do My Plan → My Notebook"). The plan's Focus / Keep warm /
// Wins bands now render there (same buildPlan derivation), alongside the
// questions-to-retry list and the ✂️ clippings gallery. This route file stays
// so old links, bookmarks and history survive — it only redirects.
import { redirect } from 'next/navigation';

export default function PlanPage() {
  redirect('/app/my-notes');
}
