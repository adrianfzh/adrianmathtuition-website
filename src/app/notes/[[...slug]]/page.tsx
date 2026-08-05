import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocsPage, DocsBody, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import NotesMarkdown from '../NotesMarkdown';
import { isNotesAuthed } from '@/lib/notes-auth';
import { getLevelIndex, getNotesTree, getSubgroupPage, getTopicPage } from '@/lib/notes-data';
import { cleanDescription, cleanTitle } from '@/lib/notes-text';
import {
  groupByFamily,
  levelLabel,
  neighbours,
  subgroupUrl,
  topicUrl,
  toolPageUrl,
  type NotesSection,
  type RecallCardRow,
} from '@/lib/notes-tree';
import {
  lessonToolsForTopic,
  toolHref,
  toolsForTopic,
  TOOL_SLUG,
  type NotesTool,
} from '@/lib/notes-tools';
import { topicSlug } from '@/lib/topic-slug';

const PHASE_1_LEVEL = 'AM';

// Cookie-gated, so always rendered per request.
export const dynamic = 'force-dynamic';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Anchor ids for the in-page sections the table of contents links to. */
const ANCHOR = {
  reflexes: 'formula-reflexes',
  revision: 'quick-revision',
  tools: 'interactive',
  pages: 'pages',
} as const;

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

function SectionHead({ id, label, note }: { id: string; label: string; note?: string }) {
  return (
    <header className="nx-subhead">
      <p className="nx-eyebrow" id={id}>
        {label}
      </p>
      {note && <span className="nx-subhead-note">{note}</span>}
    </header>
  );
}

// ── Interactive tools ────────────────────────────────────────────────────────
//
// Same-origin static files under public/tools, so no sandbox: they load no
// third-party code and several keep state in localStorage, which `sandbox`
// without `allow-same-origin` would break. `loading="lazy"` keeps a panel that
// nobody scrolls to off the critical path.

/**
 * `head` labels the frame with the tool's own title and blurb. The dedicated
 * tool page turns it off for the panel it is already named after — otherwise the
 * title, the lede and the full-screen link all appear twice, once in the page
 * header and again 40px below it.
 */
function ToolPanel({ tool, head = true }: { tool: NotesTool; head?: boolean }) {
  const href = toolHref(tool);
  const height = tool.height ?? 680;
  return (
    <section className="nx-tool">
      {head && (
        <header className="nx-tool-head">
          <span className="nx-tool-heading">
            <span className="nx-tool-title">{tool.title}</span>
            <span className="nx-tool-blurb">{tool.blurb}</span>
          </span>
          <a className="nx-tool-open" href={href} target="_blank" rel="noreferrer">
            Full screen ↗
          </a>
        </header>
      )}
      <iframe
        className="nx-tool-frame"
        src={href}
        title={tool.title}
        loading="lazy"
        style={{ height }}
      />
    </section>
  );
}

// ── Formula reflexes (recall cards) ──────────────────────────────────────────

function ReflexCard({ card }: { card: RecallCardRow }) {
  const title = cleanTitle(card.card_title);
  return (
    <article className="nx-rc">
      {title && <h3 className="nx-rc-title">{title}</h3>}
      <NotesMarkdown content={card.content} className="nx-rc-body" />
    </article>
  );
}

function Reflexes({ cards }: { cards: RecallCardRow[] }) {
  return (
    <section className="nx-reflexes">
      <SectionHead
        id={ANCHOR.reflexes}
        label="Formula reflexes"
        note={`${cards.length} to know cold`}
      />
      <div className="not-prose nx-reflex-grid">
        {cards.map(card => (
          <ReflexCard key={card.id} card={card} />
        ))}
      </div>
    </section>
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
  const reflexes = topics.reduce((sum, t) => sum + t.recall, 0);
  // Same grouping the sidebar uses, so the page and the tree read as one thing.
  const families = groupByFamily(PHASE_1_LEVEL, topics, t => t.topic);

  const toc = families.map(({ family }) => ({
    title: family.label,
    url: `#family-${topicSlug(family.label)}`,
    depth: 2,
  }));

  return (
    <DocsPage toc={toc} breadcrumb={{ enabled: false }}>
      <p className="nx-eyebrow">Notes</p>
      <DocsTitle className="nx-title">{levelLabel(PHASE_1_LEVEL)}</DocsTitle>
      <p className="nx-lede">
        Every worked example from the lesson notes, by topic — the same content as the
        revision cards, laid out to read and to print.
      </p>
      <div className="nx-meta">
        <span className="nx-pill">{plural(topics.length, 'topic')}</span>
        <span className="nx-pill">{plural(examples, 'worked example')}</span>
        {reflexes > 0 && (
          <span className="nx-pill nx-pill-green">{plural(reflexes, 'formula reflex')}</span>
        )}
      </div>
      <hr className="nx-rule" />
      <DocsBody>
        {families.map(({ family, items }) => (
          <section key={family.label} className="nx-family">
            <h2 className="nx-family-head" id={`family-${topicSlug(family.label)}`}>
              {family.label}
            </h2>
            <div className="not-prose nx-grid">
              {items.map(t => (
                <CardLink
                  key={t.url}
                  href={t.url}
                  title={t.topic}
                  description={[
                    plural(t.pages, 'page'),
                    plural(t.examples, 'example'),
                    t.recall > 0 ? `${t.recall} reflexes` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </div>
          </section>
        ))}
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
  const tools = toolsForTopic(PHASE_1_LEVEL, data.topic);

  const toc = [
    data.recall.length > 0 && { title: 'Formula reflexes', url: `#${ANCHOR.reflexes}` },
    data.card?.content_md && { title: 'Quick revision', url: `#${ANCHOR.revision}` },
    tools.length > 0 && { title: 'Interactive', url: `#${ANCHOR.tools}` },
    { title: 'Pages', url: `#${ANCHOR.pages}` },
  ]
    .filter(Boolean)
    .map(item => ({ ...(item as { title: string; url: string }), depth: 2 }));

  return (
    <DocsPage toc={toc} footer={await footerFor(url)} breadcrumb={{ enabled: false }}>
      <BackLink href={`/notes/${PHASE_1_LEVEL.toLowerCase()}`}>
        {levelLabel(PHASE_1_LEVEL)}
      </BackLink>
      <DocsTitle className="nx-title">{data.topic}</DocsTitle>
      <div className="nx-meta">
        <span className="nx-pill">{plural(data.subgroups.length, 'page')}</span>
        <span className="nx-pill">{plural(examples, 'worked example')}</span>
        {data.recall.length > 0 && (
          <span className="nx-pill nx-pill-green">
            {plural(data.recall.length, 'formula reflex')}
          </span>
        )}
      </div>
      <hr className="nx-rule" />
      <DocsBody>
        {/* Reflexes lead the page: the sub-group list below duplicates the
            sidebar, but these 179 cards appear nowhere else in the portal. */}
        {data.recall.length > 0 && <Reflexes cards={data.recall} />}

        {/* Quick-revision card, when the topic has one. Its own title is dropped:
            it always restates the topic, which is already the page heading. */}
        {data.card?.content_md && (
          <section className="nx-revision">
            <header className="nx-revision-head">
              <span className="nx-eyebrow" id={ANCHOR.revision}>
                Quick revision
              </span>
              {data.card.status === 'draft' && <span className="nx-draft">Draft</span>}
            </header>
            <NotesMarkdown content={data.card.content_md} className="nx-revision-body" />
          </section>
        )}

        {tools.length > 0 && (
          <section>
            <SectionHead
              id={ANCHOR.tools}
              label="Interactive"
              note="Drag it, and the rule stops being something to memorise"
            />
            {tools.map(tool => (
              <ToolPanel key={tool.file} tool={tool} />
            ))}
          </section>
        )}

        <section>
          <h2 id={ANCHOR.pages} className="nx-section">
            Pages
          </h2>
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
        </section>
      </DocsBody>
    </DocsPage>
  );
}

// ── Tool page ────────────────────────────────────────────────────────────────
//
// Only topics with a lesson-grade tool get one, which is exactly the set the
// sidebar links — so a URL that exists here always exists in the tree too.

async function ToolPage({ topicSlugParam }: { topicSlugParam: string }) {
  const data = await getTopicPage(PHASE_1_LEVEL, topicSlugParam);
  if (!data) notFound();

  const lesson = lessonToolsForTopic(PHASE_1_LEVEL, data.topic);
  if (lesson.length === 0) notFound();

  // The page shows every tool the topic has, not just the lesson-grade one:
  // having arrived, a student should see the drill next to the explainer.
  const tools = toolsForTopic(PHASE_1_LEVEL, data.topic);
  const url = toolPageUrl(PHASE_1_LEVEL, data.topic);
  const title = lesson.length === 1 ? lesson[0].title : 'Interactive tools';

  return (
    <DocsPage
      toc={tools.map(t => ({ title: t.title, url: `#tool-${t.file}`, depth: 2 }))}
      footer={await footerFor(url)}
      breadcrumb={{ enabled: false }}
    >
      <BackLink href={topicUrl(PHASE_1_LEVEL, data.topic)}>{data.topic}</BackLink>
      <DocsTitle className="nx-title">{title}</DocsTitle>
      <p className="nx-lede">{lesson[0].blurb}</p>
      <div className="nx-cta-row">
        <a
          className="nx-cta nx-cta-primary"
          href={toolHref(lesson[0])}
          target="_blank"
          rel="noreferrer"
        >
          Open full screen ↗
        </a>
        <Link className="nx-cta nx-cta-ghost" href={topicUrl(PHASE_1_LEVEL, data.topic)}>
          Worked examples
        </Link>
      </div>
      <hr className="nx-rule" />
      <DocsBody>
        {tools.map(tool => (
          <div key={tool.file} id={`tool-${tool.file}`}>
            <ToolPanel tool={tool} head={tool.title !== title} />
          </div>
        ))}
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
    // `tool` shares the sub-group slug space, so it has to win before a
    // sub-group lookup — otherwise a sub-group named "Tool" would shadow it.
    if (slug[2].toLowerCase() === TOOL_SLUG) return <ToolPage topicSlugParam={slug[1]} />;
    return <SubgroupPage topicSlugParam={slug[1]} subgroupSlug={slug[2]} />;
  }
  notFound();
}
