import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageFrame, { type TocEntry } from '../NotesPageFrame';
import NotesMarkdown from '../NotesMarkdown';
import NotesUnits from '../NotesUnits';
import { ReviewBar } from '../ReviewControls';
import { isNotesViewer } from '@/lib/notes-auth';
// Who is reading (lib/notes-viewer.ts): `admin` = admin cookie AND not
// currently "viewing as a student" (the portal toggle covers /notes too;
// Adrian, 2026-08-29: draft/review chrome must never look student-facing) —
// it gates the ReviewBar / DRAFT pills / pending blocks AND, with `isIp`, the
// sub-group audience every loader applies (lib/subgroup-visibility.ts).
import { notesViewer } from '@/lib/notes-viewer';
import { approvedSections } from '@/lib/notes-units';
import { getLevelIndex, getNotesTree, getSubgroupPage, getTopicPage } from '@/lib/notes-data';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadDeckPlan } from '@/lib/teaching-knowledge';
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
import { mathHtml } from '@/lib/math-inline';
// Server-rendered KaTeX spans (CardLink descriptions, sub-group ledes) need
// the stylesheet even on pages with no client math component mounted.
import 'katex/dist/katex.min.css';

// Cookie-gated, so always rendered per request.
export const dynamic = 'force-dynamic';

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Anchor ids for the in-page sections the table of contents links to. */
const ANCHOR = {
  revision: 'quick-revision',
  pages: 'pages',
} as const;

/** Footer prev/next, computed from the unfiltered tree so it never depends on
 *  whatever the browse-panel filter happens to be showing. */
async function footerFor(level: string, url: string) {
  const tree = await getNotesTree(level, await notesViewer());
  return neighbours(tree, url);
}

/** Small audience label beside a sub-group title — admin view only. */
function AudienceBadge({ badge }: { badge: string | null }) {
  if (!badge) return null;
  return (
    <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
      {badge}
    </span>
  );
}

// ── Shared page furniture ────────────────────────────────────────────────────
//
// A single back-link instead of a breadcrumb (decision from the fumadocs era,
// kept): with a three-level tree the breadcrumb repeated the title without
// saying anything new, and it pushed the heading down the fold on an iPad.

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
    <Link href={href} className="nx-item active:scale-[.98] transition-transform select-none">
      <span className="nx-item-main">
        <span className="nx-item-title">{title}</span>
        {/* Server-side KaTeX over inline $…$ spans — sub-group descriptions
            carry real math ("$a(x-h)^2+k$") since the 2026-08-29 TeX pass;
            mathHtml escapes everything else, so this stays injection-safe. */}
        {description && (
          <span className="nx-item-desc" dangerouslySetInnerHTML={{ __html: mathHtml(description) }} />
        )}
      </span>
      <span className="nx-item-side">
        {count && <span className="nx-count">{count}</span>}
        <Chevron />
      </span>
    </Link>
  );
}

// ── Level chooser (/notes root) ──────────────────────────────────────────────

/** Hero copy per level code. Adrian, 2026-08-29 (phone review): the two level
 *  rows read as list items, not as places — so /notes opens on two big tiles in
 *  the portal's hero language, one strong colour each (the accents live in
 *  notes.css, keyed on `data-level`). A code that isn't in this map still
 *  renders — chip falls back to the code, subtitle is simply omitted — so
 *  adding a level to NOTES_LEVELS can never produce a broken tile. */
const LEVEL_HERO: Record<string, { chip: string; blurb: string }> = {
  AM: {
    chip: 'AM',
    blurb: 'Calculus, trig identities and every A-Math formula, worked through.',
  },
  EM: {
    chip: 'EM',
    blurb: 'Algebra, geometry and stats — the E-Math syllabus, topic by topic.',
  },
};

async function LevelChooser() {
  // Real numbers and real topic names on the tiles (Adrian, 2026-08-29: the
  // bare colour slabs "can be made better") — same query as the level index,
  // so the tile can never disagree with the page behind it.
  const viewer = await notesViewer();
  const levels = await Promise.all(
    NOTES_LEVELS.map(async l => {
      const topics = await getLevelIndex(l.code, viewer);
      return {
        ...l,
        topics: topics.length,
        examples: topics.reduce((n, t) => n + t.examples, 0),
        sample: topics.slice(0, 3).map(t => t.topic),
      };
    }),
  );
  return (
    <PageFrame
      header={
        <>
          <p className="nx-eyebrow">Notes</p>
          <h1 className="nx-title">Revision Notes</h1>
          <p className="nx-lede">Worked examples for every topic — pick your level.</p>
          <hr className="nx-rule" />
        </>
      }
    >
      <div className="nx-heroes">
        {levels.map(l => {
          const hero = LEVEL_HERO[l.code];
          return (
            <Link
              key={l.code}
              href={`/notes/${l.code.toLowerCase()}`}
              className="nx-hero"
              data-level={l.code}
            >
              {/* The code, not a picture: it is how the level is named
                  everywhere else in the shell, and it can never be the wrong
                  metaphor for a syllabus. */}
              <span className="nx-hero-chip" aria-hidden>
                {hero?.chip ?? l.code}
              </span>
              <span className="nx-hero-body">
                <span className="nx-hero-title">{l.label}</span>
                {hero && <span className="nx-hero-sub">{hero.blurb}</span>}
                {l.sample.length > 0 && (
                  <span className="nx-hero-topics">
                    {l.sample.map(t => (
                      <span key={t} className="nx-hero-topic">
                        {t}
                      </span>
                    ))}
                    {l.topics > l.sample.length && (
                      <span className="nx-hero-topic nx-hero-topic-more">
                        +{l.topics - l.sample.length} more
                      </span>
                    )}
                  </span>
                )}
                <span className="nx-hero-cta">
                  {l.topics > 0
                    ? `${plural(l.topics, 'topic')} · ${plural(l.examples, 'worked example')}`
                    : 'Browse topics'}
                  <Chevron />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </PageFrame>
  );
}

// ── Level index ──────────────────────────────────────────────────────────────

async function LevelIndex({ level }: { level: string }) {
  const topics = await getLevelIndex(level, await notesViewer());

  if (topics.length === 0) {
    return (
      <PageFrame header={<h1 className="nx-title">{levelLabel(level)}</h1>}>
        <p className="nx-lede">No published notes yet.</p>
      </PageFrame>
    );
  }

  // Same grouping the browse panel uses, so the page and the tree read as one.
  const families = groupByFamily(level, topics, t => t.topic);

  const toc: TocEntry[] = families.map(({ family }) => ({
    title: family.label,
    url: `#family-${topicSlug(family.label)}`,
    depth: 2,
  }));

  return (
    <PageFrame
      toc={toc}
      header={
        <>
          {/* No lede, no counts — Adrian, 2026-08-21: the landing page is just
              the topic list; a student picks a topic and reads. */}
          <p className="nx-eyebrow">Notes</p>
          <h1 className="nx-title">{levelLabel(level)}</h1>
          <hr className="nx-rule" />
        </>
      }
    >
      {families.map(({ family, items }) => (
        <section key={family.label} className="nx-family">
          <h2 className="nx-family-head" id={`family-${topicSlug(family.label)}`}>
            {family.label}
          </h2>
          <div className="nx-grid">
            {items.map(t => (
              <CardLink key={t.url} href={t.url} title={t.topic} />
            ))}
          </div>
        </section>
      ))}
    </PageFrame>
  );
}

// ── Topic index ──────────────────────────────────────────────────────────────

async function TopicIndex({ level, topicSlugParam }: { level: string; topicSlugParam: string }) {
  const viewer = await notesViewer();
  const admin = viewer.admin;
  const data = await getTopicPage(level, topicSlugParam, viewer);
  if (!data) notFound();

  const url = topicUrl(level, data.topic);

  // Revision-only topic page (Adrian, 2026-08-29 phone review): the old page
  // stacked key facts, techniques, watch-outs, concept dropdowns AND the
  // examples — "teaching from scratch and revising at the same time". A
  // student revising gets exactly the worked examples; the whole teaching
  // stack lives on `${url}/learn` (LearnPage below).
  const sections = admin ? data.unitSections : approvedSections(data.unitSections);
  const hasLearn =
    sections.length > 0 || Boolean(data.card?.content_md && (admin || data.card.status === 'published'));
  const showPages = data.subgroups.length > 0;
  const pending = admin
    ? data.unitSections.reduce(
        (n, s) =>
          n +
          s.units.filter(u => u.draft && !u.flagged).length +
          (s.lead && s.lead.draft && !s.lead.flagged ? 1 : 0),
        0,
      )
    : 0;

  const { previous, next } = await footerFor(level, url);

  // 📋 How Adrian approaches it — the topic's method templates from the
  // teaching-knowledge layer (lib/teaching-knowledge.ts), minus any the
  // sub-group names, ledes and example titles below already announce. Approved
  // rows only, in his words; [] when the shelf has nothing. Adrian, 3 Sep 2026.
  const plan = await loadDeckPlan(getSupabaseAdmin(), {
    level, topic: data.topic, max: 3,
    deckText: data.subgroups
      .flatMap(s => [s.name, cleanDescription(s.description).summary || '', ...s.examples.map(e => e.card_title)])
      .join('\n'),
  });

  return (
    <PageFrame
      previous={previous}
      next={next}
      header={
        <>
          <BackLink href={`/notes/${level.toLowerCase()}`}>
            {levelLabel(level)}
          </BackLink>
          <h1 className="nx-title">{data.topic}</h1>
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
        </>
      }
    >
      {plan.length > 0 && (
        <section>
          <h2 className="nx-section">How Adrian approaches it</h2>
          <div className="nx-list">
            {plan.map(m => (
              <details key={m.id} className="nx-fold" open>
                <summary className="nx-fold-head">
                  <span className="nx-item-main">
                    <span className="nx-item-title" dangerouslySetInnerHTML={{ __html: mathHtml(m.question_type) }} />
                  </span>
                  <span className="nx-item-side"><Chevron /></span>
                </summary>
                <div className="nx-fold-body">
                  <p className="nx-lede" dangerouslySetInnerHTML={{ __html: mathHtml(m.method) }} />
                  {m.watch_out && (
                    <p className="nx-lede" dangerouslySetInnerHTML={{ __html: '⚠️ ' + mathHtml(m.watch_out) }} />
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {showPages ? (
        <section>
          <h2 id={ANCHOR.pages} className="nx-section">
            Worked examples
          </h2>
          {/* Nested accordions (Adrian, 2026-08-29): each folder opens in
              place to its examples, each example opens to its full working —
              two taps from the topic page to any solution, no navigation. */}
          <div className="nx-list">
            {data.subgroups.map(s => {
              const desc = cleanDescription(s.description).summary;
              return (
                <details key={s.url} className="nx-fold">
                  <summary className="nx-fold-head">
                    <span className="nx-item-main">
                      <span className="nx-item-title">
                        {cleanTitle(s.name)}
                        <AudienceBadge badge={s.badge} />
                      </span>
                      {desc && (
                        <span
                          className="nx-item-desc"
                          dangerouslySetInnerHTML={{ __html: mathHtml(desc) }}
                        />
                      )}
                    </span>
                    <span className="nx-item-side">
                      <span className="nx-count">{plural(s.count, 'example')}</span>
                      <Chevron />
                    </span>
                  </summary>
                  <div className="nx-fold-body">
                    {s.examples.map((ex, i) => (
                      <Example
                        key={ex.id}
                        snippet={{ id: `t-${ex.id}`, card_title: ex.card_title, content: ex.content, n: i + 1 }}
                      />
                    ))}
                    <Link href={s.url} className="nx-fold-open">
                      Open this set as its own page ↗
                    </Link>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="nx-lede">Worked examples for this topic are being prepared.</p>
      )}

      {/* The teaching stack, one click away — never interleaved with revision. */}
      {hasLearn && (
        <CardLink
          href={`${url}/learn`}
          title="📖 Learn this topic from scratch"
          description="Key ideas, formulas and techniques, step by step — for the first time round, not revision."
          count={admin && pending > 0 ? `${pending} to review` : undefined}
        />
      )}
    </PageFrame>
  );
}

// ── Learn page (the teaching stack, split out of the topic page) ─────────────

async function LearnPage({ level, topicSlugParam }: { level: string; topicSlugParam: string }) {
  const viewer = await notesViewer();
  const admin = viewer.admin;
  const data = await getTopicPage(level, topicSlugParam, viewer);
  if (!data) notFound();

  const url = topicUrl(level, data.topic);
  const sections = admin ? data.unitSections : approvedSections(data.unitSections);
  const showCard = Boolean(
    data.card?.content_md && (admin || data.card?.status === 'published'),
  );
  if (sections.length === 0 && !showCard) notFound();

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
    showCard && { title: 'Quick revision', url: `#${ANCHOR.revision}`, depth: 2 },
    // One entry per concept dropdown; the anchor sits on the <details> row, so
    // the link works whether or not the student has opened it.
    ...sections.map(s => ({ title: s.title, url: `#${s.id}`, depth: 2 })),
  ].filter(Boolean) as TocEntry[];

  return (
    <PageFrame
      toc={toc}
      header={
        <>
          <BackLink href={url}>{data.topic}</BackLink>
          <h1 className="nx-title">Learn from scratch</h1>
          <p className="nx-lede">
            The full teaching version of {data.topic} — key ideas, formulas and techniques.
            Revising instead? The worked examples live one page back.
          </p>
          <hr className="nx-rule" />
        </>
      }
    >
      {admin && data.unitSections.length > 0 && (
        <ReviewBar
          level={level}
          topic={data.topic}
          pending={pending}
          flagged={flagged}
          fixed={fixed}
        />
      )}

      {/* Quick-revision card, when the topic has one. Its own title is dropped:
          it always restates the topic, which is already the page heading.
          Students only see published cards — drafts are the reviewer's. */}
      {showCard && data.card?.content_md && (
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

      {/* The lesson itself — one dropdown per concept. */}
      {sections.length > 0 && (
        <>
          <h2 className="nx-section">Notes &amp; formulas</h2>
          <NotesUnits sections={sections} admin={admin} />
        </>
      )}
    </PageFrame>
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
    // Closed-by-default accordion (Adrian, 2026-08-29): a page of full
    // solutions was a wall — closed, the page is a scannable list of navy
    // title bars; tap one to study it. The id is the search deep-link target
    // (#ex-<id>) and the "On this page" anchor — openFromHash() below pops the
    // right one open when a link lands here.
    <details className="nx-ex" id={`ex-${snippet.id}`}>
      <summary className="nx-ex-head">
        <span className="nx-ex-no">{snippet.n}</span>
        <h3 className="nx-ex-title">{title || `Worked example ${snippet.n}`}</h3>
        <svg
          className="nx-ex-chev"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </summary>
      <div className="nx-ex-body">
        <NotesMarkdown content={snippet.content} />
      </div>
    </details>
  );
}

/** Opens the #ex-… accordion a deep link points at — search results, "On this
 *  page" entries and shared URLs all land on a <details> that starts closed. */
const OPEN_FROM_HASH = `(function () {
  function openFromHash() {
    var h = location.hash.slice(1);
    if (!h) return;
    var el = document.getElementById(h);
    if (el && el.tagName === 'DETAILS' && !el.open) {
      el.open = true;
      el.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();`;

async function SubgroupPage({
  level,
  topicSlugParam,
  subgroupSlug,
}: {
  level: string;
  topicSlugParam: string;
  subgroupSlug: string;
}) {
  const data = await getSubgroupPage(level, topicSlugParam, subgroupSlug, await notesViewer());
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

  const toc: TocEntry[] = sections.flatMap(({ section, items }) => [
    ...(showSections ? [{ title: section.name, url: `#${section.id}`, depth: 2 }] : []),
    ...items.map(s => ({
      title: cleanTitle(s.card_title) || `Worked example ${s.n}`,
      url: `#ex-${s.id}`,
      depth: showSections ? 3 : 2,
    })),
  ]);

  const { previous, next } = await footerFor(level, url);

  return (
    <PageFrame
      toc={toc}
      previous={previous}
      next={next}
      header={
        <>
          <BackLink href={topicUrl(level, data.topic)}>{data.topic}</BackLink>
          <h1 className="nx-title">{cleanTitle(data.subgroup.name)}</h1>
          {summary && <p className="nx-lede" dangerouslySetInnerHTML={{ __html: mathHtml(summary) }} />}
          <div className="nx-meta">
            <span className="nx-pill">{plural(n, 'worked example')}</span>
            {data.badge && <span className="nx-pill">{data.badge}</span>}
            {example && (
              <span className="nx-eg">
                <b>e.g.</b>
                <span dangerouslySetInnerHTML={{ __html: mathHtml(example) }} />
              </span>
            )}
          </div>
          <hr className="nx-rule" />
        </>
      }
    >
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
      <script dangerouslySetInnerHTML={{ __html: OPEN_FROM_HASH }} />
    </PageFrame>
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
    // No sub-group slugs to 'learn' (checked against all 1,127 names,
    // 2026-08-29), so the teaching stack owns that segment.
    if (slug[2] === 'learn') return <LearnPage level={level} topicSlugParam={slug[1]} />;
    return <SubgroupPage level={level} topicSlugParam={slug[1]} subgroupSlug={slug[2]} />;
  }
  notFound();
}
