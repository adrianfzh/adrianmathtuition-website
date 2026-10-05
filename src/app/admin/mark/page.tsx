// /admin/mark — RETIRED 5 Oct 2026: the old batch marking (last batch 23 Apr 2026). Mark a paper does it all now.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function MarkRetired() {
  redirect('/admin/mark-paper');
}
