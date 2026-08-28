'use client';

import { MobileTabs } from '@/components/PortalTabs';
// Portal-style shell for /notes (2026-08-28). The fumadocs docs-site chrome is
// gone — Adrian, reviewing on his phone: "the style of the UIUX of the notes
// should follow that of the student portal itself." So this is the /app
// vocabulary: sticky white top bar (h-14, max-w-4xl, backdrop blur), navy +
// cream + gold, white cards on a warm ground, phone-first.
//
// Navigation lives in ONE slide-over panel (the 🔍 button): search input,
// level switcher, portal link, then the topic tree. The search is the same
// live filter as before — a client-side match over server-supplied JSON whose
// results deep-link into sections and individual worked examples (their titles
// are scenario names, so "circle touching" lands on the exact card) — and the
// tree below it narrows to matching topics via the same `filterTree`.
// Phase 2 (2026-08-27) multi-level behaviour kept: one tree + index per level,
// picked by the current pathname.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { filterTree, treeFolders, type TreeFolder, type TreeRoot } from '@/lib/notes-tree';
import type { SearchEntry } from '@/lib/notes-data';

export interface ShellLevel {
  code: string;
  /** Short chip label, e.g. "A-Math". */
  chip: string;
  tree: TreeRoot;
  search: SearchEntry[];
}

/** Warm cream the portal uses for text on navy. */
const CREAM = 'text-[hsl(45,100%,96%)]';

// ── Search ───────────────────────────────────────────────────────────────────

/** Case-insensitive match, every query word somewhere in label+context. */
function matches(entry: SearchEntry, words: string[]): boolean {
  const hay = `${entry.label} ${entry.context}`.toLowerCase();
  return words.every(w => hay.includes(w));
}

function SearchResults({ entries, query }: { entries: SearchEntry[]; query: string }) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = useMemo(() => {
    if (!words.length) return [];
    const all = entries.filter(e => matches(e, words));
    // Examples first — they are the precise answer; sections and topics are
    // already reachable through the filtered tree below the results.
    const rank = { example: 0, section: 1, topic: 2 } as const;
    all.sort((a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label));
    return all.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, query]);

  if (!words.length || hits.length === 0) return null;
  return (
    <nav className="mt-3 space-y-1.5" aria-label="Search results">
      {/* Plain <a>, not <Link>: example hits carry #ex-<id> anchors and a full
          navigation is what makes the browser land on the anchor reliably. */}
      {hits.map(h => (
        <a
          key={h.url}
          href={h.url}
          className="block rounded-xl border border-black/5 bg-white px-3.5 py-2.5 shadow-sm transition-colors hover:bg-[hsl(45,100%,96%)]"
        >
          <span className="block text-sm font-semibold leading-snug text-navy">{h.label}</span>
          {h.context && (
            <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{h.context}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

// ── Topic tree ───────────────────────────────────────────────────────────────

function TopicRow({ folder, pathname }: { folder: TreeFolder; pathname: string }) {
  const active = pathname === folder.index.url;
  const inside = active || pathname.startsWith(`${folder.index.url}/`);
  // Children show for the topic being read, and for every filter survivor —
  // `filterTree` marks those defaultOpen so results are visible with no
  // second click.
  const open = inside || folder.defaultOpen === true;
  return (
    <div>
      <Link
        href={folder.index.url}
        aria-current={active ? 'page' : undefined}
        className={`block rounded-xl px-3 py-2 text-[15px] leading-snug transition-colors ${
          active
            ? `bg-navy font-semibold ${CREAM}`
            : 'font-medium text-gray-700 hover:bg-[hsl(45,100%,96%)] hover:text-navy'
        }`}
      >
        {folder.name}
      </Link>
      {open && folder.children.length > 0 && (
        <div className="mt-0.5 mb-1 ml-3 space-y-0.5 border-l border-black/10 pl-2">
          {folder.children.map(c => {
            const here = pathname === c.url;
            return (
              <Link
                key={c.$id}
                href={c.url}
                aria-current={here ? 'page' : undefined}
                className={`block rounded-lg px-3 py-1.5 text-sm leading-snug transition-colors ${
                  here
                    ? 'bg-[hsl(45,80%,94%)] font-semibold text-navy'
                    : 'text-gray-600 hover:bg-[hsl(45,100%,96%)] hover:text-navy'
                }`}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopicTree({ tree, pathname }: { tree: TreeRoot; pathname: string }) {
  return (
    <nav aria-label="Topics" className="space-y-0.5">
      {tree.children.map(node =>
        node.type === 'separator' ? (
          <p
            key={node.$id}
            className="px-3 pt-5 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 first:pt-1"
          >
            {node.name}
          </p>
        ) : (
          <TopicRow key={node.$id} folder={node} pathname={pathname} />
        ),
      )}
    </nav>
  );
}

// ── Icons (inline, stroke = currentColor) ────────────────────────────────────

function MagnifierIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

// ── The slide-over panel ─────────────────────────────────────────────────────

function BrowsePanel({
  levels,
  active,
  portalHome,
  pathname,
  onClose,
}: {
  levels: ShellLevel[];
  active: ShellLevel;
  portalHome: boolean;
  pathname: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filtered = useMemo(() => filterTree(active.tree, query), [active.tree, query]);
  // Count folders, not children — `children` also holds the family separators,
  // which would inflate "12 of 31 topics" into nonsense.
  const total = treeFolders(active.tree).length;
  const shown = treeFolders(filtered).length;

  // Escape closes; the page behind must not scroll while the sheet is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search and browse notes">
      <div className="nx-fade absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="nx-slide absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-[hsl(45,100%,98%)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Browse notes</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-navy"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <MagnifierIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search topics & examples…"
              aria-label="Search notes by topic, section or worked-example name"
              autoFocus
              className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-10 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-navy/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {/* Every search bar clears with one tap (Adrian, round 5:
                "search bars should have this: Search ✕"). */}
            {query !== '' && (
              <button
                type="button"
                onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
                aria-label="Clear search"
                className="absolute right-0 top-0 grid h-full w-10 place-items-center text-gray-400 hover:text-navy"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
          {query.trim() !== '' && (
            <p className="mt-1.5 px-1 text-xs text-gray-500" role="status" aria-live="polite">
              {shown === 0 ? 'No topics match' : `${shown} of ${total} topic${total === 1 ? '' : 's'}`}
            </p>
          )}

          {levels.length > 1 && (
            <div className="mt-3 flex gap-2" aria-label="Level">
              {levels.map(l => {
                const current = l.code === active.code;
                return (
                  <Link
                    key={l.code}
                    href={`/notes/${l.code.toLowerCase()}`}
                    aria-current={current ? 'page' : undefined}
                    className={`flex-1 rounded-full px-3.5 py-1.5 text-center text-sm font-semibold transition-colors ${
                      current
                        ? `bg-navy ${CREAM}`
                        : 'border border-black/10 bg-white text-gray-600 hover:text-navy'
                    }`}
                  >
                    {l.chip}
                  </Link>
                );
              })}
            </div>
          )}

          {portalHome && (
            <Link
              href="/app"
              className="mt-3 flex items-center gap-2 rounded-xl border border-black/5 bg-white px-3.5 py-2.5 text-sm font-semibold text-navy shadow-sm transition-colors hover:bg-[hsl(45,100%,96%)]"
            >
              <HomeIcon className="h-4 w-4" />
              Back to portal
            </Link>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <SearchResults entries={active.search} query={query} />
          <div className={query.trim() ? 'mt-4' : ''}>
            <TopicTree tree={filtered} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

export default function NotesShell({
  levels,
  portalHome = false,
  children,
}: {
  levels: ShellLevel[];
  /** Viewer arrived from the student portal — show a way back to /app. */
  portalHome?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const current = levels.find(l =>
    pathname.toLowerCase().startsWith(`/notes/${l.code.toLowerCase()}`),
  );
  const active = current ?? levels[0];
  // The panel remembers WHERE it was opened; client-side navigation (topic
  // links inside it) changes the pathname and closes it by derivation — no
  // setState-in-effect needed.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  return (
    <>
      <header className="nx-topbar sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4">
          <Link href="/notes" className="flex min-w-0 items-center gap-2">
            <span className="font-display text-lg font-bold tracking-tight text-navy">AdrianMath</span>
            <span className="rounded-full bg-[hsl(45,80%,94%)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
              {current ? current.chip : 'Notes'}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {portalHome && (
              <>
                <Link
                  href="/app"
                  className="hidden text-sm text-gray-600 transition-colors hover:text-navy sm:block"
                >
                  ← Portal
                </Link>
                <Link
                  href="/app"
                  aria-label="Back to portal"
                  className="grid h-9 w-9 place-items-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-navy sm:hidden"
                >
                  <HomeIcon className="h-4.5 w-4.5" />
                </Link>
              </>
            )}
            <button
              onClick={() => setOpenedAt(pathname)}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-500 shadow-sm transition-colors hover:border-navy/30 hover:text-navy"
            >
              <MagnifierIcon className="h-4 w-4" />
              Search
            </button>
          </div>
        </div>
      </header>

      {open && (
        <BrowsePanel
          levels={levels}
          active={active}
          portalHome={portalHome}
          pathname={pathname}
          onClose={() => setOpenedAt(null)}
        />
      )}

      <main className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 sm:pb-6">{children}</main>

      {/* Same bottom tab bar as /app, so the notes reader feels in-app on a
          phone (Adrian, 2026-08-28: "the lower menu bar is gone?"). Static
          student set — no badge counts here. */}
      <MobileTabs
        items={[
          { href: '/app', label: 'Home' },
          { href: '/app/practice', label: 'Practise' },
          { href: '/app/ask', label: 'Ask Bot', fab: true },
          { href: '/app/marking', label: 'Papers' },
          { href: '/app/my-notes', label: 'My Notebook' },
        ]}
        pendingWork={0}
      />
    </>
  );
}
