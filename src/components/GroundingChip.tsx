// What a marking was GROUNDED on — the scheme it marked against. Sits beside
// SubjectChip on triage and library rows so a marking that changed marks says
// what it used; until 2 Sep 2026 the only trace was a server log line.
//
// Sources (bot result_json.grounding.source):
//   attached           — a mark scheme Adrian attached to this upload; with
//                        grounding.attached_by 'student' (24 Sep 2026) the
//                        answers/scheme the STUDENT attached at hand-in — this
//                        paper only, never filed as the paper's scheme
//   stored-name        — a scheme kept from an earlier run, matched by paper name
//   stored-fingerprint — same, matched by the printed questions themselves
//   bank               — a question-bank match (science)
//   mock               — a generated paper's own questions
// Silent for null: an ungrounded marking is the ordinary case and needs no badge.
import type { CSSProperties } from 'react';

const LABEL: Record<string, { text: string; title: string; bg: string; fg: string; border: string }> = {
  'attached':           { text: '📘 scheme · attached', title: 'Marked against the school mark scheme attached to this upload', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
  'stored-name':        { text: '📘 scheme · stored',   title: 'Marked against a scheme stored from an earlier upload of this paper (matched by name)', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
  'stored-fingerprint': { text: '📘 scheme · matched',  title: 'Marked against a stored scheme, recognised by the printed questions', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
  'bank':               { text: '📚 bank',              title: 'Marked against matching questions from the question bank', bg: '#f3f4f6', fg: '#374151', border: '#e5e7eb' },
  'mock':               { text: '🎯 generated',         title: 'A generated paper: marked against its own bank questions', bg: '#f3f4f6', fg: '#374151', border: '#e5e7eb' },
};

const STUDENT_ATTACHED = { text: '📘 scheme · student’s', title: 'Marked against the answers or scheme the student attached at hand-in — this paper only; never stored as the paper’s scheme, and the library’s own solutions outrank it', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };

export default function GroundingChip({ source, attachedBy, style }: { source: string | null | undefined; attachedBy?: string | null; style?: CSSProperties }) {
  if (!source || !LABEL[source]) return null;
  const c = source === 'attached' && attachedBy === 'student' ? STUDENT_ATTACHED : LABEL[source];
  return (
    <span title={c.title} style={{
      display: 'inline-block', padding: '1px 7px', fontSize: 11, fontWeight: 700, lineHeight: '16px',
      borderRadius: 999, background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      verticalAlign: 'middle', whiteSpace: 'nowrap', ...style,
    }}>{c.text}</span>
  );
}
