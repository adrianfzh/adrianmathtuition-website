import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocsPage, DocsBody, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import NotesMarkdown from '../NotesMarkdown';
import NotesUnits from '../NotesUnits';
import { ReviewBar } from '../ReviewControls';
import { isNotesAuthed, isNotesViewer } from '@/lib/notes-auth';
import { approvedSections, hasApprovedUnits } from '@/lib/notes-units';
import { getLevelIndex, getNotesTree, getSubgroupPage, getTopicPage } from '@/lib/notes-data';
import { cleanDescription, cleanTitle } from '@/lib/notes-text';
import {
  groupByFamily,
  levelLabel,
  neighbours,
  subgroupUrl,
  topicUrl,
  NOTES_LEVELS,
  type NotesSection,
} from '@/lib/notes-tree';
import { topicSlug } from '@/lib/topic-slug';

// Cookie-gated, so always rendered per request.
export const dynamic = 'force-dynamic';

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Anchor ids for the in-page sections the table of contents links to. */
const ANCHOR = {
  revision: 'quick-revision',
  pages: 'pages',
} as const;

/** Footer prev/next, computed from the unfiltered tree so it never depends on
 *  whatever the sidebar filter happens to be showing. */
async function footerFor(level: string, url: string) {
  const tree = await getNotesTree(level);
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

// ── Level chooser (/notes root) ──────────────────────────────────────────────

function LevelChooser() {
  return (
    <DocsPage toc={[]} breadcrumb={{ enabled: false }}>
      <p className="nx-eyebrow">Notes</p>
      <DocsTitle className="nx-title">Revision Notes</DocsTitle>
      <hr className="nx-rule" />
      <DocsBody>
        <div className="not-prose nx-list">
          {NOTES_LEVELS.map(l => (
            <CardLink key={l.code} href={`/notes/${l.code.toLowerCase()}`} title={l.label} />
          ))}
        </div>
      </DocsBody>
    </DocsPage>
  );
}

// ── Level index ──────────────────────────────────────────────────────────────

async function LevelIndex({ level }: { level: string }) {
  const topics = await getLevelIndex(level);

  if (topics.length === 0) {
    return (
      <DocsPage toc={[]} breadcrumb={{ enabled: false }}>
        <DocsTitle className="nx-title">{levelLabel(level)}</DocsTitle>
        <p className="nx-lede">No published notes yet.</p>
      </DocsPage>
    );
  }

  // Same grouping the sidebar uses, so the page and the tree read as one thing.
  const families = groupByFamily(level, topics, t => t.topic);

  const toc = families.map(({ family }) => ({
    title: family.label,
    url: `#family-${topicSlug(family.label)}`,
    depth: 2,
  }));

  return (
    <DocsPage toc={toc} breadcrumb={{ enabled: false }}>
      {/* No lede, no counts — Adrian, 2026-08-21: the landing page is just the
          topic list; a student picks a topic and reads. */}
      <p className="nx-eyebrow">Notes</p>
      <DocsTitle className="nx-title">{levelLabel(level)}</DocsTitle>
      <hr className="nx-rule" />
      <DocsBody>
        {families.map(({ family, items }) => (
          <section key={family.label} className="nx-family">
            <h2 className="nx-family-head" id={`family-${topicSlug(family.label)}`}>
              {family.label}
            </h2>
            <div className="not-prose nx-grid">
              {items.map(t => (
                <CardLink key={t.url} href={t.url} title={t.topic} />
              ))}
            </div>
          </section>
        ))}
      </DocsBody>
    </DocsPage>
  );
}

// ── Topic index ──────────────────────────────────────────────────────────────

async function TopicIndex({ level, topicSlugParam }: { level: string; topicSlugParam: string }) {
  const [data, admin] = await Promise.all([
    getTopicPage(level, topicSlugParam),
    isNotesAuthed(),
  ]);
  if (!data) notFound();

  const url = topicUrl(level, data.topic);

  // Learning units. The reviewer reads everything; a student reads what has
  // been approved. Approving a topic also retires its old sub-group list —
  // that's `converted` below, and it flips per topic as Adrian reviews.
  const sections = admin ? data.unitSections : approvedSections(data.unitSections);
  const converted = hasApprovedUnits(data.unitSections);
  // Card-only topics have no example pages yet — no empty "Pages" heading.
  const showPages = !converted && data.subgroups.length > 0;
  const pending = data.unitSections.reduce(
    (n, s) =>
      n +
      s.units.filter(u => u.draft && !u.flagged).length +
      (s.lead && s.lead.draft && !s.lead.flagged ? 1 : 0),
    0,
  );
  const flagged = data.unitSections.reduce(
    (n, s) => n + s.units.filter(u => u.flagged).length + (s.lead?.flagged ? 1 : 0),
    0,
  );
  const fixed = data.unitSections.reduce(
    (n, s) => n + s.units.filter(u => u.fixedNote).length + (s.lead?.fixedNote ? 1 : 0),
    0,
  );

  const toc = [
    data.card?.content_md && { title: 'Quick revision', url: `#${ANCHOR.revision}`, depth: 2 },
    // One entry per concept dropdown; the anchor sits on the <details> row, so
    // the link works whether or not the student has opened it.
    ...sections.map(s => ({ title: s.title, url: `#${s.id}`, depth: 2 })),
    showPages && { title: 'Pages', url: `#${ANCHOR.pages}`, depth: 2 },
  ].filter(Boolean) as { title: string; url: string; depth: number }[];

  return (
    <DocsPage toc={toc} footer={await footerFor(level, url)} breadcrumb={{ enabled: false }}>
      <BackLink href={`/notes/${level.toLowerCase()}`}>
        {levelLabel(level)}
      </BackLink>
      <DocsTitle className="nx-title">{data.topic}</DocsTitle>
      <div className="nx-byline">
        <span className="nx-byline-avatar" aria-hidden>
          A
        </span>
        <span className="nx-byline-text">
          <span className="nx-byline-name">Taught by Adrian</span>
          <span className="nx-byline-sub">{levelLabel(level)} specialist</span>
        </span>
        {/* Deep link into the portal's instant-graded practice for THIS topic —
            read the examples, then do a few. The practice page opens the
            topic's sheet directly (?level&topic). */}
        <Link
          href={`/app/practice?level=${level.toUpperCase()}&topic=${encodeURIComponent(data.topic)}`}
          className="nx-practise"
        >
          ✏️ Practise this topic
        </Link>
      </div>
      <hr className="nx-rule" />
      <DocsBody>
        {admin && data.unitSections.length > 0 && (
          <ReviewBar
            level={level}
            topic={data.topic}
            pending={pending}
            flagged={flagged}
            fixed={fixed}
          />
        )}

        {/* The recall-card ("Key concepts") grid and the counts pills are gone
            — Adrian, 2026-08-21: a topic page is the list of concept dropdowns
            below, each named for what the student wants to do; open one and the
            explanation begins. The formula + remember content the cards carried
            lives on inside each dropdown's Big Idea. */}

        {/* Quick-revision card, when the topic has one. Its own title is dropped:
            it always restates the topic, which is already the page heading.
            Students only see published cards — drafts are the reviewer's. */}
        {data.card?.content_md && (admin || data.card.status === 'published') && (
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

        {/* Interactive tools deliberately do NOT render here (Adrian,
            2026-08-06): the recap page is for reading; tools belong to the
            interactive lesson-unit surface. The dedicated tool pages still
            exist for unconverted topics via the sidebar. */}

        {/* The lesson itself — one dropdown per concept. On an unapproved topic
            it renders above the old sub-group list so both formats can be
            compared; the moment the topic has approved blocks, the old list
            retires. */}
        {sections.length > 0 && <NotesUnits sections={sections} admin={admin} />}

        {showPages && (
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
        )}
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
    // The id is the search deep-link target (#ex-<id>) and the per-example
    // "On this page" anchor — keep it in sync with getSearchIndex's URLs.
    <article className="nx-ex" id={`ex-${snippet.id}`}>
      <header className="nx-ex-head">
        <span className="nx-ex-no">{snippet.n}</span>
        <h3 className="nx-ex-title">{title || `Worked example ${snippet.n}`}</h3>
      </header>
      <NotesMarkdown content={snippet.content} />
    </article>
  );
}

async function SubgroupPage({
  level,
  topicSlugParam,
  subgroupSlug,
}: {
  level: string;
  topicSlugParam: string;
  subgroupSlug: string;
}) {
  const data = await getSubgroupPage(level, topicSlugParam, subgroupSlug);
  if (!data) notFound();

  const url = subgroupUrl(level, data.topic, data.subgroup.name);
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
  // NULL fallback — i.e. the sub-group's own name. Section headings only render
  // when they say something the page title doesn't; the TOC always lists every
  // EXAMPLE by its scenario name — that is the "On this page" index a student
  // scans to jump straight to "circle touching both axes".
  const showSections =
    data.sections.length > 1 || data.sections[0]?.name !== data.subgroup.name;

  const toc = sections.flatMap(({ section, items }) => [
    ...(showSections ? [{ title: section.name, url: `#${section.id}`, depth: 2 }] : []),
    ...items.map(s => ({
      title: cleanTitle(s.card_title) || `Worked example ${s.n}`,
      url: `#ex-${s.id}`,
      depth: showSections ? 3 : 2,
    })),
  ]);

  return (
    <DocsPage toc={toc} footer={await footerFor(level, url)} breadcrumb={{ enabled: false }}>
      <BackLink href={topicUrl(level, data.topic)}>{data.topic}</BackLink>
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
  // reaches Supabase. Viewer = admin cookie OR portal student; the per-section
  // admin flag (review UI, pending content) stays isNotesAuthed().
  if (!(await isNotesViewer())) return null;

  const { slug = [] } = await params;

  // /notes = level chooser; /notes/<level> = that level's index. A segment
  // that names no exposed level is a 404 rather than a silent redirect.
  if (slug.length === 0) return <LevelChooser />;
  const level = NOTES_LEVELS.find(l => l.code.toLowerCase() === slug[0].toLowerCase())?.code;
  if (!level) notFound();

  if (slug.length === 1) return <LevelIndex level={level} />;
  if (slug.length === 2) return <TopicIndex level={level} topicSlugParam={slug[1]} />;
  if (slug.length === 3) {
    return <SubgroupPage level={level} topicSlugParam={slug[1]} subgroupSlug={slug[2]} />;
  }
  notFound();
}
