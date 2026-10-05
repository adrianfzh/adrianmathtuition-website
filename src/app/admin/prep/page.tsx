// /admin/prep — RETIRED 5 Oct 2026: the walk-in card. The Next lesson card on each
// student profile (/admin/students/<id>/next) already shows the last lesson, the
// exam, recent mistakes and what to print; the dashboard's Today row folds it per student.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PrepRetired() {
  redirect('/admin');
}
