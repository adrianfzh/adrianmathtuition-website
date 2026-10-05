// /admin/todo — MOVED 5 Oct 2026: Loop tasks is a tab on /admin/my-todos (/api/admin/todo unchanged).
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function TodoMoved() {
  redirect('/admin/my-todos?tab=loop');
}
