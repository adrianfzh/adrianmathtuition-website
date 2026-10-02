// /app/lesson/stickers — Adrian's look at the sticker set (1 Oct 2026): the twenty-two
// kinds on a slate swatch, each labelled, with a "pop again" button, so he can prune
// the set. Linked from nowhere — he opens the URL. Admin-only like the lesson page
// (requireFullPortal bounces students to /app while the marking-only beta is on).
import { requireFullPortal } from '@/lib/portal-beta';
import { THEME_TOKENS } from '@/lib/lesson-theme';
import { StickerGallery } from '../[slug]/lesson-stickers';

export const dynamic = 'force-dynamic';

export default async function StickersPage() {
  await requireFullPortal();
  const chalk = THEME_TOKENS.chalk;
  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <p className="text-[11px] font-semibold tracking-wide uppercase text-slate-400">Lessons · admin</p>
      <h1 className="text-xl font-bold text-slate-900 mb-4">Stickers</h1>
      <StickerGallery board={chalk.board} ink={chalk.ink} />
      <p className="mt-6 text-xs text-slate-500">
        The explain clip drops <b>warning</b> on the ✗ line, <b>lightbulb</b> on the first pen step and <b>confetti</b> on the Answer. Any kind can be swapped for a LottieFiles / Tenor asset behind its name — docs/LESSONS.md § Stickers.
      </p>
    </main>
  );
}
