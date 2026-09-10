// 🔁 One thing a day from the notebook — the Home card (SPEC-NOTEBOOK-V2 §7
// resurfacing, 11 Sep 2026; opt-in, Settings → "One thing a day from my
// notebook", prefs.resurface). Server island: builds the student's stream the
// way the Notebook does, asks lib/resurface.ts for today's item, and renders
// one small card that opens that item in the Notebook. "Done for today" hides
// it on this device until tomorrow (resurface-dismiss.tsx, localStorage).
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadMistakes, type MistakeRow } from '@/lib/notebook-mistakes-store';
import { displayOrder } from '@/lib/notebook-mistakes';
import { loadSaves } from '@/lib/notebook-saves-store';
import type { SaveRow } from '@/lib/notebook-saves';
import { buildStreamItems } from '@/lib/notebook-stream';
import { pickResurface, resurfaceLine } from '@/lib/resurface';
import { sgtTodayISO } from '@/lib/sgt';
import type { MyNoteRow } from '@/lib/portal-notes';
import ResurfaceDismiss, { ResurfaceDismissButton } from './resurface-dismiss';

const ICON: Record<string, string> = { mistake: '⚠️', saved: '💾', photo: '📷', clip: '✂️' };

export default async function ResurfaceCard({ identity, card, caption }: { identity: string; card: string; caption: string }) {
  const svc = createServiceClient();
  const [mistakes, saves, notes] = await Promise.all([
    loadMistakes(svc, identity).catch((): MistakeRow[] => []),
    loadSaves(svc, identity, 100).catch((): SaveRow[] => []),
    getSupabaseAdmin().from('portal_notes')
      .select('id, run_id, source_label, topic, image_url, note, created_at, auto_topic, auto_skill')
      .eq('airtable_student_id', identity).order('created_at', { ascending: false }).limit(60)
      .then(r => (r.data ?? []) as MyNoteRow[], () => [] as MyNoteRow[]),
  ]);
  const bands = displayOrder(mistakes);
  const items = buildStreamItems({
    mistakes: [...bands.stillHappening, ...bands.gettingBetter], practiceFor: () => [], saves, notes, pages: [], skills: [],
  });
  const today = sgtTodayISO();
  const pick = pickResurface(items, identity, today);
  if (!pick) return null;
  return (
    <ResurfaceDismiss day={today}>
      <div className={card} data-resurface-card>
        <div className="flex items-start gap-3">
          <span className="text-xl leading-none mt-0.5" aria-hidden>{ICON[pick.kind] ?? '📓'}</span>
          <div className="min-w-0 flex-1">
            <p className={caption}>From your notebook · today</p>
            <p className="text-sm font-bold text-navy leading-snug">{pick.title}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">{resurfaceLine(pick)}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <Link href={`/app/my-notes?open=${encodeURIComponent(pick.id)}`} className="text-[12px] font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-full px-3 py-1.5">Open it</Link>
              <ResurfaceDismissButton />
            </div>
          </div>
        </div>
      </div>
    </ResurfaceDismiss>
  );
}
