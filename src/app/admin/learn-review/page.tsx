// /admin/learn-review — RETIRED 5 Oct 2026: the /notes reader does the review now (lib/unit-reorder.ts stays, shared with it).
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LearnReviewRetired() {
  redirect('/admin');
}
