// The essay report, in the order the spec fixes (SPEC-ESSAY-MARKING.md §What
// comes back): the student's own text with every slip marked in place, the three
// habits to fix, task and structure, the upgrades, then the band RANGE with its
// descriptor and the disclaimer. No number out of 30 anywhere on this page.
import type { EssayReport, EssayMark } from '@/lib/essay-report';
import { segmentsFor, bandLine } from '@/lib/essay-report';
import { codeLabel } from '@/lib/essay-codes';
import type { RubricCriterion } from '@/lib/essay-rubric';

function Marked({ text, marks }: { text: string; marks: EssayMark[] }) {
  const paragraphs: { text: string; offset: number }[] = [];
  let offset = 0;
  for (const p of text.split(/\n\s*\n/)) {
    const at = text.indexOf(p, offset);
    paragraphs.push({ text: p, offset: at });
    offset = at + p.length;
  }
  return (
    <div className="space-y-3 text-[15px] leading-7 text-gray-800">
      {paragraphs.map((p, i) => {
        const local = marks
          .filter(m => m.start >= p.offset && m.end <= p.offset + p.text.length)
          .map(m => ({ ...m, start: m.start - p.offset, end: m.end - p.offset }));
        return (
          <p key={i}>
            {segmentsFor(p.text, local).map((s, j) =>
              s.mark ? (
                <span key={j} className="relative inline">
                  <mark
                    className="bg-rose-50 text-rose-900 underline decoration-rose-500 decoration-2 underline-offset-2 rounded-sm px-0.5"
                    title={[s.mark.fix ? `→ ${s.mark.fix}` : null, s.mark.reason, codeLabel('english', s.mark.code)].filter(Boolean).join(' · ')}
                  >
                    {s.text}
                  </mark>
                  {s.mark.fix && s.mark.fix !== s.text && (
                    <span className="ml-1 text-[12px] font-semibold text-emerald-700 align-baseline">{s.mark.fix}</span>
                  )}
                </span>
              ) : (
                <span key={j}>{s.text}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function EssayReportView({ text, report, criteria, subject }: {
  text: string; report: EssayReport; criteria: RubricCriterion[]; subject: string;
}) {
  const bandsDecided = report.total != null;
  return (
    <div className="space-y-4">
      {/* 1. The corrected essay */}
      <section className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Your essay, marked</h2>
        <p className="text-[12px] text-gray-500 mb-3">
          Underlined in red is a slip; the green words beside it are the fix. Tap a slip for the reason.
          {report.marks.length ? ` ${report.marks.length} marked.` : ' Nothing to mark — clean.'}
        </p>
        <Marked text={text} marks={report.marks} />
      </section>

      {/* 2. Three habits */}
      {report.habits.length > 0 && (
        <section className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Fix these first</h2>
          <ol className="space-y-3">
            {report.habits.map((h, i) => (
              <li key={h.code} className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600 text-white text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">{codeLabel(subject, h.code)} <span className="text-gray-400 font-normal">×{h.count}</span></p>
                  {h.advice && <p className="text-[13px] text-gray-700 mt-0.5">{h.advice}</p>}
                  {h.example && <p className="text-[12px] text-gray-500 mt-0.5 italic">“{h.example}”</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 3. Task and structure */}
      {report.task && (
        <section className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Did it answer the question?</h2>
          <p className="text-sm text-navy font-semibold">
            {report.task.answered === 'yes' ? 'Yes' : report.task.answered === 'partly' ? 'Partly' : report.task.answered === 'no' ? 'Not really' : '—'}
          </p>
          {report.task.points.length > 0 && (
            <ul className="mt-2 space-y-1">
              {report.task.points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]">
                  <span className={p.met ? 'text-emerald-600' : 'text-rose-600'}>{p.met ? '✓' : '✗'}</span>
                  <span className={p.met ? 'text-gray-700' : 'text-rose-800'}>{p.point}</span>
                </li>
              ))}
            </ul>
          )}
          {(report.task.opening || report.task.ending) && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              {report.task.opening && <><dt className="text-gray-400">Opening</dt><dd className="text-gray-700">{report.task.opening}</dd></>}
              {report.task.ending && <><dt className="text-gray-400">Ending</dt><dd className="text-gray-700">{report.task.ending}</dd></>}
            </dl>
          )}
          {report.task.paragraphs.some(p => !p.controlling_idea || p.note) && (
            <ul className="mt-3 space-y-0.5 text-[12px] text-gray-600">
              {report.task.paragraphs.filter(p => !p.controlling_idea || p.note).map(p => (
                <li key={p.n}>Paragraph {p.n}: {p.controlling_idea ? '' : 'no clear controlling idea. '}{p.note ?? ''}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 4. Upgrades */}
      {report.upgrades.length > 0 && (
        <section className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Stronger ways to say it</h2>
          <ul className="space-y-3">
            {report.upgrades.map((u, i) => (
              <li key={i} className="text-[13px]">
                <p className="text-gray-500 line-through decoration-gray-300">{u.quote}</p>
                <p className="text-navy font-semibold">{u.better}</p>
                {u.why && <p className="text-[12px] text-gray-500">{u.why}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. The band range */}
      <section className="bg-violet-50 rounded-3xl p-4 border border-violet-100">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-700 mb-2">Where it sits on the O-Level bands</h2>
        {bandsDecided ? (
          <>
            <ul className="space-y-2">
              {criteria.map(c => {
                const b = report.bands[c.key];
                return (
                  <li key={c.key}>
                    <p className="text-sm text-navy"><b>{c.label}</b> · {bandLine(b, c.max)}</p>
                    {b?.descriptors?.length ? <p className="text-[12px] text-gray-600">{b.descriptors.join(' · ')}</p> : null}
                    {b?.evidence && <p className="text-[12px] text-gray-500 italic">{b.evidence}</p>}
                  </li>
                );
              })}
            </ul>
            <p className="text-sm text-navy mt-3"><b>Together: {report.total!.min}–{report.total!.max} of {report.total!.out_of}</b></p>
          </>
        ) : (
          <p className="text-sm text-gray-700">The two reads did not agree on the band, so it is being checked. The feedback above stands.</p>
        )}
        <p className="text-[12px] text-gray-500 mt-2">
          An examiner-style read against the SEAB band descriptors — not your teacher&apos;s mark. Two teachers can
          differ by a band on the same essay, so this is a range, never a number.
        </p>
      </section>
    </div>
  );
}
