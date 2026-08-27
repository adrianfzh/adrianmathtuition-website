// Skeleton primitives for the /app/* loading.tsx files.
//
// Why these exist (perf, 2026-08-28): every portal page is a force-dynamic
// server component, so without a loading boundary a tap did NOTHING until the
// whole server render (Supabase auth + Airtable + queries) came back — the
// "portal feels laggy" complaint. A loading.tsx per segment gives Next a
// prefetchable static shell: the skeleton paints the moment the tab is
// tapped, then the real page streams in. Shapes roughly match each page so
// the swap-in doesn't jump.
//
// Server-safe (no hooks, no state) — keep it that way so the fallbacks stay
// in the prefetched static shell.

/** One pulsing block. Size/shape via className (h-*, w-*, rounded-*). */
export function Sk({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-slate-900/[0.06] ${className}`} />;
}

/** White card shell matching the portal card look. */
export function SkCard({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`bg-white rounded-2xl border border-black/5 shadow-sm p-4 ${className}`}>
      {children}
    </div>
  );
}

/** Icon square + two text lines — the portal's standard row-card innards. */
export function SkRow({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Sk className="w-11 h-11 rounded-2xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Sk className="h-3.5 w-2/5 rounded-md" />
        <Sk className="h-3 w-3/5 rounded-md" />
      </div>
    </div>
  );
}

/** n stacked row-cards (list pages: assignments, notebook, papers). */
export function SkRowCards({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <SkCard key={i}><SkRow /></SkCard>
      ))}
    </div>
  );
}

/** Page title bar (h1-sized block, optional right-side action block). */
export function SkTitle({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <Sk className="h-7 w-40 rounded-lg" />
      {action && <Sk className="h-9 w-28 rounded-xl" />}
    </div>
  );
}
