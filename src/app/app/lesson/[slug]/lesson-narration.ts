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
//   · Rate: the element plays at `rate` with preservesPitch, and the beat
//     after a clip is divided by the same rate (lib/lesson-speech.scaleBeat)
//     so the voice and the silent gaps speed up together.
//   · Pause: `paused` freezes the clip where it is AND the post-clip beat
//     with its remaining time; resume continues from that exact point — no
//     restart, no re-lock. A position change while paused loads the new clip
//     but does not play it; resume plays it. (The play() promise of a clip
//     paused before it started rejects with AbortError → 'superseded' → the
//     position stands, exactly the classification the tap-to-advance fix
//     relies on.)
//   · The next clip (and its timing sidecar, when the script declares one) is
//     prefetched into a blob URL so scene entry never waits on the network;
//     blobs are revoked on unmount.
//   · clock() exposes what the spoken-text animation needs each frame: the
//     live clip's text, currentTime, duration and parsed sidecar — read from
//     the element, so playbackRate and pause are honoured for free.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  classifyPlayRejection, narrationAt, narrationLayout, nextNarrationCue, sceneStepCount,
  type NarrationLayout, type PlayScene,
} from '@/lib/lesson-script';
import {
  DEFAULT_RATE, normalizeRate, parseTimingSidecar, scaleBeat,
  type PlaybackRate, type SpeechTiming,
} from '@/lib/lesson-speech';

/** Silence after a clip ends before the player advances — the tutor's breath (at 1×). */
export const NARRATION_BEAT_MS = 650;

// 10 ms of 8 kHz silence: the gesture-time play() that unlocks the element
// when the current position has no clip of its own to start.
const SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

// ── Persisted preferences (localStorage behind try/catch, as an external store) ──

const PREF_KEYS = { narrated: 'lsn:narrated', muted: 'lsn:muted' } as const;
const RATE_KEY = 'lsn:rate';
export type PrefKey = keyof typeof PREF_KEYS;
const prefListeners = new Set<() => void>();

function readPref(key: PrefKey): boolean {
  try { return localStorage.getItem(PREF_KEYS[key]) === '1'; } catch { return false; }
}
export function writePref(key: PrefKey, value: boolean): void {
  try { localStorage.setItem(PREF_KEYS[key], value ? '1' : '0'); } catch { /* private mode, quota — the choice just doesn't persist */ }
  prefListeners.forEach(l => l());
}
function readRate(): PlaybackRate {
  try { return normalizeRate(localStorage.getItem(RATE_KEY)); } catch { return DEFAULT_RATE; }
}
export function writeRate(rate: PlaybackRate): void {
  try { localStorage.setItem(RATE_KEY, String(rate)); } catch { /* as above */ }
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
/** The remembered playback rate (1× on the server and for anything invalid). */
export function useRatePref(): PlaybackRate {
  return useSyncExternalStore(subscribePrefs, readRate, () => DEFAULT_RATE);
}

// ── The controller ───────────────────────────────────────────────────────────

type ClipLayout = Exclude<NarrationLayout, 'none'>;
interface Position {
  scene: number; step: number; layout: ClipLayout; url: string;
  /** The narration text this clip reads (the animation's spoken side). */
  text: string;
  /** Its declared timing sidecar, or null. */
  timing: string | null;
}

/** What the spoken-text animation reads each frame. */
export interface NarrationClock {
  scene: number;
  step: number;
  layout: ClipLayout;
  text: string;
  /** Seconds into the clip (already at the playback rate — it is the element's own clock). */
  elapsed: number;
  /** Clip length in seconds, or null until metadata arrives. */
  duration: number | null;
  /** The parsed sidecar, or null (proportional timing). */
  timing: SpeechTiming | null;
  playing: boolean;
}

export interface NarrationOptions {
  scenes: PlayScene[];
  sceneIdx: number;
  step: number;
  done: boolean;
  /** Narrated mode is on (and the lesson has clips). */
  enabled: boolean;
  muted: boolean;
  /** Playback rate for the clip and for the beat after it. */
  rate: number;
  /** Frozen: clip and beat hold where they are until this drops. */
  paused: boolean;
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
  /** The live clip for the animation, or null when nothing is driving. */
  clock: () => NarrationClock | null;
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
  const timingsRef = useRef(new Map<string, SpeechTiming | null>());
  const timingPendingRef = useRef(new Set<string>());
  const beatRef = useRef(0);
  // The post-clip beat while it is pending: the layout to report and, once
  // paused, how much of it was left — so resume finishes the beat, never restarts it.
  const beatStateRef = useRef<{ layout: ClipLayout; remainingMs: number; startedAt: number } | null>(null);
  const rafRef = useRef(0);
  const firstPlayRef = useRef(false);
  const pausedRef = useRef(opts.paused);
  const pausedByHideRef = useRef(false);
  const [locked, setLocked] = useState(true);
  const [version, setVersion] = useState(0);

  // Keep the latest props reachable from stable listeners. Declared FIRST so
  // they are synced before the position effect below runs in the same commit.
  useEffect(() => { optsRef.current = opts; stepRef.current = opts.step; });

  const clearTimers = useCallback(() => {
    if (beatRef.current) { window.clearTimeout(beatRef.current); beatRef.current = 0; }
    beatStateRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    const el = elRef.current;
    if (el && !el.paused) el.pause();
    activeRef.current = null;
  }, [clearTimers]);

  const prefetchTiming = useCallback((url: string | null) => {
    if (!url || timingsRef.current.has(url) || timingPendingRef.current.has(url)) return;
    timingPendingRef.current.add(url);
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => { timingsRef.current.set(url, parseTimingSidecar(body)); })
      .catch(() => { timingsRef.current.set(url, null); }) // proportional timing for this clip
      .finally(() => { timingPendingRef.current.delete(url); });
  }, []);

  const prefetch = useCallback((cue: { audio: string | null; timing: string | null } | null) => {
    if (!cue?.audio) return;
    prefetchTiming(cue.timing);
    const url = cue.audio;
    if (blobsRef.current.has(url) || pendingRef.current.has(url) || failedRef.current.has(url)) return;
    pendingRef.current.add(url);
    fetch(url)
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(b => { blobsRef.current.set(url, URL.createObjectURL(b)); })
      .catch(() => { /* the element streams it directly when its turn comes */ })
      .finally(() => { pendingRef.current.delete(url); });
  }, [prefetchTiming]);

  // Arm (or re-arm, with what was left) the beat after a clip ends.
  const armBeat = useCallback((layout: ClipLayout, remainingMs: number) => {
    beatStateRef.current = { layout, remainingMs, startedAt: performance.now() };
    beatRef.current = window.setTimeout(() => {
      beatRef.current = 0;
      beatStateRef.current = null;
      activeRef.current = null;
      setVersion(v => v + 1);
      optsRef.current.onClipEnded(layout);
    }, remainingMs);
  }, []);

  // Both rates: a new `src` runs the media load algorithm, which RESETS
  // playbackRate to defaultPlaybackRate — with only playbackRate set, every
  // clip after a replay came back at 1× (browser run, 3 Sep 2026). Called
  // after each src assignment as well.
  const applyRate = useCallback((el: HTMLAudioElement) => {
    const rate = optsRef.current.rate;
    el.preservesPitch = true;
    if (el.defaultPlaybackRate !== rate) el.defaultPlaybackRate = rate;
    if (el.playbackRate !== rate) el.playbackRate = rate;
  }, []);

  const ensureEl = useCallback((): HTMLAudioElement => {
    if (elRef.current) return elRef.current;
    const el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    applyRate(el);
    el.addEventListener('ended', () => {
      const active = activeRef.current;
      if (!active) return;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      const { scenes, revealStep, rate } = optsRef.current;
      // A whole-scene clip whose duration never resolved: land on the final
      // step now so the scene is fully revealed before we move on.
      if (active.layout === 'scene') {
        const n = sceneStepCount(scenes[active.scene]);
        if (stepRef.current < n - 1) { selfRevealRef.current = true; revealStep(n - 1); }
      }
      const beat = scaleBeat(NARRATION_BEAT_MS, rate);
      if (pausedRef.current) beatStateRef.current = { layout: active.layout, remainingMs: beat, startedAt: 0 };
      else armBeat(active.layout, beat);
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
  }, [clearTimers, armBeat, applyRate]);

  const startClip = useCallback((pos: Position) => {
    const el = ensureEl();
    clearTimers();
    activeRef.current = pos;
    lastRevealRef.current = 0;
    el.muted = optsRef.current.muted;
    el.src = blobsRef.current.get(pos.url) ?? pos.url;
    applyRate(el); // after src: the load reset it
    prefetchTiming(pos.timing);
    // Paused: load the clip (metadata, buffering) but hold it at 0 — resume plays it.
    const played = pausedRef.current ? (el.load(), null) : el.play();
    if (played && typeof played.then === 'function') {
      played.then(() => {
        if (activeRef.current !== pos) return; // superseded before it started
        if (!firstPlayRef.current) { firstPlayRef.current = true; optsRef.current.onFirstPlay(); }
      }).catch((err: unknown) => {
        if (activeRef.current !== pos) return; // superseded before it started
        const why = classifyPlayRejection(err);
        if (why === 'superseded') return;     // our own load/pause (replay, hidden tab, pause): this position stands
        if (why === 'refused') {
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
    prefetch(nextNarrationCue(optsRef.current.scenes, pos.scene, pos.step));
  }, [ensureEl, clearTimers, prefetch, prefetchTiming, applyRate]);

  const currentCue = useCallback((): Position | null => {
    const { scenes, sceneIdx, step } = optsRef.current;
    const scene = scenes[sceneIdx];
    const layout = narrationLayout(scene);
    if (layout === 'none') return null;
    const cue = narrationAt(scene, step);
    if (!cue?.audio || failedRef.current.has(cue.audio)) return null;
    return { scene: sceneIdx, step, layout, url: cue.audio, text: cue.text, timing: cue.timing };
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
      prefetch(nextNarrationCue(optsRef.current.scenes, sceneIdx, step));
    }
  }, [sceneIdx, step, enabled, locked, done, stop, startClip, prefetch, currentCue]);

  // Mute is live: flipping it never restarts or re-times anything.
  const { muted } = opts;
  useEffect(() => { if (elRef.current) elRef.current.muted = muted; }, [muted]);

  // Rate is live too: the element re-times mid-clip, and a pending beat is
  // rescaled to the new rate for the share of it that is left.
  const { rate } = opts;
  useEffect(() => {
    if (elRef.current) applyRate(elRef.current);
    const b = beatStateRef.current;
    if (!b || !beatRef.current) return;
    const full = scaleBeat(NARRATION_BEAT_MS, rate);
    const elapsed = performance.now() - b.startedAt;
    const leftShare = Math.max(0, 1 - elapsed / Math.max(1, b.remainingMs));
    window.clearTimeout(beatRef.current);
    armBeat(b.layout, Math.round(full * leftShare));
  }, [rate, applyRate, armBeat]);

  // Pause / resume: freeze the clip and the beat exactly where they are.
  const { paused } = opts;
  useEffect(() => {
    pausedRef.current = paused;
    const el = elRef.current;
    if (paused) {
      if (beatRef.current && beatStateRef.current) {
        const b = beatStateRef.current;
        window.clearTimeout(beatRef.current);
        beatRef.current = 0;
        b.remainingMs = Math.max(0, b.remainingMs - (performance.now() - b.startedAt));
      }
      if (activeRef.current && el && !el.paused) el.pause();
      return;
    }
    const b = beatStateRef.current;
    if (b && !beatRef.current) { armBeat(b.layout, b.remainingMs); return; }
    if (activeRef.current && el && el.paused && !el.ended) {
      const pos = activeRef.current;
      el.play().then(() => {
        if (activeRef.current === pos && !firstPlayRef.current) { firstPlayRef.current = true; optsRef.current.onFirstPlay(); }
      }).catch((err: unknown) => {
        if (activeRef.current !== pos || classifyPlayRejection(err) !== 'refused') return;
        unlockedRef.current = false;
        setLocked(true);
        activeRef.current = null;
        setVersion(v => v + 1);
      });
    }
  }, [paused, armBeat]);

  // Backgrounded tab: pause the voice, resume where it was on return — unless
  // the student had paused it themselves.
  useEffect(() => {
    const onVisibility = () => {
      const el = elRef.current;
      if (!el) return;
      if (document.hidden) {
        if (activeRef.current && !el.paused) { el.pause(); pausedByHideRef.current = true; }
      } else if (pausedByHideRef.current) {
        pausedByHideRef.current = false;
        if (activeRef.current && !pausedRef.current) el.play().catch(() => { /* stays paused; next tap restarts */ });
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
      // Only a policy refusal means no gesture reached the element. An
      // AbortError here is the next position's clip replacing the silence
      // inside this same tap (tap-to-advance → advance → startClip): the
      // unlock stood. Reverting on it re-locked the player mid-scene — poster
      // back, the fresh clip paused (browser run, 2026-09-02).
      played.catch((err: unknown) => {
        if (classifyPlayRejection(err) !== 'refused') return;
        unlockedRef.current = false;
        setLocked(true);
      });
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
  const clock = useCallback((): NarrationClock | null => {
    const pos = activeRef.current;
    const el = elRef.current;
    if (!pos || !el) return null;
    const d = el.duration;
    return {
      scene: pos.scene, step: pos.step, layout: pos.layout, text: pos.text,
      elapsed: el.currentTime,
      duration: Number.isFinite(d) && d > 0 ? d : null,
      timing: pos.timing ? (timingsRef.current.get(pos.timing) ?? null) : null,
      playing: !el.paused && !el.ended,
    };
  }, []);

  return { locked, version, isDriving, elapsed, clock, unlock, unlockSilently, replay };
}
