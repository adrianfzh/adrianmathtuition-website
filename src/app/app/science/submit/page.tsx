// The science hand-in lives on the Science Home since 24 Sep 2026 (Adrian:
// "no need for another page"). Old links and bookmarks land there.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ScienceSubmitPage() {
  redirect('/app/science');
}
