// /admin/mark/batch/[batchId] — RETIRED 5 Oct 2026 with the old batch marking (the /api/mark-batch/* routes went too).
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function BatchRetired() {
  redirect('/admin/mark-paper');
}
