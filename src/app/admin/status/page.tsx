// /admin/status — RETIRED 5 Oct 2026: the old status page; the dashboard at /admin shows it all.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function StatusRetired() {
  redirect('/admin');
}
