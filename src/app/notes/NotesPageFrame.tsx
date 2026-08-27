// Page furniture for /notes, portal-styled (2026-08-28). This replaces the
// fumadocs DocsPage/DocsBody/DocsTitle wrappers: same responsibilities — a
// reading column, an "On this page" table of contents, prev/next footer — in
// the student portal's visual vocabulary (white cards, border-black/5,
// shadow-sm, navy + cream). Server components throughout; the only interactive
// element is a native <details> for the phone TOC, which needs no JS.

import type { ReactNode } from 'react';
import Link from 'next/link';

export interface TocEntry {
  title: string;
  url: string;
  depth: number;
}

export interface PageNeighbour {
  name: string;
  url: string;
}

function TocLinks({ items }: { items: TocEntry[] }) {
  return (
    <>
      {items.map(item => (
        <a
          key={item.url}
          href={item.url}
          className={`block py-1 leading-snug text-gray-600 transition-colors hover:text-navy ${
            item.depth > 2 ? 'pl-4 text-[13px]' : 'text-sm'
          }`}
        >
          {item.title}
        </a>
      ))}
    </>
  );
}

/** Collapsed "On this page" card — phones and tablets. */
function MobileToc({ items }: { items: TocEntry[] }) {
  return (
    <details className="nx-toc-card mt-5 rounded-2xl border border-black/5 bg-white shadow-sm xl:hidden">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          On this page
        </span>
        <span className="nx-toc-chev text-gray-400" aria-hidden>
          ▾
        </span>
      </summary>
      <nav className="px-4 pb-3 pt-0.5" aria-label="On this page">
        <TocLinks items={items} />
      </nav>
    </details>
  );
}

/** Sticky right-hand rail — desktop only. No scroll-spy, just the index. */
function DesktopToc({ items }: { items: TocEntry[] }) {
  return (
    <nav
      className="nx-tocrail sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1 xl:block"
      aria-label="On this page"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        On this page
      </p>
      <TocLinks items={items} />
    </nav>
  );
}

/** Footer prev/next, as a pair of portal cards. */
function PrevNext({ previous, next }: { previous?: PageNeighbour; next?: PageNeighbour }) {
  return (
    <nav className="nx-prevnext mt-8 grid grid-cols-2 gap-3" aria-label="Neighbouring pages">
      {previous ? (
        <Link
          href={previous.url}
          className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition-colors hover:bg-[hsl(45,100%,96%)]"
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
            ← Previous
          </span>
          <span className="mt-1 block text-sm font-semibold leading-snug text-navy">
            {previous.name}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.url}
          className="rounded-2xl border border-black/5 bg-white p-4 text-right shadow-sm transition-colors hover:bg-[hsl(45,100%,96%)]"
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Next →
          </span>
          <span className="mt-1 block text-sm font-semibold leading-snug text-navy">
            {next.name}
          </span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/**
 * One /notes page: header block (back-link, title, byline …), body, optional
 * TOC and prev/next. The TOC renders twice — a collapsed card under the header
 * on phones, a sticky rail beside the body on xl — because only one of the two
 * is ever on screen.
 */
export default function PageFrame({
  toc = [],
  previous,
  next,
  header,
  children,
}: {
  toc?: TocEntry[];
  previous?: PageNeighbour;
  next?: PageNeighbour;
  header: ReactNode;
  children?: ReactNode;
}) {
  const hasToc = toc.length > 0;
  return (
    <>
      <article>
        {header}
        {hasToc && <MobileToc items={toc} />}
        {/* mt-6 stands in for the flex-column gap fumadocs' DocsPage used to
            put between the header block and the body. */}
        <div
          className={
            hasToc
              ? 'mt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:items-start xl:gap-10'
              : 'mt-6'
          }
        >
          <div className="min-w-0">{children}</div>
          {hasToc && <DesktopToc items={toc} />}
        </div>
      </article>
      {(previous || next) && <PrevNext previous={previous} next={next} />}
    </>
  );
}
