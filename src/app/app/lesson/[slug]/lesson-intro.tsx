'use client';

// 🎬 The intro before the board (docs/LESSONS.md § Video extras, 13 Oct 2026): the
// lesson's short clips (a real-life opener, then the tutor's hello) play one after
// another, then the lesson player opens exactly as it does without them. Only a
// lesson listed in lib/lesson-extras gets here, and only while the switch allows.
//
// One <video> element plays every clip (a new src, not a new element), so the tap
// that starts the first clip also lets the next one play with sound on a phone —
// the same trick the player's voice uses. The page asks for sound first; a phone
// refuses sound before a tap, so a "▶ Play" poster shows and one tap starts it.
// "Skip" is always there; a clip that fails to load is skipped on its own.

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { LessonIntroClip } from '@/lib/lesson-extras';
import LessonPlayer from './lesson-player';

export default function LessonWithIntro({ intro, cheer, ...player }: {
  intro: LessonIntroClip[];
  cheer?: string;
} & ComponentProps<typeof LessonPlayer>) {
  const [idx, setIdx] = useState(intro.length > 0 ? 0 : -1);
  const [needsTap, setNeedsTap] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clip = idx >= 0 ? intro[idx] : null;

  const next = () => { setNeedsTap(false); setIdx(i => (i + 1 < intro.length ? i + 1 : -1)); };

  // Each new clip: try to play it with sound; a refusal (no tap yet) puts the poster up.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clip) return;
    v.muted = false;
    v.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') setNeedsTap(true);
    });
  }, [clip]);

  const tapPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    setNeedsTap(false);
    v.muted = false;
    v.play().catch(() => next());
  };

  if (!clip) return <LessonPlayer {...player} cheerSrc={cheer} />;

  return (
    <div className="max-w-lg mx-auto pb-24 sm:pb-6" data-lsn-intro={idx}>
      <div className="flex items-center gap-2.5 pt-1 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">▶ {player.kicker ?? 'Lesson'} · {player.minutes} min</p>
          <h1 className="font-bold text-navy text-sm truncate">{player.title}</h1>
        </div>
        <button type="button" onClick={() => setIdx(-1)} data-lsn-skip
          className="shrink-0 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] px-3.5 py-1.5 text-[13px] font-semibold text-slate-600 hover:text-navy">
          Skip ›
        </button>
      </div>
      <div className="relative mx-auto overflow-hidden rounded-3xl bg-[#2a3631] shadow-[0_6px_16px_-4px_rgba(15,23,42,0.18)]"
        style={{ aspectRatio: String(clip.aspect), maxHeight: '72vh', maxWidth: '100%', width: clip.aspect < 1 ? 'auto' : '100%', height: clip.aspect < 1 ? '72vh' : 'auto' }}>
        <video
          ref={videoRef}
          key="lsn-intro-video"
          src={clip.src}
          poster={clip.poster}
          playsInline
          preload="auto"
          onEnded={next}
          onError={next}
          className="absolute inset-0 w-full h-full object-contain"
        />
        {needsTap && (
          <button type="button" onClick={tapPlay} aria-label="Play"
            className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="inline-flex items-center gap-2.5 bg-navy text-[hsl(45,100%,96%)] rounded-full pl-3 pr-5 py-2.5 font-semibold text-[15px] shadow-[0_10px_28px_-10px_rgba(15,23,42,0.6)]">
              <span aria-hidden className="w-8 h-8 rounded-full bg-white/15 inline-flex items-center justify-center text-sm">▶</span>
              Play
            </span>
          </button>
        )}
      </div>
      <div className="flex justify-center gap-1.5 mt-3" aria-hidden>
        {intro.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full ${i === idx ? 'w-6 bg-navy' : i < idx ? 'w-1.5 bg-navy/60' : 'w-1.5 bg-slate-200'}`} />
        ))}
      </div>
    </div>
  );
}
