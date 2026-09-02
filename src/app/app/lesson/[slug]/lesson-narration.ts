'use client';

// Narrated mode for the lesson player (/app/lesson/[slug]) — the voice track.
//
// ONE <audio> element for the whole lesson, created on the first user gesture
// and reused for every clip. That is the iOS Safari unlock pattern: an element
// that has been play()ed inside a gesture may be play()ed again
// programmatically with a different src, so scene→scene auto-advance keeps
// talking without a tap per clip (a fresh element per clip would need a fresh
// gesture each time). Chrome/Android grant the same after any activation.
//
// Pacing contract with the player:
//   · narrationAt(scene, step) names the clip that STARTS at a position.
//     Per-step arrays cue every step; a whole-scene string cues step 0 and
//     this hook spreads the remaining steps evenly across that clip.
//   · When a clip ends the hook waits one beat, then calls onClipEnded(layout)
//     — the player advances (one step for per-step clips, the next scene for
//     a whole-scene clip). Positions without a clip stay on the player's own
//     timer beats (isDriving() is false there), so a half-narrated lesson
//     still flows; a clip that fails to load falls back the same way.
//   · Check scenes: the lead-in clip plays on entry; the player's answer gate
//     owns the rest (it ignores onClipEnded for checks).
//   · A tap ahead stops the current clip: the next position's clip starts if
//     it has one; inside a whole-scene clip the timers take over.
//   · Muted keeps the clock: the clip still plays, muted, so pacing is
//     identical — a muted narrated lesson is a silent video, not a new mode.
//   · The next clip is prefetched into a blob URL so scene entry never waits
//     on the network; blobs are revoked on unmount.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  narrationAt, narrationLayout, nextNarrationAudio, sceneStepCount,
  type NarrationLayout, type PlayScene,
} from '@/lib/lesson-script';

/** Silence after a clip ends before the player advances — the tutor's breath. */
export const NARRATION_BEAT_MS = 650;

// 10 ms of 8 kHz silence: the gesture-time play() that unlocks the element
// when the current position has no clip of its own to start.
const SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

// ── Persisted preferences (localStorage behind try/catch, as an external store) ──

const PREF_KEYS = { narrated: 'lsn:narrated', muted: 'lsn:muted' } as const;
export type PrefKey = keyof typeof PREF_KEYS;
const prefListeners = new Set<() => void>();

function readPref(key: PrefKey): boolean {
  try { return localStorage.getItem(PREF_KEYS[key]) === '1'; } catch { return false; }
}
export function writePref(key: PrefKey, value: boolean): void {
  try { localStorage.setItem(PREF_KEYS[key], value ? '1' : '0'); } catch { /* private mode, quota — the choice just doesn't persist */ }
  prefListeners.forEach(l => l());
}
function subscribePrefs(cb: () => void) {
  prefListeners.add(cb);
  window.addEventListener('storage', cb);
  return () => { prefListeners.delete(cb); window.removeEventListener('storage', cb); };
}
/** SSR-safe (false on the server, no hydration mismatch) — same shape as useReducedMotion. */
export function usePref(key: PrefKey): boolean {
  return useSyncExternalStore(subscribePrefs, () => readPref(key), () => false);
}

// ── The controller ───────────────────────────────────────────────────────────

type ClipLayout = Exclude<NarrationLayout, 'none'>;
interface Position { scene: number; step: number; layout: ClipLayout; url: string }

export interface NarrationOptions {
  scenes: PlayScene[];
  sceneIdx: number;
  step: number;
  done: boolean;
  /** Narrated mode is on (and the lesson has clips). */
  enabled: boolean;
  muted: boolean;
  /** Reveal a later sub-step of the current scene (whole-scene clips). */
  revealStep: (step: number) => void;
  /** The clip for the current position finished, plus a beat — advance. */
  onClipEnded: (layout: ClipLayout) => void;
  /** The first real clip started — telemetry hook. */
  onFirstPlay: () => void;
}

export interface NarrationController {
  /** No gesture has unlocked audio yet (autoplay policy) — show the play affordance. */
  locked: boolean;
  /** Bumps on transitions the player's timer effect must re-evaluate on (clip ended/failed, unlock refused). */
  version: number;
  /** A clip currently owns pacing. Read inside effects/handlers only. */
  isDriving: () => boolean;
  /** Seconds into the current clip (0 when idle). */
  elapsed: () => number;
  /** From a gesture handler: unlock the element and start the current position's clip if it has one. */
  unlock: () => void;
  /** From a gesture handler whose next act changes position: unlock with silence; that position's clip starts on its own. */
  unlockSilently: () => void;
  /** Restart the current position's clip from the top. */
  replay: () => void;
}

export function useNarration(opts: NarrationOptions): NarrationController {
  const elRef = useRef<HTMLAudioElement | null>(null);
  const optsRef = useRef(opts);
  const stepRef = useRef(opts.step);
  const unlockedRef = useRef(false);
  const activeRef = useRef<Position | null>(null);
  const lastPosRef = useRef<{ scene: number; step: number } | null>(null);
  const selfRevealRef = useRef(false);
  const lastRevealRef = useRef(0);
  const blobsRef = useRef(new Map<string, string>());
  const pendingRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());
  const beatRef = useRef(0);
  const rafRef = useRef(0);
  const firstPlayRef = useRef(false);
  const pausedByHideRef = useRef(false);
  const [locked, setLocked] = useState(true);
  const [version, setVersion] = useState(0);

  // Keep the latest props reachable from stable listeners. Declared FIRST so
  // they are synced before the position effect below runs in the same commit.
  useEffect(() => { optsRef.current = opts; stepRef.current = opts.step; });

  const clearTimers = useCallback(() => {
    if (beatRef.current) { window.clearTimeout(beatRef.current); beatRef.current = 0; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    const el = elRef.current;
    if (el && !el.paused) el.pause();
    activeRef.current = null;
  }, [clearTimers]);

  const prefetch = useCallback((url: string | null) => {
    if (!url || blobsRef.current.has(url) || pendingRef.current.has(url) || failedRef.current.has(url)) return;
    pendingRef.current.add(url);
    fetch(url)
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(b => { blobsRef.current.set(url, URL.createObjectURL(b)); })
      .catch(() => { /* the element streams it directly when its turn comes */ })
      .finally(() => { pendingRef.current.delete(url); });
  }, []);

  const ensureEl = useCallback((): HTMLAudioElement => {
    if (elRef.current) return elRef.current;
    const el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    el.addEventListener('ended', () => {
      const active = activeRef.current;
      if (!active) return;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      const { scenes, revealStep, onClipEnded } = optsRef.current;
      // A whole-scene clip whose duration never resolved: land on the final
      // step now so the scene is fully revealed before we move on.
      if (active.layout === 'scene') {
        const n = sceneStepCount(scenes[active.scene]);
        if (stepRef.current < n - 1) { selfRevealRef.current = true; revealStep(n - 1); }
      }
      beatRef.current = window.setTimeout(() => {
        beatRef.current = 0;
        activeRef.current = null;
        setVersion(v => v + 1);
        onClipEnded(active.layout);
      }, NARRATION_BEAT_MS);
    });
    el.addEventListener('error', () => {
      const active = activeRef.current;
      if (!active) return;
      failedRef.current.add(active.url);
      activeRef.current = null;
      clearTimers();
      setVersion(v => v + 1); // the player's timer beat takes this position
    });
    elRef.current = el;
    return el;
  }, [clearTimers]);

  const startClip = useCallback((pos: Position) => {
    const el = ensureEl();
    clearTimers();
    activeRef.current = pos;
    lastRevealRef.current = 0;
    el.muted = optsRef.current.muted;
    el.src = blobsRef.current.get(pos.url) ?? pos.url;
    const played = el.play();
    if (played && typeof played.then === 'function') {
      played.then(() => {
        if (activeRef.current !== pos) return; // superseded before it started
        if (!firstPlayRef.current) { firstPlayRef.current = true; optsRef.current.onFirstPlay(); }
      }).catch((err: unknown) => {
        if (activeRef.current !== pos) return;
        if ((err as { name?: string } | null)?.name === 'NotAllowedError') {
          // Autoplay policy refused — no gesture has reached this element yet.
          // Back to locked: the play affordance returns and the next tap unlocks.
          unlockedRef.current = false;
          setLocked(true);
        } else {
          failedRef.current.add(pos.url);
        }
        activeRef.current = null;
        setVersion(v => v + 1);
      });
    }
    // Whole-scene clip with several sub-steps: reveal them evenly across it.
    const n = sceneStepCount(optsRef.current.scenes[pos.scene]);
    if (pos.layout === 'scene' && n > 1) {
      const tick = () => {
        if (activeRef.current !== pos) return;
        const d = el.duration;
        if (Number.isFinite(d) && d > 0) {
          const k = Math.min(n - 1, Math.floor((el.currentTime / d) * n));
          if (k > stepRef.current && k > lastRevealRef.current) {
            lastRevealRef.current = k;
            selfRevealRef.current = true;
            optsRef.current.revealStep(k);
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    prefetch(nextNarrationAudio(optsRef.current.scenes, pos.scene, pos.step));
  }, [ensureEl, clearTimers, prefetch]);

  const currentCue = useCallback((): Position | null => {
    const { scenes, sceneIdx, step } = optsRef.current;
    const scene = scenes[sceneIdx];
    const layout = narrationLayout(scene);
    if (layout === 'none') return null;
    const cue = narrationAt(scene, step);
    if (!cue?.audio || failedRef.current.has(cue.audio)) return null;
    return { scene: sceneIdx, step, layout, url: cue.audio };
  }, []);

  // The position effect: what to play now that (scene, step, mode) is this.
  const { sceneIdx, step, enabled, done } = opts;
  useEffect(() => {
    const prev = lastPosRef.current;
    lastPosRef.current = { scene: sceneIdx, step };
    if (!enabled || locked || done) { stop(); return; }
    const active = activeRef.current;
    if (active && active.scene === sceneIdx) {
      if (active.layout === 'steps') {
        if (active.step === step) return; // this very step is already playing (unlock started it)
      } else {
        if (selfRevealRef.current) { selfRevealRef.current = false; return; } // our own spread reveal
        const movedBack = prev !== null && prev.scene === sceneIdx && prev.step > step;
        if (step === 0 && movedBack) { /* back to the top → replay (falls through) */ }
        else if (step === 0) return;   // same start re-entered (unlock just started it)
        else { stop(); return; }       // tapped ahead inside the clip → timers own the rest
      }
    }
    const pos = currentCue();
    if (pos) startClip(pos);
    else {
      if (active) stop();
      prefetch(nextNarrationAudio(optsRef.current.scenes, sceneIdx, step));
    }
  }, [sceneIdx, step, enabled, locked, done, stop, startClip, prefetch, currentCue]);

  // Mute is live: flipping it never restarts or re-times anything.
  const { muted } = opts;
  useEffect(() => { if (elRef.current) elRef.current.muted = muted; }, [muted]);

  // Backgrounded tab: pause the voice, resume where it was on return.
  useEffect(() => {
    const onVisibility = () => {
      const el = elRef.current;
      if (!el) return;
      if (document.hidden) {
        if (activeRef.current && !el.paused) { el.pause(); pausedByHideRef.current = true; }
      } else if (pausedByHideRef.current) {
        pausedByHideRef.current = false;
        if (activeRef.current) el.play().catch(() => { /* stays paused; next tap restarts */ });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Unmount: silence, drop the element, free the prefetched blobs.
  useEffect(() => {
    const blobs = blobsRef.current;
    return () => {
      clearTimers();
      const el = elRef.current;
      if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
      for (const u of blobs.values()) URL.revokeObjectURL(u);
      blobs.clear();
      activeRef.current = null;
    };
  }, [clearTimers]);

  const unlockWith = useCallback((silently: boolean) => {
    const el = ensureEl();
    if (unlockedRef.current) {
      if (!silently && !activeRef.current) { const pos = currentCue(); if (pos) startClip(pos); }
      return;
    }
    // Optimistic: a play() inside a gesture succeeds; a rejection reverts.
    unlockedRef.current = true;
    setLocked(false);
    const pos = silently ? null : currentCue();
    if (pos) { startClip(pos); return; }
    el.muted = optsRef.current.muted;
    el.src = SILENT_WAV;
    const played = el.play();
    if (played && typeof played.then === 'function') {
      played.catch(() => { unlockedRef.current = false; setLocked(true); });
    }
  }, [ensureEl, currentCue, startClip]);

  const unlock = useCallback(() => unlockWith(false), [unlockWith]);
  const unlockSilently = useCallback(() => unlockWith(true), [unlockWith]);
  const replay = useCallback(() => {
    const pos = activeRef.current ?? currentCue();
    if (pos && unlockedRef.current) startClip(pos);
  }, [currentCue, startClip]);
  const isDriving = useCallback(() => activeRef.current !== null, []);
  const elapsed = useCallback(() => (activeRef.current && elRef.current ? elRef.current.currentTime : 0), []);

  return { locked, version, isDriving, elapsed, unlock, unlockSilently, replay };
}
