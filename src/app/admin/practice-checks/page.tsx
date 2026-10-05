// /admin/practice-checks — RETIRED 5 Oct 2026: the practice-grade spot-check page, never used.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PracticeChecksRetired() {
  redirect('/admin');
}
