// /admin/mark/triage — RETIRED 8 Sep 2026 (Adrian: "fold triage into the desk and retire it").
//
// Everything this page did lives on the marking desk now: Agree/Override on every
// question, the release gate, 👁 Seen / All seen, 🧺 Shelve, 📬 Send follow-up and
// ✍️ Upload amended. Old bookmarks and old Telegram messages still land somewhere
// useful. The API route /api/admin/mark-triage is NOT retired — the desk and the
// bot's auto-release both post to it.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function TriageRetired() {
  redirect('/admin/desk');
}
