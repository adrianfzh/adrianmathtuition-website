// TODO PORTAL: Build /app/practice.
//
// Two sections:
//
// 1. "Find practice question" form (mirror of Telegram /similar):
//      - Photo upload (drag-drop or click) OR text description
//      - Submit → POST to /api/portal/practice (new endpoint, NOT /api/learn)
//        which calls the same Opus generate-and-verify pipeline as
//        the bot's handlers/similar.js
//      - Display generated variant inline with KaTeX rendering
//      - "🔎 Show working" / "🔄 Try another" / "🔁 New search" buttons
//
// 2. Practice history list:
//      - Last N attempts from student_attempts WHERE user_id = auth.uid()
//      - Each row: date · brief topic · ✓/✗ · click → expand to full question + answer
//
// Reuse the bot's Opus prompt-building logic; share via a new
// src/lib/practice-pipeline.ts so we don't duplicate prompts across two places.

export default function PracticePage() {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Practice</h1>
      <p className="text-sm text-gray-600">
        {/* TODO PORTAL: build the find-question form + history */}
        Practice flow coming soon. See PORTAL.md.
      </p>
    </div>
  );
}
