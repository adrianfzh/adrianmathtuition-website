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
