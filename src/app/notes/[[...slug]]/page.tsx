import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/layouts/docs/page';
import { MathMarkdown } from '@/lib/math-markdown';
import { isNotesAuthed } from '@/lib/notes-auth';
import { getNotesTree, getSubgroupPage, getTopicPage } from '@/lib/notes-data';
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

// ── Level index ──────────────────────────────────────────────────────────────

async function LevelIndex() {
  const tree = await getNotesTree(PHASE_1_LEVEL);

  if (tree.children.length === 0) {
    return (
      <DocsPage>
        <DocsTitle>{levelLabel(PHASE_1_LEVEL)}</DocsTitle>
        <DocsDescription>No published notes yet.</DocsDescription>
      </DocsPage>
    );
  }

  return (
    <DocsPage toc={[]}>
      <DocsTitle>{levelLabel(PHASE_1_LEVEL)}</DocsTitle>
      <DocsDescription>
        {tree.children.length} topics. Pick one, or use the filter in the sidebar.
      </DocsDescription>
      <DocsBody>
        <div className="not-prose grid gap-3 sm:grid-cols-2">
          {tree.children.map(folder => (
            <Link
              key={folder.$id}
              href={folder.index.url}
              className="rounded-xl border border-fd-border bg-fd-card p-4 no-underline
                         transition-colors hover:bg-fd-accent"
            >
              <span className="block font-medium text-fd-foreground">{folder.name}</span>
              <span className="mt-0.5 block text-sm text-fd-muted-foreground">
                {folder.children.length} page{folder.children.length === 1 ? '' : 's'}
              </span>
            </Link>
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
  const isDraft = data.card?.status === 'draft';

  return (
    <DocsPage toc={[]} footer={await footerFor(url)}>
      <DocsTitle>{data.topic}</DocsTitle>
      <DocsDescription>
        {data.subgroups.length} page{data.subgroups.length === 1 ? '' : 's'} of worked examples.
      </DocsDescription>
      <DocsBody>
        {/* Topic card (when the topic has one) sits above the page list. */}
        {data.card?.content_md && (
          <section className="mb-8 rounded-xl border border-fd-border bg-fd-card p-5">
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="!mt-0 !mb-0 text-base font-semibold text-fd-foreground">
                {data.card.title ?? `${data.topic} — Quick Revision`}
              </h2>
              {isDraft && (
                <span
                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5
                             text-[11px] font-semibold uppercase tracking-wide text-amber-700
                             dark:text-amber-400"
                >
                  Draft
                </span>
              )}
            </header>
            <div className="notes-prose">
              <MathMarkdown content={data.card.content_md} />
            </div>
          </section>
        )}

        <div className="not-prose grid gap-3">
          {data.subgroups.map(s => (
            <Link
              key={s.url}
              href={s.url}
              className="rounded-xl border border-fd-border bg-fd-card p-4 no-underline
                         transition-colors hover:bg-fd-accent"
            >
              <span className="block font-medium text-fd-foreground">{s.name}</span>
              {s.description && (
                <span className="mt-1 block text-sm text-fd-muted-foreground">
                  {s.description}
                </span>
              )}
            </Link>
          ))}
        </div>
      </DocsBody>
    </DocsPage>
  );
}

// ── Sub-group page (the actual notes) ────────────────────────────────────────

function SnippetBlock({
  section,
  showHeading,
}: {
  section: NotesSection;
  showHeading: boolean;
}) {
  return (
    <section>
      {showHeading && (
        <h2 id={section.id} className="scroll-mt-24">
          {section.name}
        </h2>
      )}
      {section.snippets.map(snippet => (
        <article key={snippet.id} className="mb-6">
          {snippet.card_title && (
            <h3 className="!mb-2 text-base font-semibold">{snippet.card_title}</h3>
          )}
          <div className="notes-prose">
            <MathMarkdown content={snippet.content} />
          </div>
        </article>
      ))}
    </section>
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

  // Most sub-groups hold a single section whose name is just the display_group
  // NULL fallback — i.e. the sub-group's own name. Heading and TOC would both
  // only echo the page title there, so both are dropped and the snippets sit
  // directly under it.
  const showSections =
    data.sections.length > 1 || data.sections[0]?.name !== data.subgroup.name;

  const toc = showSections
    ? data.sections.map(s => ({ title: s.name, url: `#${s.id}`, depth: 2 }))
    : [];

  return (
    <DocsPage toc={toc} footer={await footerFor(url)}>
      <DocsTitle>{data.subgroup.name}</DocsTitle>
      {data.subgroup.description && (
        <DocsDescription>{data.subgroup.description}</DocsDescription>
      )}
      {/* No topic back-link here — DocsPage already renders the tree breadcrumb. */}
      <DocsBody>
        {data.sections.map(section => (
          <SnippetBlock key={section.id} section={section} showHeading={showSections} />
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
