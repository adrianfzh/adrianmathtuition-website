'use client';

// The notes surface's view of the shared math pipeline: same plugins, plus the
// block-structuring pass. It lives in a client module because remark plugins are
// functions and cannot be handed from a server component across the RSC
// boundary — the array has to be constructed on this side.

import { MathMarkdown } from '@/lib/math-markdown';
import { remarkNotesBlocks } from '@/lib/notes-blocks';

const NOTES_PLUGINS = [remarkNotesBlocks];

export default function NotesMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className ? `notes-prose ${className}` : 'notes-prose'}>
      <MathMarkdown content={content} extraRemarkPlugins={NOTES_PLUGINS} />
    </div>
  );
}
