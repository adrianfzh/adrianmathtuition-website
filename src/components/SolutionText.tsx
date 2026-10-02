'use client';
// A worked solution the way a reader should see it (lib/solution-readability.ts):
// one step a line, part labels bold, equations lined up on "=", checks and
// asides grey, mark codes as a small grey chip, "Another way" after the
// working, and — on admin pages only — the mark scheme folded away at the bottom.
import { mathHtml } from '@/lib/math-inline';
import { solutionView, displayFractions, withPartAnswers, alignView, type AlignedLine, type AlignRow } from '@/lib/solution-readability';

const tex = (s: string) => ({ __html: mathHtml(`$${displayFractions(s)}$`) });
const GREY = '#6b7280';

/** Rows of equations on a grid: joining word | (finished case) left side | = right side  ← note. */
function Aligned({ rows }: { rows: AlignRow[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'max-content max-content minmax(0, 1fr)', columnGap: 6, rowGap: 7, alignItems: 'baseline', margin: '4px 0', overflowX: 'auto' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <span style={{ color: GREY, fontSize: '0.85em', textAlign: 'right' }}>{r.lead ?? ''}</span>
          <span style={{ textAlign: 'right' }} dangerouslySetInnerHTML={r.done || r.lhs ? tex(r.done ? `${r.done} \\qquad ${r.lhs}` : r.lhs) : { __html: '' }} />
          <span style={{ lineHeight: 1.9 }}>
            <span dangerouslySetInnerHTML={tex(r.rel ? `{}${r.rel} ${r.rhs}` : r.rhs)} />
            {r.note && <span style={{ marginLeft: 12, color: GREY, fontSize: '0.85em' }}>← <span dangerouslySetInnerHTML={{ __html: mathHtml(r.note) }} /></span>}
            {r.codes && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#9ca3af', fontFamily: 'Arial, sans-serif' }}>{r.codes}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function Lines({ lines }: { lines: AlignedLine[] }) {
  return (
    <>
      {lines.map((l, i) => {
        if (l.kind === 'align') return <Aligned key={i} rows={l.rows} />;
        if (l.kind === 'display') {
          return <div key={i} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: mathHtml(l.text) }} />;
        }
        if (l.kind === 'answer') {
          return <div key={i} style={{ fontWeight: 700, padding: '4px 0 2px' }}>Answer: <span dangerouslySetInnerHTML={{ __html: mathHtml(displayFractions(l.text)) }} /></div>;
        }
        if (l.kind === 'label') {
          return <div key={i} style={{ fontWeight: 700, color: '#1e3a8a', marginTop: i ? 12 : 0 }}>{l.text}</div>;
        }
        if (l.kind === 'sub') {
          return <div key={i} style={{ fontWeight: 600, marginTop: 6 }} dangerouslySetInnerHTML={{ __html: mathHtml(displayFractions(l.text)) }} />;
        }
        const quiet = l.kind === 'quiet';
        return (
          <div key={i} style={{ lineHeight: 1.7, padding: '2px 0', color: quiet ? GREY : undefined, fontSize: quiet ? '0.9em' : undefined }}>
            <span dangerouslySetInnerHTML={{ __html: mathHtml(displayFractions(l.text)) }} />
            {l.codes && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#9ca3af', fontFamily: 'Arial, sans-serif' }}>{l.codes}</span>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function SolutionText({ text, showScheme = false, answer, partAnswers }: {
  text: string; showScheme?: boolean; answer?: string | null; partAnswers?: Record<string, string>;
}) {
  const v = solutionView(text);
  const main = alignView(partAnswers ? withPartAnswers(v.main, partAnswers) : v.main);
  return (
    <div>
      <Lines lines={main} />
      {answer && answer.trim() && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          Answer: <span dangerouslySetInnerHTML={{ __html: mathHtml(displayFractions(answer)) }} />
        </div>
      )}
      {v.alternatives.map((a, i) => (
        <div key={i} style={{ marginTop: 12, padding: '8px 10px', borderLeft: '3px solid #d1d5db', background: 'rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: GREY, marginBottom: 4 }}>Another way</div>
          <Lines lines={alignView(a)} />
        </div>
      ))}
      {showScheme && v.scheme && (
        <details style={{ marginTop: 12, fontSize: 12, color: GREY }}>
          <summary style={{ cursor: 'pointer' }}>Mark scheme</summary>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }} dangerouslySetInnerHTML={{ __html: mathHtml(v.scheme) }} />
        </details>
      )}
    </div>
  );
}
