'use client';

// "Done for today" for the Home resurface card: hides the card on this device
// until tomorrow (localStorage, per SGT day). No server state — the card is
// derived fresh each day anyway, and a dismissal is a courtesy, not a record.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const KEY = 'nb_resurface_done';
const Ctx = createContext<{ dismiss: () => void } | null>(null);

function ResurfaceDismiss({ day, children }: { day: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { if (window.localStorage.getItem(KEY) === day) setHidden(true); } catch { /* private mode */ }
  }, [day]);
  const dismiss = () => {
    try { window.localStorage.setItem(KEY, day); } catch { /* private mode */ }
    setHidden(true);
  };
  if (hidden) return null;
  return <Ctx.Provider value={{ dismiss }}>{children}</Ctx.Provider>;
}

/** The "Done for today" button — a named export (a static on a client component is not reachable from a server component). */
export function ResurfaceDismissButton() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <button type="button" onClick={ctx.dismiss} className="text-[12px] font-semibold text-gray-500 rounded-full px-3 py-1.5 border border-black/10 hover:bg-slate-50">
      Done for today
    </button>
  );
}

export default ResurfaceDismiss;
