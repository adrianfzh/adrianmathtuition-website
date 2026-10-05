// /admin/kiosk — MOVED 5 Oct 2026: the kiosk switch is a card on /admin/switches.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function KioskMoved() {
  redirect('/admin/switches#kiosk');
}
