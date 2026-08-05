'use client';
// The fumadocs shell. Client-side because the Phase 1 "search" is a live filter
// over the sidebar tree — the tree arrives from the server as plain JSON (only
// strings, so it crosses the RSC boundary fine) and is re-filtered here.

import { useMemo, useState } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { Root } from 'fumadocs-core/page-tree';
import { filterTree, type TreeRoot } from '@/lib/notes-tree';

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
              <span className="nx-brand-name">Notes</span>
              <span className="nx-brand-chip">A-Math</span>
            </span>
          ),
        }}
        searchToggle={{ enabled: false }}
        sidebar={{
          defaultOpenLevel: 0,
          banner: (
            <SidebarFilter
              value={query}
              onChange={setQuery}
              total={tree.children.length}
              shown={filtered.children.length}
            />
          ),
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
