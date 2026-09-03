// ── Learning-unit blocks ─────────────────────────────────────────────────────
//
// Ported from the previews in /admin/learn-review, which are the only renderers
// that have ever existed for these payloads — restyled onto the portal's tokens
// and with the review-only affordances dropped.
//
// What changed on the way across:
//   · Decisions are not rendered. The review page labels them "quiz data,
//     currently hidden from students", and first-exposure material is meant to
//     tell rather than quiz — so they stay in the payload and off the page.
//   · `check` renders answered: the right option marked, every option's feedback
//     shown. On a revision page the teaching is *why the other three are wrong*,
//     which a student who guesses in silence never gets.
//   · `try` hides its answer behind a native <details>. It is the one block whose
//     whole point is attempting it first, and <details> buys that with no JS.

import type { ReactNode } from 'react';
import { UnitMd } from './UnitMarkdown';
import { BlockReview } from './ReviewControls';
import ReorderUnits from './ReorderUnits';
import {
  asAutopsy,
  asCheck,
  asCore,
  asExample,
  asTry,
  KIND_DISPLAY,
  leadToBullets,
  partitionPractice,
  readingMinutes,
  sanitiseFigure,
  simplifyTitle,
  unitFigures,
  wrongIndex,
  type NotesUnit,
  type UnitFigure,
  type UnitSection,
} from '@/lib/notes-units';
import type { DecisionOption } from '@/lib/learn-types';

/** Raw LaTeX from a payload, rendered as display math. */
function Math({ tex }: { tex: string }) {
  return <UnitMd content={`$$\n${tex}\n$$`} className="nx-u-math" />;
}

function Figure({ svg }: { svg?: string }) {
  const clean = sanitiseFigure(svg);
  if (!clean) return null;
  return <div className="nx-u-figure" dangerouslySetInnerHTML={{ __html: clean }} />;
}

/**
 * Raster figures extracted from Adrian's DOCX notes. Only our own storage
 * origin renders — a payload URL pointing anywhere else is dropped, not
 * proxied. Plain <img>: dimensions are unknown at build time, and these are
 * small scans (25–180 KB) already behind lazy loading.
 */
function FigureImgs({ unit, slot }: { unit: NotesUnit; slot: UnitFigure['slot'] }) {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin) return null;
  const base = `${origin.replace(/\/$/, '')}/storage/v1/object/public/`;
  const figs = unitFigures(unit.payload, slot).filter(f => f.url.startsWith(base));
  if (figs.length === 0) return null;
  return (
    <div className="nx-u-figs">
      {figs.map(f => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={f.url} src={f.url} alt={f.alt} loading="lazy" />
      ))}
    </div>
  );
}

/** A labelled panel — problem, answer, remember, why, fix. */
function Panel({
  tone,
  label,
  children,
}: {
  tone: 'neutral' | 'answer' | 'remember' | 'wrong';
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="nx-u-panel" data-tone={tone}>
      <p className="nx-u-panel-label">{label}</p>
      {children}
    </div>
  );
}

// ── core ─────────────────────────────────────────────────────────────────────

function Core({ unit }: { unit: NotesUnit }) {
  const p = asCore(unit.payload);
  // One sentence per bullet where the prose allows it — the register students
  // actually read. Falls back to the authored paragraphs untouched.
  const lead = p.summary_md ? (leadToBullets(p.summary_md) ?? p.summary_md) : null;
  return (
    <>
      <Figure svg={p.figure_svg} />
      {lead && <UnitMd content={lead} className="nx-u-lead" />}
      <FigureImgs unit={unit} slot="lead" />
      {p.formula_md && (
        <div className="nx-u-formula nx-u-keyformula">
          <span className="nx-u-keyformula-label" aria-hidden>
            ⭐ Key formula
          </span>
          <UnitMd content={p.formula_md} />
        </div>
      )}
      {p.remember_md && (
        <Panel tone="remember" label="Remember">
          <UnitMd content={p.remember_md} />
        </Panel>
      )}
    </>
  );
}

// ── example ──────────────────────────────────────────────────────────────────

function Example({ unit }: { unit: NotesUnit }) {
  const p = asExample(unit.payload);
  return (
    <>
      {p.problem_md && (
        <Panel tone="neutral" label="Problem">
          <UnitMd content={p.problem_md} />
          <FigureImgs unit={unit} slot="problem" />
        </Panel>
      )}
      <ol className="nx-u-steps">
        {(p.steps ?? []).map((step, i) => (
          <li key={i} className="nx-u-step">
            <div className="nx-u-step-head">
              <span className="nx-u-step-no">{i + 1}</span>
              {/* Through the math renderer, not plain text — ingested labels
                  carry $…$ ("Sub $x=\tfrac{7}{11}$ into (3)"). */}
              {step.label && (
                <div className="nx-u-step-label">
                  <UnitMd content={step.label} />
                </div>
              )}
            </div>
            <Figure svg={step.figure_svg} />
            {step.math && <Math tex={step.math} />}
            {step.annotation_md && (
              <div className="nx-u-cue">
                <UnitMd content={step.annotation_md} />
              </div>
            )}
            {step.more_md && (
              <details className="nx-u-more">
                <summary>Why this step?</summary>
                <UnitMd content={step.more_md} />
              </details>
            )}
          </li>
        ))}
      </ol>
      <FigureImgs unit={unit} slot="solution" />
      {p.answer_md && (
        <Panel tone="answer" label="Answer">
          <UnitMd content={p.answer_md} />
        </Panel>
      )}
    </>
  );
}

// ── check ────────────────────────────────────────────────────────────────────

function Option({ opt }: { opt: DecisionOption }) {
  return (
    <li className="nx-u-opt" data-ok={opt.ok ? 'true' : 'false'}>
      <span className="nx-u-opt-mark" aria-hidden>
        {opt.ok ? '✓' : '✗'}
      </span>
      <span className="nx-u-opt-body">
        <span className="nx-u-sr">{opt.ok ? 'Correct: ' : 'Not this: '}</span>
        {opt.label_md && <UnitMd content={opt.label_md} />}
        {opt.feedback_md && (
          <div className="nx-u-opt-why">
            <UnitMd content={opt.feedback_md} />
          </div>
        )}
      </span>
    </li>
  );
}

function Check({ unit }: { unit: NotesUnit }) {
  const p = asCheck(unit.payload);
  return (
    <>
      {p.prompt_md && <UnitMd content={p.prompt_md} className="nx-u-prompt" />}
      <ul className="nx-u-opts">
        {(p.options ?? []).map((opt, i) => (
          <Option key={i} opt={opt} />
        ))}
      </ul>
    </>
  );
}

// ── autopsy ──────────────────────────────────────────────────────────────────

function Autopsy({ unit }: { unit: NotesUnit }) {
  const p = asAutopsy(unit.payload);
  const wrong = wrongIndex(p);
  return (
    <>
      {p.problem_md && (
        <Panel tone="neutral" label="Problem">
          <UnitMd content={p.problem_md} />
        </Panel>
      )}
      <ol className="nx-u-working">
        {(p.working ?? []).map((line, i) => (
          <li key={i} className="nx-u-line" data-wrong={i === wrong ? 'true' : 'false'}>
            <span className="nx-u-line-no">{i + 1}</span>
            <UnitMd content={line} />
            {i === wrong && (
              <span className="nx-u-line-flag">
                <span aria-hidden>✗</span>
                <span className="nx-u-sr">This line is wrong</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      {p.why_md && (
        <Panel tone="wrong" label="Why it's wrong">
          <UnitMd content={p.why_md} />
        </Panel>
      )}
      {p.fix_md && (
        <Panel tone="answer" label="Fix">
          <UnitMd content={p.fix_md} />
        </Panel>
      )}
    </>
  );
}

// ── try ──────────────────────────────────────────────────────────────────────

function Try({ unit }: { unit: NotesUnit }) {
  const p = asTry(unit.payload);
  return (
    <>
      {p.problem_md && (
        <Panel tone="neutral" label="Try it">
          <Figure svg={p.figure_svg} />
          <UnitMd content={p.problem_md} />
          <FigureImgs unit={unit} slot="problem" />
        </Panel>
      )}
      {p.answer_md && (
        <details className="nx-u-reveal">
          <summary>Show answer</summary>
          <Panel tone="answer" label="Answer">
            <UnitMd content={p.answer_md} />
          </Panel>
        </details>
      )}
      {p.note_md && (
        <div className="nx-u-aside">
          <UnitMd content={p.note_md} />
        </div>
      )}
    </>
  );
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function Body({ unit }: { unit: NotesUnit }) {
  switch (unit.kind) {
    case 'core':
      return <Core unit={unit} />;
    case 'example':
      return <Example unit={unit} />;
    case 'check':
      return <Check unit={unit} />;
    case 'autopsy':
      return <Autopsy unit={unit} />;
    case 'try':
      return <Try unit={unit} />;
  }
}

function Unit({ unit, admin }: { unit: NotesUnit; admin: boolean }) {
  const title = simplifyTitle(unit.title, unit.kind);
  return (
    <article className="nx-u" data-kind={unit.kind}>
      {admin && (
        <BlockReview
          id={unit.id}
          flagged={unit.flagged}
          note={unit.reviewNote}
          fixedNote={unit.fixedNote}
        />
      )}
      <header className="nx-u-head">
        <span className="nx-u-kind">{KIND_DISPLAY[unit.kind]}</span>
        {title && <h3 className="nx-u-title">{title}</h3>}
      </header>
      <Body unit={unit} />
    </article>
  );
}

/**
 * Review mode only: one group of cards (a section's teaching blocks, or its
 * practice expander) becomes a hold-and-drag list — the ⠿ handle on each card,
 * the fixed-slots rule in lib/unit-reorder. Students get the children exactly
 * as rendered: ReorderUnits is never in their tree, so its chunk (dnd-kit) is
 * never sent to them. A lone card has nowhere to go, so it gets no handle.
 * The section's lead core is not in any group — a section IS its core's
 * position, so moving the core is a job for /admin/learn-review.
 */
function Sortable({
  admin,
  level,
  topic,
  units,
  children,
}: {
  admin: boolean;
  level: string;
  topic: string;
  units: NotesUnit[];
  children: ReactNode;
}) {
  if (!admin || units.length < 2) return <>{children}</>;
  return (
    <ReorderUnits level={level} topic={topic} units={units.map(u => ({ id: u.id, order: u.order }))}>
      {children}
    </ReorderUnits>
  );
}

/**
 * A topic's units, one <details> dropdown per section. The dropdown's label is
 * the section title — the question-form name from the style pass ("How do I
 * read off the turning point?"), which is the thing the student actually wants
 * — and opening it starts the explanation: the section's `core` unit first,
 * then the blocks that work the idea. Adrian, 2026-08-21: no "Key Concepts"
 * heading, no counts — a topic is a list of these, click one and read.
 *
 * With `admin`, every block grows a flag control and a ⠿ drag handle (see
 * Sortable above — `level`/`topic` are what the reorder write is keyed on); a
 * section holding a flagged block is forced open so the flag can't hide behind
 * a collapsed dropdown.
 */
export default function NotesUnits({
  sections,
  admin = false,
  level,
  topic,
}: {
  sections: UnitSection[];
  admin?: boolean;
  level: string;
  topic: string;
}) {
  return (
    <div className="not-prose nx-acc-list">
      {sections.map(section => {
        const { teaching, practice } = partitionPractice(section.units);
        const flaggedInside =
          admin && (section.lead?.flagged || section.units.some(u => u.flagged));
        return (
          <details
            key={section.id}
            id={section.id}
            className="nx-acc"
            open={flaggedInside ? true : undefined}
          >
            <summary>
              <h2 className="nx-acc-title">{section.title}</h2>
              <span className="nx-timechip">⏱ {readingMinutes(section)} min</span>
            </summary>
            <div className="nx-acc-body">
              {section.lead && (
                <div className="nx-u-intro">
                  {admin && (
                    <BlockReview
                      inline
                      id={section.lead.id}
                      flagged={section.lead.flagged}
                      note={section.lead.reviewNote}
                      fixedNote={section.lead.fixedNote}
                    />
                  )}
                  <Core unit={section.lead} />
                </div>
              )}
              <Sortable admin={admin} level={level} topic={topic} units={teaching}>
                {teaching.map(unit => (
                  <Unit key={unit.id} unit={unit} admin={admin} />
                ))}
              </Sortable>
              {practice.length > 0 && (
                // Nested expander stays: even inside an open concept, doing
                // questions is opt-in. Forced open for Adrian when one of them
                // is flagged — a flag hidden in a collapsed expander is lost.
                <details
                  className="nx-practice"
                  open={admin && practice.some(u => u.flagged) ? true : undefined}
                >
                  <summary>
                    💪 Practice — {practice.length} question{practice.length === 1 ? '' : 's'}
                  </summary>
                  <Sortable admin={admin} level={level} topic={topic} units={practice}>
                    {practice.map(unit => (
                      <Unit key={unit.id} unit={unit} admin={admin} />
                    ))}
                  </Sortable>
                </details>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
