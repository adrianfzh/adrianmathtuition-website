// /admin/cards-preview — RETIRED 5 Oct 2026: the flashcard preview; the Cards editor shows the cards.
// Old bookmarks and links still land somewhere useful.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CardsPreviewRetired() {
  redirect('/admin/edit-cards');
}
