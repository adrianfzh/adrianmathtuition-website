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
import { FlagButton } from './ReviewControls';
import {
  asAutopsy,
  asCheck,
  asCore,
  asExample,
  asTry,
  KIND_DISPLAY,
  leadToBullets,
  readingMinutes,
  sanitiseFigure,
  stripKindPrefix,
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
              {step.label && <span className="nx-u-step-label">{step.label}</span>}
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
  const title = stripKindPrefix(unit.title, unit.kind);
  return (
    <article className="nx-u" data-kind={unit.kind} data-flagged={unit.flagged ? 'true' : 'false'}>
      {admin && unit.flagged && (
        <div className="nx-u-flagstrip">
          <span>⚑ Flagged — hidden from students until fixed</span>
          <FlagButton id={unit.id} flagged />
        </div>
      )}
      <header className="nx-u-head">
        <span className="nx-u-kind">{KIND_DISPLAY[unit.kind]}</span>
        <h3 className="nx-u-title">{title}</h3>
        {admin && !unit.flagged && <FlagButton id={unit.id} flagged={false} />}
      </header>
      <Body unit={unit} />
    </article>
  );
}

/**
 * A topic's units. The section's `core` unit is the heading and the opening
 * statement — its own body renders under the h2 rather than inside a card, so
 * the idea reads as the section's subject and the blocks under it read as work
 * on that idea. With `admin`, every block grows a flag control and flagged
 * blocks render with their warning strip; the student render has neither.
 */
export default function NotesUnits({
  sections,
  admin = false,
}: {
  sections: UnitSection[];
  admin?: boolean;
}) {
  return (
    <>
      {sections.map((section, i) => (
        <section key={section.id} className="nx-u-section">
          <p className="nx-kicker">
            Part {i + 1} of {sections.length}
          </p>
          <h2 id={section.id} className="nx-u-h">
            {section.title}
            <span className="nx-timechip">⏱ {readingMinutes(section)} min</span>
          </h2>
          <div className="nx-swoosh" aria-hidden />
          {section.lead && (
            <div className="nx-u-intro">
              {admin && section.lead.flagged && (
                <div className="nx-u-flagstrip">
                  <span>⚑ Flagged — hidden from students until fixed</span>
                  <FlagButton id={section.lead.id} flagged />
                </div>
              )}
              <Core unit={section.lead} />
              {admin && !section.lead.flagged && (
                <div className="nx-u-introflag">
                  <FlagButton id={section.lead.id} flagged={false} />
                </div>
              )}
            </div>
          )}
          {section.units.map(unit => (
            <Unit key={unit.id} unit={unit} admin={admin} />
          ))}
        </section>
      ))}
    </>
  );
}
