// TODO PORTAL: Build /app/notes.
//
// Two views:
//
// 1. Topic list (default):
//      - Pull canonical topics for the student's level from canonical_topics
//        (lib/canonical-topics.ts) OR from `subgroups` table (DISTINCT topic
//        WHERE level = currentLevel).
//      - Group by category (Algebra & Functions / Calculus / Geometry / etc.)
//        — see canonical_topics.json for the category groupings.
//      - Each row: topic name + [📖 Read] [✏️ Practice] action buttons.
//
// 2. Topic detail (/app/notes/[topic-slug]):
//      - Pull KB entries for this topic+level via /api/kb-query (already exists).
//      - Render the KB markdown with KaTeX.
//      - "💬 Ask Claude about this" sidebar that opens a chat seeded with the
//        topic's KB content as grounding (reuse /api/learn pattern).
//      - "✏️ Practice this topic" button → /app/practice?topic=xxx.

export default function NotesPage() {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Notes & Topics</h1>
      <p className="text-sm text-gray-600">
        {/* TODO PORTAL: build the topic list */}
        Topic browser coming soon. See PORTAL.md.
      </p>
    </div>
  );
}
