// "Propose lesson" review sheet.
//
// Claude reads the current filtered bank candidates and proposes which questions (or
// PARTS of questions) become worked EXAMPLES (one per checklist concept, optional
// second when the method differs) and which become PRACTICE (coverage-first — the
// union must exercise every concept; gaps are flagged when the bank is thin).
//
// The teacher reviews here — tick/untick picks, adjust part checkboxes — then
// "Stage accepted": examples land in the staging Pool (as worked examples), practice
// in Keep (as practice), each pre-assigned to a section named after its concept.
// Unticked proposals are remembered (localStorage) and flagged on the next run.
'use client';

import { useMemo, useState } from 'react';
import type { BankQuestion } from './LessonBankPanel';
import { addToStaging, setPane, setKind, setSection, setConcept } from '@/lib/staging-store';

interface PickExample {
  question_id: string; concept: string; parts: string[] | null;
  rationale?: string; alt_method?: boolean; previously_rejected?: boolean;
}
interface PickPractice {
  question_id: string; concepts: string[]; parts: string[] | null; previously_rejected?: boolean;
}
export interface Proposal {
  concepts: string[];
  suggestedConcepts: string[];
  examples: PickExample[];
  practice: PickPractice[];
  gaps: Array<{ concept: string; note: string }>;
  meta?: {
    model?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    dropped_examples?: number;
    dropped_practice?: number;
    raw_practice_count?: number;
  };
}

const rejectedKey = (lessonKey: string) => `lesson_proposal_rejected:${lessonKey}`;
export function loadRejected(lessonKey: string): string[] {
  try { return JSON.parse(localStorage.getItem(rejectedKey(lessonKey)) ?? '[]'); } catch { return []; }
}
function saveRejected(lessonKey: string, ids: string[]) {
  try { localStorage.setItem(rejectedKey(lessonKey), JSON.stringify([...new Set(ids)])); } catch { /* ignore */ }
}

type PartLike = { label?: string; text?: string; marks?: number; subparts?: PartLike[] };

function partLabelsOf(q: BankQuestion): string[] {
  const out: string[] = [];
  for (const p of ((q.parts ?? []) as PartLike[])) {
    if (p?.label) out.push(p.label);
    for (const sp of (p?.subparts ?? [])) if (sp?.label && p?.label) out.push(`${p.label}.${sp.label}`);
  }
  return out;
}

/** A copy of the bank question keeping only the chosen part labels (and recomputed marks). */
function subsetQuestion(q: BankQuestion, picked: string[] | null): BankQuestion {
  if (!picked || picked.length === 0) return q;
  const keep = new Set(picked);
  const parts = ((q.parts ?? []) as PartLike[])
    .map(p => {
      if (!p?.label) return p;
      const subKeep = (p.subparts ?? []).filter(sp => sp?.label && keep.has(`${p.label}.${sp.label}`));
      if (keep.has(p.label)) return { ...p, subparts: p.subparts };  // whole part incl. subparts
      if (subKeep.length > 0) return { ...p, subparts: subKeep };    // only some subparts
      return null;
    })
    .filter(Boolean) as PartLike[];
  if (parts.length === 0) return q;
  const marksOf = (ps: PartLike[]): number => ps.reduce((acc, p) =>
    acc + (p.marks ?? 0) + marksOf(p.subparts ?? []), 0);
  const total = marksOf(parts);
  return { ...q, parts, total_marks: total > 0 ? total : q.total_marks } as BankQuestion;
}

function tagOf(q: BankQuestion): string {
  return `${q.school} ${q.year} P${q.paper} Q${q.question_number}`;
}

export function ProposalSheet({ proposal, candidates, lessonKey, onClose, onStaged }: {
  proposal: Proposal;
  candidates: BankQuestion[];
  lessonKey: string;
  onClose: () => void;
  onStaged: (n: number) => void;
}) {
  const byId = useMemo(() => new Map(candidates.map(q => [q.id, q])), [candidates]);
  // accepted state per pick (keyed by index within its list) + editable part selections
  const [exAccept, setExAccept] = useState<boolean[]>(() => proposal.examples.map(() => true));
  const [prAccept, setPrAccept] = useState<boolean[]>(() => proposal.practice.map(() => true));
  const [exParts, setExParts] = useState<(string[] | null)[]>(() => proposal.examples.map(p => p.parts));
  const [prParts, setPrParts] = useState<(string[] | null)[]>(() => proposal.practice.map(p => p.parts));

  // Coverage: which checklist concepts the currently-accepted practice covers.
  const coverage = useMemo(() => {
    const covered = new Set<string>();
    proposal.practice.forEach((p, i) => { if (prAccept[i]) p.concepts?.forEach(c => covered.add(c)); });
    return covered;
  }, [proposal.practice, prAccept]);
  const allConcepts = [...proposal.concepts, ...proposal.suggestedConcepts];

  function togglePart(list: 'ex' | 'pr', i: number, label: string, q: BankQuestion) {
    const [get, set] = list === 'ex' ? [exParts, setExParts] : [prParts, setPrParts];
    const cur = get[i] ?? partLabelsOf(q);            // null = whole question → expand
    const next = cur.includes(label) ? cur.filter(l => l !== label) : [...cur, label];
    const all = partLabelsOf(q);
    set(get.map((v, j) => j === i ? (next.length === all.length ? null : next) : v));
  }

  function stageAccepted() {
    let n = 0;
    const rejected: string[] = loadRejected(lessonKey);
    proposal.examples.forEach((p, i) => {
      const q = byId.get(p.question_id);
      if (!q) return;
      if (!exAccept[i]) { rejected.push(p.question_id); return; }
      const sq = subsetQuestion(q, exParts[i]);
      addToStaging(sq);
      setPane(sq.id, 'pool');
      setKind(sq.id, 'worked_example');
      setSection(sq.id, p.concept);
      setConcept(sq.id, p.concept);
      n++;
    });
    proposal.practice.forEach((p, i) => {
      const q = byId.get(p.question_id);
      if (!q) return;
      if (!prAccept[i]) { rejected.push(p.question_id); return; }
      const sq = subsetQuestion(q, prParts[i]);
      addToStaging(sq);
      setPane(sq.id, 'keep');
      setKind(sq.id, 'practice');
      setSection(sq.id, p.concepts?.[0] ?? 'Practice');
      if (p.concepts?.length) setConcept(sq.id, p.concepts.join(' · '));
      n++;
    });
    saveRejected(lessonKey, rejected);
    onStaged(n);
    onClose();
  }

  const renderPartBoxes = (list: 'ex' | 'pr', i: number, q: BankQuestion, picked: string[] | null) => {
    const all = partLabelsOf(q);
    if (all.length === 0) return null;
    const cur = picked ?? all;
    return (
      <span className="inline-flex flex-wrap gap-1 ml-2">
        {all.map(l => (
          <label key={l} className={`text-[10px] px-1 py-px rounded border cursor-pointer ${cur.includes(l) ? 'bg-blue-100 border-blue-400 text-blue-800' : 'border-slate-300 text-slate-400'}`}>
            <input type="checkbox" className="hidden" checked={cur.includes(l)} onChange={() => togglePart(list, i, l, q)} />
            ({l})
          </label>
        ))}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 p-5 text-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base">✨ Proposed lesson</h2>
          <span className="flex items-center gap-2">
            {proposal.meta?.model && (
              <span className="text-[10px] text-slate-400" title={`${proposal.meta.input_tokens ?? '?'} in / ${proposal.meta.output_tokens ?? '?'} out tokens`}>
                {proposal.meta.model.includes('fable') ? 'Fable' : 'Opus'}
              </span>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
          </span>
        </div>

        {/* Diagnostics: empty/dropped practice means the model misbehaved, not that no practice exists. */}
        {(proposal.practice.length === 0 || (proposal.meta?.dropped_practice ?? 0) > 0 || (proposal.meta?.dropped_examples ?? 0) > 0) && (
          <div className="mb-3 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
            {proposal.practice.length === 0 && (
              <div>⚠ The AI returned <b>no usable practice picks</b>
                {(proposal.meta?.raw_practice_count ?? 0) > 0
                  ? ` — it proposed ${proposal.meta?.raw_practice_count} but none matched real question ids (model error).`
                  : ' — the practice list came back empty.'} Re-run the proposal; this should be rare.
              </div>
            )}
            {(proposal.meta?.dropped_practice ?? 0) > 0 && proposal.practice.length > 0 && (
              <div>⚠ {proposal.meta?.dropped_practice} practice pick(s) referenced invalid question ids and were dropped.</div>
            )}
            {(proposal.meta?.dropped_examples ?? 0) > 0 && (
              <div>⚠ {proposal.meta?.dropped_examples} example pick(s) referenced invalid question ids and were dropped.</div>
            )}
          </div>
        )}

        {/* Concept coverage */}
        <div className="mb-3 p-2 bg-slate-50 border border-slate-200 rounded">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Concept coverage (practice)</div>
          <div className="flex flex-wrap gap-1">
            {allConcepts.map(c => (
              <span key={c} className={`text-[10px] px-1.5 py-px rounded border ${coverage.has(c) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-red-50 border-red-300 text-red-700'}`}>
                {coverage.has(c) ? '✓' : '✗'} {c}
                {proposal.suggestedConcepts.includes(c) && <em className="ml-1 text-violet-600">(new)</em>}
              </span>
            ))}
          </div>
          {proposal.gaps.length > 0 && (
            <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {proposal.gaps.map((g, i) => <div key={i}>⚠ <b>{g.concept}</b>: {g.note}</div>)}
            </div>
          )}
        </div>

        {/* Examples */}
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Examples → Pool (E) <span className="normal-case font-normal">— {exAccept.filter(Boolean).length} of {proposal.examples.length} accepted</span>
        </div>
        <div className="space-y-1.5 mb-4">
          {proposal.examples.map((p, i) => {
            const q = byId.get(p.question_id);
            if (!q) return null;
            return (
              <div key={i} className={`border rounded px-2 py-1.5 ${exAccept[i] ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 opacity-50'}`}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={exAccept[i]} onChange={() => setExAccept(a => a.map((v, j) => j === i ? !v : v))} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="font-mono text-xs font-medium">{tagOf(q)}</span>
                    <span className="ml-2 text-[10px] px-1.5 py-px bg-blue-100 text-blue-800 rounded">{p.concept}</span>
                    {p.alt_method && <span className="ml-1 text-[10px] px-1.5 py-px bg-violet-100 text-violet-700 rounded" title="Second example — different method">alt method</span>}
                    {p.previously_rejected && <span className="ml-1 text-[10px] px-1.5 py-px bg-amber-100 text-amber-700 rounded" title="You rejected this in an earlier run">rejected before</span>}
                    {renderPartBoxes('ex', i, q, exParts[i])}
                    {p.rationale && <div className="text-[11px] text-slate-500 italic mt-0.5">{p.rationale}</div>}
                  </span>
                </label>
              </div>
            );
          })}
        </div>

        {/* Practice */}
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Practice → Keep (P) <span className="normal-case font-normal">— {prAccept.filter(Boolean).length} of {proposal.practice.length} accepted</span>
        </div>
        <div className="space-y-1.5 mb-4">
          {proposal.practice.map((p, i) => {
            const q = byId.get(p.question_id);
            if (!q) return null;
            return (
              <div key={i} className={`border rounded px-2 py-1.5 ${prAccept[i] ? 'border-slate-200' : 'border-slate-200 opacity-50'}`}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={prAccept[i]} onChange={() => setPrAccept(a => a.map((v, j) => j === i ? !v : v))} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="font-mono text-xs font-medium">{tagOf(q)}</span>
                    {(p.concepts ?? []).map(c => <span key={c} className="ml-1 text-[10px] px-1.5 py-px bg-slate-100 text-slate-600 rounded">{c}</span>)}
                    {p.previously_rejected && <span className="ml-1 text-[10px] px-1.5 py-px bg-amber-100 text-amber-700 rounded">rejected before</span>}
                    {renderPartBoxes('pr', i, q, prParts[i])}
                  </span>
                </label>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-slate-300 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={stageAccepted}
            className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium"
          >Stage accepted ({exAccept.filter(Boolean).length + prAccept.filter(Boolean).length})</button>
        </div>
      </div>
    </div>
  );
}
