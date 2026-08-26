// Portal visual identity — ONE colour + ONE icon per destination, used
// everywhere that destination appears (Home tile, tab bar, flow strip, page
// header). The point is a heuristic for students: amber always means
// Practise, teal always means Hand in, violet always means Marked work, navy
// with a gold badge always means something from Adrian. Adrian's brief
// (2026-08-22): the old Home was identical navy/white cards with emojis —
// "generic, like how an AI would style it" — and nothing told a student which
// button did what before they read it.
//
// Pure data (no React) so the server layout, client components and tests can
// all import it. Icon names resolve in components/PortalIcon.tsx.

export type SurfaceKey = 'home' | 'assignments' | 'plan' | 'practice' | 'submit' | 'marking' | 'notebook' | 'learn' | 'notes' | 'settings' | 'lesson';

export type SurfaceIdentity = {
  key: SurfaceKey;
  label: string;
  icon: string;
  /** Solid tile: icon-on-colour (Home tiles, active tab icon chip). */
  tile: string;
  /** Text/icon colour on a light background (active tab label, headers). */
  text: string;
  /** Soft tint background for chips / selected rows. */
  tint: string;
  /** Border/ring colour for focus + selected states. */
  ring: string;
};

export const SURFACES: Record<SurfaceKey, SurfaceIdentity> = {
  home: {
    key: 'home', label: 'Home', icon: 'home',
    tile: 'bg-navy text-[hsl(45,100%,96%)]', text: 'text-navy', tint: 'bg-navy/5', ring: 'ring-navy/30',
  },
  assignments: {
    key: 'assignments', label: 'From Adrian', icon: 'inbox',
    tile: 'bg-navy text-[hsl(43,90%,60%)]', text: 'text-navy', tint: 'bg-navy/5', ring: 'ring-navy/30',
  },
  plan: {
    key: 'plan', label: 'My Plan', icon: 'target',
    tile: 'bg-emerald-500 text-white', text: 'text-emerald-700', tint: 'bg-emerald-50', ring: 'ring-emerald-400/60',
  },
  practice: {
    key: 'practice', label: 'Practise', icon: 'pencil',
    tile: 'bg-amber-400 text-navy', text: 'text-amber-700', tint: 'bg-amber-50', ring: 'ring-amber-400/60',
  },
  submit: {
    key: 'submit', label: 'Hand in', icon: 'camera',
    tile: 'bg-teal-500 text-white', text: 'text-teal-700', tint: 'bg-teal-50', ring: 'ring-teal-400/60',
  },
  marking: {
    key: 'marking', label: 'Marked', icon: 'file-check',
    tile: 'bg-violet-500 text-white', text: 'text-violet-700', tint: 'bg-violet-50', ring: 'ring-violet-400/60',
  },
  notebook: {
    key: 'notebook', label: 'Notebook', icon: 'notebook',
    tile: 'bg-rose-500 text-white', text: 'text-rose-700', tint: 'bg-rose-50', ring: 'ring-rose-400/60',
  },
  learn: {
    key: 'learn', label: 'Learn', icon: 'book',
    tile: 'bg-sky-500 text-white', text: 'text-sky-700', tint: 'bg-sky-50', ring: 'ring-sky-400/60',
  },
  notes: {
    key: 'notes', label: 'Notes', icon: 'book',
    tile: 'bg-sky-500 text-white', text: 'text-sky-700', tint: 'bg-sky-50', ring: 'ring-sky-400/60',
  },
  settings: {
    key: 'settings', label: 'Settings', icon: 'settings',
    tile: 'bg-slate-500 text-white', text: 'text-slate-600', tint: 'bg-slate-100', ring: 'ring-slate-400/60',
  },
  lesson: {
    key: 'lesson', label: 'Next lesson', icon: 'calendar',
    tile: 'bg-slate-200 text-navy', text: 'text-slate-600', tint: 'bg-slate-100', ring: 'ring-slate-400/60',
  },
};

/** Identity for a nav href ('/app/marking' → marking; '/app' → home). */
export function surfaceForHref(href: string): SurfaceIdentity {
  const key = href === '/app' ? 'home' : href.replace(/^\/app\//, '').split(/[/?]/)[0];
  return SURFACES[(key in SURFACES ? key : 'home') as SurfaceKey];
}
