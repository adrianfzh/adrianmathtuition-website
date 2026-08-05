'use client';
// The fumadocs shell. Client-side because the Phase 1 "search" is a live filter
// over the sidebar tree — the tree arrives from the server as plain JSON (only
// strings, so it crosses the RSC boundary fine) and is re-filtered here.

import { useMemo, useState } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { Root, Separator } from 'fumadocs-core/page-tree';
import { filterTree, treeFolders, type TreeRoot } from '@/lib/notes-tree';

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
          placeholder="Filter topics…"
          aria-label="Filter notes by topic or page name"
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
  tree,
  children,
}: {
  tree: TreeRoot;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterTree(tree, query), [tree, query]);
  // Count folders, not children — `children` also holds the family separators,
  // which would inflate "12 of 31 topics" into nonsense.
  const total = treeFolders(tree).length;
  const shown = treeFolders(filtered).length;

  return (
    <RootProvider
      // Phase 1 has no search index — the sidebar filter is the search.
      // Full-text search is Phase 2 (SPEC-NOTES-PORTAL).
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
              <span className="nx-brand-chip">A-Math</span>
            </span>
          ),
        }}
        searchToggle={{ enabled: false }}
        sidebar={{
          defaultOpenLevel: 0,
          components: { Separator: FamilyHeading },
          banner: (
            <SidebarFilter value={query} onChange={setQuery} total={total} shown={shown} />
          ),
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
