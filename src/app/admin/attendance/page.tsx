// /admin/attendance — RETIRED 5 Oct 2026: an orphan page nothing linked to.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AttendanceRetired() {
  redirect('/admin/students');
}
