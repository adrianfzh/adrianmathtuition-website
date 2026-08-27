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

export type NavItem = { href: string; label: string };

function tourKey(href: string): string {
  return href === '/app' ? 'home' : href.slice('/app/'.length);
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app' || pathname.startsWith('/app/assignments');
  return pathname === href || pathname.startsWith(href + '/');
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

export function DesktopLinks({ items, pendingWork }: { items: NavItem[]; pendingWork: number }) {
  const pathname = usePathname();
  return (
    <div className="hidden sm:flex items-center gap-1">
      {items.map(l => {
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

export function MobileTabs({ items, pendingWork }: { items: NavItem[]; pendingWork: number }) {
  const pathname = usePathname();
  const cols = items.length === 4 ? 'grid-cols-4' : items.length === 5 ? 'grid-cols-5'
    : items.length === 6 ? 'grid-cols-6' : items.length === 7 ? 'grid-cols-7' : 'grid-cols-3';
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/5 pb-[env(safe-area-inset-bottom)]">
      <div className={`grid ${cols} h-[60px] text-center text-[11px]`}>
        {items.map(t => {
          const s = surfaceForHref(t.href);
          const active = isActive(pathname, t.href);
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
