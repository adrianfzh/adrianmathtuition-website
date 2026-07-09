// Client-only localStorage tracking of which units a student has finished.
// Key: learn_done_v1 → { [unitId]: true }.
'use client';

const KEY = 'learn_done_v1';

function read(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function getDoneMap(): Record<string, boolean> {
  return read();
}

export function isDone(id: string): boolean {
  return !!read()[id];
}

export function markDone(id: string): void {
  if (typeof window === 'undefined') return;
  const map = read();
  map[id] = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

// ------------------------------------------------------------ session recap
// Ephemeral "units cleared today" counter, kept in sessionStorage so it resets
// per tab/session. Key: learn_session_v1 → { date: 'YYYY-MM-DD', count: number }.
const SESSION_KEY = 'learn_session_v1';

function todayLocal(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // SGT day
}

function readSession(): { date: string; count: number } {
  if (typeof window === 'undefined') return { date: todayLocal(), count: 0 };
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
    if (raw && raw.date === todayLocal() && typeof raw.count === 'number') return raw;
  } catch { /* ignore */ }
  return { date: todayLocal(), count: 0 };
}

// Bumps and returns the new session count. Call once when a unit is finished.
export function bumpSessionCleared(): number {
  const s = readSession();
  const next = { date: todayLocal(), count: s.count + 1 };
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
  }
  return next.count;
}

// Current session count (0 if none / stale day).
export function getSessionCleared(): number {
  return readSession().count;
}
