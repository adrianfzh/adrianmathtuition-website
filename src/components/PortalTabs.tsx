'use client';

// Portal navigation — mobile bottom tabs + desktop top links. Client component
// purely so it knows the current path: the active tab lights in ITS OWN colour
// (lib/portal-theme.ts — amber Practise, teal Hand in, violet Marked), which is
// the same colour that destination wears on Home, so the tab bar teaches the
// heuristic instead of four identical grey emojis.
//
// `pendingWork` ("From Adrian" items still to do) renders as a numeric badge on
// Home — the convention every app a student already uses (Mail, WhatsApp,
// Instagram) — rather than the 8px dot it used to be, which Adrian found easy
// to miss (2026-08-22).

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PortalIcon from './PortalIcon';
import { surfaceForHref } from '@/lib/portal-theme';

export type NavItem = { href: string; label: string; fab?: boolean };

function tourKey(href: string): string {
  return href === '/app' ? 'home' : href.slice('/app/'.length);
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app' || pathname.startsWith('/app/assignments');
  // The Science tab's Home is only its own page — its Hand in and Papers have their own tabs.
  if (href === '/app/science') return pathname === '/app/science';
  return pathname === href || pathname.startsWith(href + '/');
}

// 🧪 Two families, one shell (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026,
// Adrian: "two tabs (math, then science) at the top, each with their own full
// bottom menu"). Which family is on screen is read off the path — everything
// under /app/science is science, the rest is maths — so the bar switches with
// no cookie and no server round trip.
export type SubjectFamily = 'math' | 'science';
export function familyOfPath(pathname: string): SubjectFamily {
  return pathname === '/app/science' || pathname.startsWith('/app/science/') ? 'science' : 'math';
}

/** The Math | Science switcher under the top bar. */
export function FamilySwitch() {
  const pathname = usePathname();
  const family = familyOfPath(pathname);
  const btn = (on: boolean) => `flex-1 text-center text-sm font-semibold rounded-full px-4 py-1.5 transition select-none active:scale-95 ${
    on ? 'bg-navy text-[hsl(45,100%,96%)] shadow-sm' : 'text-gray-600 hover:text-navy'}`;
  return (
    <div role="tablist" aria-label="Subject" className="flex items-center gap-1 rounded-full bg-navy/5 p-1 max-w-xs mx-auto">
      <Link href="/app" role="tab" aria-selected={family === 'math'} className={btn(family === 'math')}>Math</Link>
      <Link href="/app/science" role="tab" aria-selected={family === 'science'} className={btn(family === 'science')}>
        <span className="inline-flex items-center gap-1.5"><PortalIcon name="flask" className="w-4 h-4" />Science</span>
      </Link>
    </div>
  );
}

export function Badge({ n, className = '' }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span aria-label={`${n} to do from Adrian`}
      className={`absolute min-w-[18px] h-[18px] px-1 rounded-full bg-[hsl(43,90%,55%)] text-navy text-[11px] font-bold leading-[18px] text-center ring-2 ring-white ${className}`}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

export function DesktopLinks({ items, scienceItems, pendingWork }: { items: NavItem[]; scienceItems?: NavItem[]; pendingWork: number }) {
  const pathname = usePathname();
  const list = familyOfPath(pathname) === 'science' && scienceItems?.length ? scienceItems : items;
  return (
    <div className="hidden sm:flex items-center gap-1">
      {list.map(l => {
        const s = surfaceForHref(l.href);
        const active = isActive(pathname, l.href);
        return (
          <Link key={l.href} href={l.href} data-tour={tourKey(l.href)}
            className={`relative flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 transition select-none active:scale-95 ${
              active ? `${s.tint} ${s.text} font-semibold` : 'text-gray-600 hover:text-navy hover:bg-navy/5'}`}>
            <PortalIcon name={s.icon} className="w-4 h-4" />
            {l.label}
            {l.href === '/app' && <Badge n={pendingWork} className="-top-1 -right-1" />}
          </Link>
        );
      })}
    </div>
  );
}

export function MobileTabs({ items, scienceItems, pendingWork }: { items: NavItem[]; scienceItems?: NavItem[]; pendingWork: number }) {
  const pathname = usePathname();
  const list = familyOfPath(pathname) === 'science' && scienceItems?.length ? scienceItems : items;
  const cols = list.length === 4 ? 'grid-cols-4' : list.length === 5 ? 'grid-cols-5'
    : list.length === 6 ? 'grid-cols-6' : list.length === 7 ? 'grid-cols-7' : 'grid-cols-3';
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/5 pb-[env(safe-area-inset-bottom)]">
      <div className={`grid ${cols} h-[60px] text-center text-[11px]`}>
        {list.map(t => {
          const s = surfaceForHref(t.href);
          const active = isActive(pathname, t.href);
          // Instagram-style raised centre button (Adrian, 2026-08-28) — one
          // hero action gets a navy circle floating above the bar.
          if (t.fab) {
            return (
              <Link key={t.href} href={t.href} data-tour={tourKey(t.href)} aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center justify-end pb-1 gap-0.5 select-none transition-transform active:scale-95">
                <span className={`-mt-7 flex items-center justify-center w-14 h-14 rounded-full shadow-lg border-4 border-[hsl(45,100%,98%)] transition-colors ${active ? 'bg-navy' : 'bg-navy/90'}`}>
                  <PortalIcon name={s.icon} className="w-6 h-6 text-[hsl(45,100%,96%)]" strokeWidth={2.2} />
                </span>
                <span className={`text-[10px] ${active ? 'text-navy font-semibold' : 'text-gray-500'}`}>{t.label}</span>
              </Link>
            );
          }
          return (
            <Link key={t.href} href={t.href} data-tour={tourKey(t.href)} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 select-none transition-transform active:scale-95 ${active ? `${s.text} font-semibold` : 'text-gray-500'}`}>
              <span className={`relative flex items-center justify-center w-11 h-7 rounded-full transition-colors ${active ? s.tint : ''}`}>
                <PortalIcon name={s.icon} className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 2} />
                {t.href === '/app' && <Badge n={pendingWork} className="-top-1.5 right-0" />}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
