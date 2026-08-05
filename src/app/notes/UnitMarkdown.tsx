'use client';

// Learning-unit payloads go through the shared math pipeline with NO extra
// plugins — deliberately, unlike `NotesMarkdown`.
//
// `remarkNotesBlocks` exists to recover structure from worked-example markdown
// that was authored as prose (`**Step 1.**`, `**Answer:**`). Unit payloads never
// need that: their structure is the JSON, and the block components below read it
// directly. Running the plugin here would be a second parser looking for cues in
// text that has none, and the one place it could fire — a `remember_md` that
// happens to open with `**Answer:**` — is exactly where it would be wrong.

import { MathMarkdown } from '@/lib/math-markdown';

export function UnitMd({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className ? `notes-prose ${className}` : 'notes-prose'}>
      <MathMarkdown content={content} />
    </div>
  );
}
