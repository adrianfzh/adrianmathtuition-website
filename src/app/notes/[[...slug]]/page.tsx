import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocsPage, DocsBody, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import NotesMarkdown from '../NotesMarkdown';
import { isNotesAuthed } from '@/lib/notes-auth';
import { getLevelIndex, getNotesTree, getSubgroupPage, getTopicPage } from '@/lib/notes-data';
import { cleanDescription, cleanTitle } from '@/lib/notes-text';
import {
  levelLabel,
  neighbours,
  subgroupUrl,
  topicUrl,
  type NotesSection,
} from '@/lib/notes-tree';

const PHASE_1_LEVEL = 'AM';

// Cookie-gated, so always rendered per request.
export const dynamic = 'force-dynamic';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Footer prev/next, computed from the unfiltered tree so it never depends on
 *  whatever the sidebar filter happens to be showing. */
async function footerFor(url: string) {
  const tree = await getNotesTree(PHASE_1_LEVEL);
  const { previous, next } = neighbours(tree, url);
  return {
    items: {
      previous: previous ? { type: 'page' as const, ...previous } : undefined,
      next: next ? { type: 'page' as const, ...next } : undefined,
    },
  };
}

// ── Shared page furniture ────────────────────────────────────────────────────
//
// fumadocs' own breadcrumb is switched off on every page below in favour of this
// single back-link: with a three-level tree the breadcrumb repeated the title
// and the sidebar without saying anything new, and it pushed the heading down
// the fold on an iPad.

function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="nx-eyebrow">
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
      </svg>
      {children}
    </Link>
  );
}

function Chevron() {
  return (
    <svg
      className="nx-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** One row in a topic grid or sub-group list. */
function CardLink({
  href,
  title,
  description,
  count,
}: {
  href: string;
  title: string;
  description?: string | null;
  count?: string;
}) {
  return (
    <Link href={href} className="nx-item">
      <span className="nx-item-main">
        <span className="nx-item-title">{title}</span>
        {description && <span className="nx-item-desc">{description}</span>}
      </span>
      <span className="nx-item-side">
        {count && <span className="nx-count">{count}</span>}
        <Chevron />
      </span>
    </Link>
  );
}

// ── Level index ──────────────────────────────────────────────────────────────

async function LevelIndex() {
  const topics = await getLevelIndex(PHASE_1_LEVEL);

  if (topics.length === 0) {
    return (
      <DocsPage toc={[]} breadcrumb={{ enabled: false }}>
        <DocsTitle className="nx-title">{levelLabel(PHASE_1_LEVEL)}</DocsTitle>
        <p className="nx-lede">No published notes yet.</p>
      </DocsPage>
    );
  }

  const examples = topics.reduce((sum, t) => sum + t.examples, 0);

  return (
    <DocsPage toc={[]} breadcrumb={{ enabled: false }}>
      <p className="nx-eyebrow">Notes</p>
      <DocsTitle className="nx-title">{levelLabel(PHASE_1_LEVEL)}</DocsTitle>
      <p className="nx-lede">
        Every worked example from the lesson notes, by topic — the same content as the
        revision cards, laid out to read and to print.
      </p>
      <div className="nx-meta">
        <span className="nx-pill">{plural(topics.length, 'topic')}</span>
        <span className="nx-pill">{plural(examples, 'worked example')}</span>
      </div>
      <hr className="nx-rule" />
      <DocsBody>
        <div className="not-prose nx-grid">
          {topics.map(t => (
            <CardLink
              key={t.url}
              href={t.url}
              title={t.topic}
              description={`${plural(t.pages, 'page')} · ${plural(t.examples, 'example')}`}
            />
          ))}
        </div>
      </DocsBody>
    </DocsPage>
  );
}

// ── Topic index ──────────────────────────────────────────────────────────────

async function TopicIndex({ topicSlugParam }: { topicSlugParam: string }) {
  const data = await getTopicPage(PHASE_1_LEVEL, topicSlugParam);
  if (!data) notFound();

  const url = topicUrl(PHASE_1_LEVEL, data.topic);
  const examples = data.subgroups.reduce((sum, s) => sum + s.count, 0);

  return (
    <DocsPage toc={[]} footer={await footerFor(url)} breadcrumb={{ enabled: false }}>
      <BackLink href={`/notes/${PHASE_1_LEVEL.toLowerCase()}`}>
        {levelLabel(PHASE_1_LEVEL)}
      </BackLink>
      <DocsTitle className="nx-title">{data.topic}</DocsTitle>
      <div className="nx-meta">
        <span className="nx-pill">{plural(data.subgroups.length, 'page')}</span>
        <span className="nx-pill">{plural(examples, 'worked example')}</span>
      </div>
      <hr className="nx-rule" />
      <DocsBody>
        {/* Quick-revision card, when the topic has one. Its own title is dropped:
            it always restates the topic, which is already the page heading. */}
        {data.card?.content_md && (
          <section className="nx-revision">
            <header className="nx-revision-head">
              <span className="nx-eyebrow">Quick revision</span>
              {data.card.status === 'draft' && <span className="nx-draft">Draft</span>}
            </header>
            <NotesMarkdown content={data.card.content_md} className="nx-revision-body" />
          </section>
        )}

        <div className="not-prose nx-list">
          {data.subgroups.map(s => (
            <CardLink
              key={s.url}
              href={s.url}
              title={cleanTitle(s.name)}
              description={cleanDescription(s.description).summary}
              count={plural(s.count, 'example')}
            />
          ))}
        </div>
      </DocsBody>
    </DocsPage>
  );
}

// ── Sub-group page (the actual notes) ────────────────────────────────────────

interface NumberedSnippet {
  id: number | string;
  card_title: string | null;
  content: string;
  n: number;
}

function Example({ snippet }: { snippet: NumberedSnippet }) {
  const title = cleanTitle(snippet.card_title);
  return (
    <article className="nx-ex">
      <header className="nx-ex-head">
        <span className="nx-ex-no">{snippet.n}</span>
        <h3 className="nx-ex-title">{title || `Worked example ${snippet.n}`}</h3>
      </header>
      <NotesMarkdown content={snippet.content} />
    </article>
  );
}

async function SubgroupPage({
  topicSlugParam,
  subgroupSlug,
}: {
  topicSlugParam: string;
  subgroupSlug: string;
}) {
  const data = await getSubgroupPage(PHASE_1_LEVEL, topicSlugParam, subgroupSlug);
  if (!data) notFound();

  const url = subgroupUrl(PHASE_1_LEVEL, data.topic, data.subgroup.name);
  const { summary, example } = cleanDescription(data.subgroup.description);

  // Examples are numbered continuously down the page, not restarted per section
  // — "example 7" has to mean one thing when Adrian says it in a lesson.
  let n = 0;
  const sections: { section: NotesSection; items: NumberedSnippet[] }[] = data.sections.map(
    section => ({
      section,
      items: section.snippets.map(s => ({
        id: s.id,
        card_title: s.card_title,
        content: s.content,
        n: ++n,
      })),
    }),
  );

  // Most sub-groups hold a single section whose name is just the display_group
  // NULL fallback — i.e. the sub-group's own name. Heading and TOC would both
  // only echo the page title there, so both are dropped and the examples sit
  // directly under it.
  const showSections =
    data.sections.length > 1 || data.sections[0]?.name !== data.subgroup.name;

  const toc = showSections
    ? data.sections.map(s => ({ title: s.name, url: `#${s.id}`, depth: 2 }))
    : [];

  return (
    <DocsPage toc={toc} footer={await footerFor(url)} breadcrumb={{ enabled: false }}>
      <BackLink href={topicUrl(PHASE_1_LEVEL, data.topic)}>{data.topic}</BackLink>
      <DocsTitle className="nx-title">{cleanTitle(data.subgroup.name)}</DocsTitle>
      {summary && <p className="nx-lede">{summary}</p>}
      <div className="nx-meta">
        <span className="nx-pill">{plural(n, 'worked example')}</span>
        {example && (
          <span className="nx-eg">
            <b>e.g.</b>
            {example}
          </span>
        )}
      </div>
      <hr className="nx-rule" />
      <DocsBody>
        {sections.map(({ section, items }) => (
          <section key={section.id}>
            {showSections && (
              <h2 id={section.id} className="nx-section">
                {section.name}
              </h2>
            )}
            {items.map(snippet => (
              <Example key={snippet.id} snippet={snippet} />
            ))}
          </section>
        ))}
      </DocsBody>
    </DocsPage>
  );
}

// ── Router ───────────────────────────────────────────────────────────────────

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  // Checked here as well as in the layout so an unauthenticated request never
  // reaches Supabase.
  if (!(await isNotesAuthed())) return null;

  const { slug = [] } = await params;

  // /notes and /notes/am both land on the level index. Phase 1 is AM-only, so
  // any other level segment is a 404 rather than a silent redirect to AM.
  if (slug.length === 0) return <LevelIndex />;
  if (slug[0].toLowerCase() !== PHASE_1_LEVEL.toLowerCase()) notFound();

  if (slug.length === 1) return <LevelIndex />;
  if (slug.length === 2) return <TopicIndex topicSlugParam={slug[1]} />;
  if (slug.length === 3) {
    return <SubgroupPage topicSlugParam={slug[1]} subgroupSlug={slug[2]} />;
  }
  notFound();
}
