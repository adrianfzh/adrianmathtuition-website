// A small pill naming a marking run's subject. Math is the default and the
// overwhelming majority, so the chip stays SILENT for math unless asked
// (`showMath`) — the library and triage rows only grow a chip when a paper is
// something else. Inline styles on purpose: both host pages are inline-styled.
import type { CSSProperties } from 'react';
import { subjectLabel } from '@/lib/mark-subjects';

const STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  math: { bg: '#f3f4f6', fg: '#374151', border: '#e5e7eb' },
  physics: { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  chemistry: { bg: '#f0fdf4', fg: '#15803d', border: '#bbf7d0' },
  biology: { bg: '#fdf4ff', fg: '#a21caf', border: '#f5d0fe' },
};

export default function SubjectChip({ subject, showMath = false, style }: {
  subject: string | null | undefined;
  showMath?: boolean;
  style?: CSSProperties;
}) {
  if (!subject || (subject === 'math' && !showMath)) return null;
  const c = STYLE[subject] ?? STYLE.math;
  return (
    <span
      title={`${subjectLabel(subject)} paper`}
      style={{
        display: 'inline-block', padding: '1px 7px', fontSize: 11, fontWeight: 700, lineHeight: '16px',
        borderRadius: 999, background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
        verticalAlign: 'middle', whiteSpace: 'nowrap', ...style,
      }}
    >
      {subjectLabel(subject)}
    </span>
  );
}
