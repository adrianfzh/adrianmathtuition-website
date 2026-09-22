'use client';
// 🖊 Admin mode on the student's paper page (Adrian, 22 Sep 2026: "put the desk's
// machinery into student … just replace that expanded button to go into admin
// mode … editing the crosses and ticks and annotations as well as change marks.
// i do not want the per-question agree/override UI").
//
// Wraps StudentInk (Adrian's free-hand notes layer) and turns its ⤢ button into
// "Edit marking": the desk's AnnotateOverlay in admin mode over THIS run —
// select / move / delete / retype the bot's ticks, crosses, notes and verdicts,
// ✓⇄✗ swaps, typed text, and a retyped score chip ("3/5") which IS a mark change
// (SPEC-ANNOTATE §15: parts → question total → run totals). Done composes the
// page on the server, then re-issues the student's copy exactly as the desk
// does (mark-triage {action:'reissue'} — PDFs rebuilt, cover re-rendered, the
// student told), and refreshes this page so the new page images and total show.
// Pages come from the same route the desk reads (/api/admin/desk/run), mapped the
// same way, so the two doors can never disagree about what the pen draws on.
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import StudentInk from './StudentInk';
import { fileHref } from '@/lib/student-files-url';
import type { InkPages } from '@/lib/student-ink';
import type { LayerMeta } from '@/lib/annotate/layer';

const AnnotateOverlay = dynamic(() => import('@/components/AnnotateOverlay'), { ssr: false });

type InkPageInput = Parameters<typeof StudentInk>[0]['pages'][number];
type OtherInk = NonNullable<Parameters<typeof StudentInk>[0]['other']>;

type RunDetail = {
  run: { id: string; studentName: string | null; awarded: number; max: number; releasedAt: string | null };
  annotatedPhotos: { photoIndex: number; url: string; urlWithSolutions: string | null; layerUrl?: string | null; layer?: LayerMeta | null; inkUrl?: string | null }[];
  pageSources?: Record<number, { originalUrl: string | null; rot: number }>;
};

export default function AdminMarkingPen({ runId, pages, initial, other }: {
  runId: string; pages: InkPageInput[]; initial: InkPages | null; other: OtherInk | null;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const open = useCallback(async (pageIndex: number) => {
    setNote(null); setLoading(true);
    try {
      const r = await fetch(`/api/admin/desk/run?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error || !d.run) throw new Error(d.error || `could not load the marking (${r.status})`);
      setDetail(d as RunDetail);
      setOpenAt(pageIndex);
    } catch (e) {
      setNote(`Could not open the marking: ${(e as Error).message}`);
    } finally { setLoading(false); }
  }, [runId]);

  // Same shape the desk builds (admin/desk/page.tsx annotatePages), memoised for the overlay's pagesKey.
  const overlayPages = useMemo(() => (detail?.annotatedPhotos ?? []).map(ph => ({
    photoIndex: ph.photoIndex,
    url: fileHref(ph.urlWithSolutions || ph.url),
    layerUrl: ph.layerUrl ? fileHref(ph.layerUrl) : null,
    layer: ph.layer ?? null,
    inkUrl: ph.inkUrl ? fileHref(ph.inkUrl) : null,
    originalUrl: detail?.pageSources?.[ph.photoIndex]?.originalUrl ? fileHref(detail.pageSources[ph.photoIndex].originalUrl as string) : null,
    rot: detail?.pageSources?.[ph.photoIndex]?.rot ?? 0,
  })), [detail]);
  const student = useMemo(() => ({ name: detail?.run.studentName || '', level: '' }), [detail]);
  const totals = useMemo(() => detail ? { awarded: detail.run.awarded, max: detail.run.max } : null, [detail]);
  const close = useCallback(() => setOpenAt(null), []);

  const onDone = useCallback(async ({ linked, marks }: { linked: boolean; marks?: { awarded: number; max: number } | null }) => {
    setOpenAt(null);
    const marksNote = marks ? ` Marks now ${marks.awarded}/${marks.max}.` : '';
    if (!linked) setNote(`Saved, but the copy could not be linked.${marksNote}`);
    else if (detail?.run.releasedAt) {
      setNote(`Saved.${marksNote} Re-issuing the student's copy…`);
      try {
        const rr = await fetch('/api/admin/mark-triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reissue', runId }) });
        const rd = await rr.json().catch(() => ({}));
        setNote(rr.ok && !rd.error
          ? `Saved and re-issued to the student${rd.via === 'telegram' ? ' — Telegram sent' : rd.via === 'app' ? ' — a note in their app' : ''}.${marksNote}`
          : `Saved, but not re-issued: ${rd.error || 'try again from the desk'}.${marksNote}`);
      } catch (e) { setNote(`Saved, but not re-issued: ${(e as Error).message}.${marksNote}`); }
    } else setNote(`Saved.${marksNote}`);
    router.refresh();
  }, [detail, runId, router]);

  return (
    <>
      <StudentInk runId={runId} pages={pages} initial={initial} editor="adrian" other={other} onEditMarking={open} />
      {(loading || note) && (
        <p role="status" aria-live="polite" className="text-sm text-navy/70 px-1">{loading ? 'Opening the marking…' : note}</p>
      )}
      {openAt != null && detail && (
        <AnnotateOverlay
          runId={runId}
          pages={overlayPages}
          student={student}
          totals={totals}
          initialPage={openAt}
          allowReleased={!!detail.run.releasedAt}
          onClose={close}
          onDone={onDone}
        />
      )}
    </>
  );
}
