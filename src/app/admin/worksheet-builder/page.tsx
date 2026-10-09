// /admin/worksheet-builder — RETIRED 9 Oct 2026 (Adrian: "retire worksheet builder").
// It picked questions by hand and wrote worked examples on the paid key, PDF only. The
// worksheet picker does the hand-picking in his regular format (PDF + Word), and
// /admin/worksheets (the /ws menu) writes worked sheets on the plan. A redirect, never a 404.
import { redirect } from 'next/navigation';

export default function WorksheetBuilderRetired() {
  redirect('/admin/worksheet-picker');
}
