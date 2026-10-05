'use client';
// ▶ Watch it (5 Oct 2026) — the button under a science MCQ's worked solution
// and the player it opens, full screen over the practice page so ‹ lands back
// on the same question with its solution still open. The button appears only
// when /api/portal/science/watch answers a clip for this question (404 = this
// question has none; 403 = the switch is shut for this viewer — no button).
// The clip plays silent on its ▶ Auto timers; the voice is fetched once in the
// background and the player's 🔊 Voice pill appears when it lands (off until
// tapped — iOS needs the gesture anyway).
import { useEffect, useMemo, useState } from 'react';
import LessonPlayer from '../lesson/[slug]/lesson-player';
import { attachVoice } from '@/lib/explain-voice';
import { fileHref } from '@/lib/student-files-url';
import type { LessonCharacter, LessonTheme, PlayScene } from '@/lib/lesson-script';

interface Clip { slug: string; title: string; topic: string; minutes: number; theme: LessonTheme; character: LessonCharacter; scenes: PlayScene[] }

/** `known` (the /admin/watch-it gallery): the clip is known to exist — show the button at once and
 *  fetch the clip on the first tap, so a page of a hundred buttons makes no request until one is pressed. */
export default function WatchIt({ questionId, known = false, label = 'Watch it' }: { questionId: string; known?: boolean; label?: string }) {
  const [clip, setClip] = useState<Clip | null>(null);
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<(string | null)[] | null>(null);
  const [want, setWant] = useState(!known);

  useEffect(() => {
    if (!want) return;
    let live = true;
    setClip(null); setUrls(null);
    fetch(`/api/portal/science/watch?id=${encodeURIComponent(questionId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: Clip | null) => { if (live && j && Array.isArray(j.scenes)) { setClip(j); if (known) setOpen(true); } })
      .catch(() => {});
    return () => { live = false; };
  }, [questionId, want, known]);

  // The voice: asked for once, when the clip is first opened.
  useEffect(() => {
    if (!open || urls) return;
    let live = true;
    fetch('/api/portal/science/watch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: questionId }) })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { urls?: (string | null)[] } | null) => {
        if (!live || !j || !Array.isArray(j.urls)) return;
        const mapped = j.urls.map(u => (u ? fileHref(u) : null));
        if (mapped.some(Boolean)) setUrls(mapped);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [open, urls, questionId]);

  const scenes = useMemo(() => (clip ? (urls ? attachVoice(clip.scenes, urls) : clip.scenes) : []), [clip, urls]);

  // Esc closes; the page underneath does not scroll while the clip plays.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!clip && !known) return null;
  return (
    <>
      <button type="button" onClick={() => (clip ? setOpen(true) : setWant(true))} data-watch-it
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy text-[hsl(45,100%,96%)] px-4 py-2.5 text-sm font-bold shadow-[0_6px_16px_-8px_rgba(15,23,42,0.6)] hover:opacity-90 active:scale-[0.98] motion-safe:transition">
        <span aria-hidden>▶</span> {want && !clip ? 'Loading…' : label}
      </button>
      {open && clip && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-[hsl(45,40%,97%)]" role="dialog" aria-modal="true" aria-label={`Watch it · ${clip.title}`}>
          {/* A smaller tutor in the corner: a Watch it board is full of working to the last line. */}
          <style>{`[data-watch-player] .lsn-char[data-look="picture"] { width: clamp(72px, 22%, 104px); }`}</style>
          <div data-watch-player className="mx-auto max-w-xl px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10">
            <LessonPlayer
              slug={clip.slug}
              title={clip.title}
              topic={clip.topic}
              minutes={clip.minutes}
              theme={clip.theme}
              character={clip.character}
              scenes={scenes}
              kicker="Watch it"
              doneTitle="That's the working"
              doneText="Every step is the one in the solution. Try the next question while it's fresh."
              practiceLabel="‹ Back to the question"
              onClose={() => setOpen(false)}
              startAuto
            />
          </div>
        </div>
      )}
    </>
  );
}
