// /admin/rubrics — MOVED 5 Oct 2026: the grading rubrics are a folded section of /admin/essays.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function RubricsMoved() {
  redirect('/admin/essays#rubrics');
}
