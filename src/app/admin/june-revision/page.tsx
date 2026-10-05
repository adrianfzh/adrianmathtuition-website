// /admin/june-revision — MOVED 5 Oct 2026: the two published schedule links sit in the Revision Sprint page header.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function JuneRevisionMoved() {
  redirect('/admin/revision-signups');
}
