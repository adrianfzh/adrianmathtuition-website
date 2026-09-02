// The marking-rules stamp (paper_marking_runs.rules_version, bot
// ai/paper-marker.js rulesVersion) as a quiet mono tag beside a run. A content
// hash of the rules in force when the paper was marked: two runs with the same
// model and the same tag differ only by the model's variance; a different tag
// means the rules were edited in between. Null (no tag) on runs before 2 Sep 2026.
import type { CSSProperties } from 'react';

export default function RulesTag({ v, style }: { v?: string | null; style?: CSSProperties }) {
  if (!v) return null;
  return (
    <code
      title="Marking rules in force for this run. Same model + same tag = only the model's variance separates two markings; a different tag = the rules were edited in between."
      style={{ fontSize: 10, color: '#8a8a8a', background: '#f3f3f3', borderRadius: 4, padding: '1px 5px', fontFamily: 'ui-monospace, Menlo, monospace', ...style }}
    >
      {v}
    </code>
  );
}
