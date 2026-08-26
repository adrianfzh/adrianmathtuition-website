'use client';
// The fumadocs shell. Client-side because the search is a live filter over
// server-supplied JSON: the sidebar tree narrows to matching topics, and a
// results list deep-links into sections and individual worked examples (their
// titles are scenario names, so "circle touching" lands on the exact card).
// Phase 2 (2026-08-27): multi-level — one tree + index per level, picked by
// the current pathname.

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { Root, Separator } from 'fumadocs-core/page-tree';
import { filterTree, treeFolders, type TreeRoot } from '@/lib/notes-tree';
import type { SearchEntry } from '@/lib/notes-data';

export interface ShellLevel {
  code: string;
  /** Short chip label, e.g. "A-Math". */
  chip: string;
  tree: TreeRoot;
  search: SearchEntry[];
}

/**
 * Family headings between groups of topics ("TRIGONOMETRY", "CALCULUS").
 *
 * Overridden rather than styled in CSS: fumadocs' own separator is a bare <p>
 * carrying nothing but Tailwind utilities, so any selector targeting it would be
 * keyed to class names that are free to change on a minor upgrade.
 */
function FamilyHeading({ item }: { item: Separator }) {
  return <p className="nx-sep">{item.name}</p>;
}

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
    <nav className="nx-hits" aria-label="Search results">
      {hits.map(h => (
        <a key={h.url} href={h.url} className="nx-hit">
          <span className="nx-hit-label">{h.label}</span>
          {h.context && <span className="nx-hit-context">{h.context}</span>}
        </a>
      ))}
    </nav>
  );
}

function SidebarFilter({
  value,
  onChange,
  total,
  shown,
}: {
  value: string;
  onChange: (v: string) => void;
  total: number;
  shown: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="nx-filter">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search topics & examples…"
          aria-label="Search notes by topic, section or worked-example name"
        />
      </div>
      {value.trim() !== '' && (
        <p className="px-1 text-xs text-fd-muted-foreground" role="status" aria-live="polite">
          {shown === 0
            ? 'No topics match'
            : `${shown} of ${total} topic${total === 1 ? '' : 's'}`}
        </p>
      )}
    </div>
  );
}

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
  const active =
    levels.find(l => pathname.toLowerCase().startsWith(`/notes/${l.code.toLowerCase()}`)) ??
    levels[0];

  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterTree(active.tree, query), [active.tree, query]);
  // Count folders, not children — `children` also holds the family separators,
  // which would inflate "12 of 31 topics" into nonsense.
  const total = treeFolders(active.tree).length;
  const shown = treeFolders(filtered).length;

  return (
    <RootProvider
      // The sidebar search below IS the search; fumadocs' dialog stays off.
      search={{ enabled: false }}
    >
      <DocsLayout
        tree={filtered as unknown as Root}
        nav={{
          title: (
            <span className="nx-brand">
              <span className="nx-brand-mark" aria-hidden>
                ∑
              </span>
              <span className="nx-brand-name">Notes</span>
              <span className="nx-brand-chip">{active.chip}</span>
            </span>
          ),
        }}
        searchToggle={{ enabled: false }}
        sidebar={{
          defaultOpenLevel: 0,
          components: { Separator: FamilyHeading },
          banner: (
            <>
              {portalHome && (
                <a
                  href="/app"
                  className="px-1 text-xs font-medium text-fd-muted-foreground hover:text-fd-foreground"
                >
                  ← Back to portal
                </a>
              )}
              {levels.length > 1 && (
                <div className="nx-levels" role="tablist" aria-label="Level">
                  {levels.map(l => (
                    <a
                      key={l.code}
                      href={`/notes/${l.code.toLowerCase()}`}
                      className="nx-level"
                      aria-current={l.code === active.code ? 'page' : undefined}
                    >
                      {l.chip}
                    </a>
                  ))}
                </div>
              )}
              <SidebarFilter value={query} onChange={setQuery} total={total} shown={shown} />
              <SearchResults entries={active.search} query={query} />
            </>
          ),
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
