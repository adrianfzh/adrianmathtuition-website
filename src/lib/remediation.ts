// Targeted remediation loop — pure logic (SPEC-REMEDIATION.md).
//
// The loop: a released marked paper → per-part loss EVIDENCE → a classified,
// ordered fix-it PLAN (probe → learn → drill → prove) that Adrian approves
// before the student ever sees it. Each item carries its own material and its
// own clear-condition; clearing unlocks the next. Everything with marks or
// state arithmetic lives HERE and is unit-tested (repo policy) — routes and
// components only orchestrate.
//
// Classification of a lost mark (they need different medicine — the 30 Aug 2026
// diagnostic found ~29 marks of `blank` vs ~12 of `procedure` on one student's
// two papers):
//   blank      — not attempted / abandoned at the setup line → first-move drills
//   procedure  — a named rule misapplied → rule card + drill per micro-skill
//   discipline — conclusions/units/signs/"show that"/exact-form → checklist sets
//   concept    — the method itself wrong → worked-example sub-group + scaffold
//
// Deterministic signals decide what they can (not_attempted ⇒ blank; unit/sign/
// conclusion regexes ⇒ discipline); the model call groups the rest into named
// skills and picks procedure vs concept — its output goes through
// parsePlanDraft, which drops anything not grounded in the evidence, the same
// contract as revise-map's mapper.

export type LossClass = 'blank' | 'procedure' | 'discipline' | 'concept';
export type ItemKind = 'probe' | 'learn' | 'drill' | 'prove';
export type ItemState = 'locked' | 'open' | 'awaiting_marking' | 'cleared' | 'skipped';
export type PlanStatus = 'draft' | 'active' | 'done' | 'archived';

export type LossEvidence = {
  q: string;              // question number as marked, e.g. "13"
  part: string;           // part label, '' for whole
  awarded: number;
  max: number;
  notAttempted: boolean;
  errorSummary: string;   // '' when absent
  studyNote: string;      // '' when absent
  topic: string;          // marker's topic_detected, '' when absent
};

export type ClearRule =
  | { kind: 'full_marks' }                 // drill/prove: one attempt at full marks
  | { kind: 'min_frac'; frac: number }     // e.g. 0.8 of max
  | { kind: 'self_attest' }                // learn: student taps "Done reading"
  | { kind: 'submit_released' };           // worksheet proof: a released marked run

export type PlanItemDraft = {
  seq: number;
  kind: ItemKind;
  lossClass: LossClass;
  topic: string;
  bankTopic: string | null;                 // canonical topic for the QB candidates RPC, or null
  skill: string;                            // "∫1/(ax+b) keeps the 1/a"
  reminder: string;                         // the collapsed 💡 nudge above each drill question
  evidence: string[];                       // ["Q13(a)(ii)", …] — refs into LossEvidence
  clearRule: ClearRule;
};

// ---- evidence extraction ----------------------------------------------------

/** Below-max parts of one marking run's result_json, in paper order. */
export function extractLossEvidence(resultJson: unknown): LossEvidence[] {
  const rj = (resultJson ?? {}) as { results?: unknown };
  const results = Array.isArray(rj.results) ? rj.results : [];
  const out: LossEvidence[] = [];
  for (const r of results as Array<Record<string, unknown>>) {
    const q = String(r?.question_number ?? '').trim();
    if (!q) continue;
    const marking = (r?.marking ?? {}) as Record<string, unknown>;
    const parts = Array.isArray(marking.parts) ? marking.parts : [];
    const mo = (r?.marking_output ?? {}) as { meta?: { topic_detected?: unknown } };
    const topic = String(mo?.meta?.topic_detected ?? '').trim();
    for (const p of parts as Array<Record<string, unknown>>) {
      const awarded = Number(p?.awarded) || 0;
      const max = Number(p?.max) || 0;
      if (max <= 0 || awarded >= max) continue;
      out.push({
        q,
        part: String(p?.label ?? '').trim(),
        awarded,
        max,
        notAttempted: p?.not_attempted === true,
        errorSummary: String(p?.error_summary ?? '').trim(),
        studyNote: String(p?.study_note ?? '').trim(),
        topic,
      });
    }
  }
  return out;
}

export function evidenceRef(e: LossEvidence): string {
  return `Q${e.q}${e.part}`;
}

// ---- deterministic classification -------------------------------------------

const DISCIPLINE_RE = [
  /\bunits?\b/i,
  /\bcm[²³23]\b/i,
  /never (?:stated|wrote) the conclusion/i,
  /answer line left blank/i,
  /state (?:one|the) (?:condition|assumption|conclusion)/i,
  /"?show that"?/i,
  /\bsign\b/i,
  /divide both sides by\s*\$?-/i,
  /exact (?:value|form)/i,
  /\b3 ?s\.?f\.?\b/i,
  /rounded?\b/i,
];

/**
 * The deterministic half: `blank` and `discipline` can be read straight off the
 * marking fields; everything else returns null for the model to name.
 */
export function classifyLossDeterministic(e: LossEvidence): LossClass | null {
  if (e.notAttempted) return 'blank';
  const text = `${e.errorSummary} ${e.studyNote}`;
  if (/not attempted|nothing written|no working written|only .* copied/i.test(text)) return 'blank';
  if (DISCIPLINE_RE.some((re) => re.test(text))) return 'discipline';
  return null;
}

// ---- model draft: prompt + grounded parse -----------------------------------

/** The classification prompt for the remainder. One call per plan draft. */
export function buildDraftPrompt(evidence: LossEvidence[], preClassified: Map<string, LossClass>, bankTopics: string[] = []): string {
  const rows = evidence.map((e) => {
    const pre = preClassified.get(evidenceRef(e));
    return `${evidenceRef(e)} [${e.awarded}/${e.max}] topic="${e.topic}"${pre ? ` class=${pre} (fixed)` : ''}: ${e.errorSummary || (e.notAttempted ? 'not attempted' : 'lost marks')}`;
  });
  return `You are drafting a fix-it plan for a Singapore O-Level/JC math student from their marked paper.

Each line below is one part that lost marks (class=… (fixed) lines are already classified — keep that class):

${rows.join('\n')}

Group these into items covering EVERY line above — never drop a weakness because the list is long (Adrian, 30 Aug 2026: "it has to highlight all skills that need fixing"). The caller decides which items become this wave and which are shelved for later; your job is to name them all. Each item is ONE teachable skill (e.g. "integrate 1/(ax+b) with the 1/a factor", "write the first line of a trig identity proof"), never a whole topic. Classify each item:
- "blank": the student never wrote a first move — the medicine is first-move drills
- "procedure": a named rule misapplied — rule card + drill
- "discipline": conclusions/units/signs/rounding habits — checklist practice
- "concept": the method or strategy itself wrong — worked examples first

For each item ALSO pick "bank_topic": the closest topic from this canonical question-bank list (copied EXACTLY), or null if none fits:
${bankTopics.length ? bankTopics.join(' | ') : '(no list available — always null)'}

For each item ALSO write "reminder": 2-3 plain sentences the student reads right before every practice question of this item — state the rule or the exact first move (e.g. "Only 1/(ax+b)-type terms integrate to a logarithm — and the 1/a factor comes out front. Powers of x use the power rule, even negative powers."). Address the student directly; no question-specific spoilers.

Reply with ONLY this JSON (no prose, no fences):
{"items":[{"skill":"…","class":"blank|procedure|discipline|concept","topic":"…","bank_topic":"…"|null,"reminder":"…","evidence":["Q4","Q13(a)(ii)"],"why":"one sentence"}]}
Every "evidence" entry MUST be copied exactly from the refs above. Order items by marks recoverable, largest first.`;
}

const LOSS_CLASSES: LossClass[] = ['blank', 'procedure', 'discipline', 'concept'];
/** The WAVE cap — how many items a single sheet/plan teaches. */
export const MAX_PLAN_ITEMS = 6;
/** The DIAGNOSIS cap — everything named, wave or shelf. Only a runaway model hits this. */
export const MAX_DIAGNOSED_ITEMS = 24;

/**
 * Grounded parse of the model's draft: unknown evidence refs are dropped, an
 * item with no surviving evidence is dropped, classes outside the enum are
 * dropped, size is capped. Deterministic pre-classifications WIN over the
 * model's on conflict. Returns [] rather than throwing — a failed draft must
 * never block anything (the admin can re-draft).
 */
export function parsePlanDraft(
  modelText: string,
  evidence: LossEvidence[],
  preClassified: Map<string, LossClass>,
  bankTopics: string[] = [],
): PlanItemDraft[] {
  let parsed: unknown;
  try {
    const m = String(modelText ?? '').match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  } catch {
    return [];
  }
  const items = Array.isArray((parsed as { items?: unknown })?.items)
    ? ((parsed as { items: unknown[] }).items as Array<Record<string, unknown>>)
    : [];
  const known = new Set(evidence.map(evidenceRef));
  const byRef = new Map(evidence.map((e) => [evidenceRef(e), e]));
  const used = new Set<string>();
  const out: PlanItemDraft[] = [];
  for (const it of items) {
    // Cap the DIAGNOSIS generously, not at the wave size: an un-named weakness
    // can never be shelved, so it would be lost entirely.
    if (out.length >= MAX_DIAGNOSED_ITEMS) break;
    const skill = String(it?.skill ?? '').trim().slice(0, 160);
    if (!skill) continue;
    const refs = (Array.isArray(it?.evidence) ? it.evidence : [])
      .map((r) => String(r ?? '').trim())
      .filter((r) => known.has(r) && !used.has(r));
    if (!refs.length) continue;
    refs.forEach((r) => used.add(r));
    // The deterministic classification wins where it exists; refs with mixed
    // pre-classes take the first one (the model was told they are fixed).
    const pre = refs.map((r) => preClassified.get(r)).find(Boolean);
    const cls = pre ?? (LOSS_CLASSES.includes(it?.class as LossClass) ? (it!.class as LossClass) : null);
    if (!cls) continue;
    const topic = String(it?.topic ?? '').trim().slice(0, 80)
      || byRef.get(refs[0])!.topic || 'General';
    const bankTopicRaw = String(it?.bank_topic ?? '').trim();
    const bankTopic = bankTopics.includes(bankTopicRaw) ? bankTopicRaw : null;
    const reminder = String(it?.reminder ?? '').trim().slice(0, 600);
    out.push({
      seq: out.length + 1,
      kind: cls === 'blank' && refs.every((r) => byRef.get(r)!.awarded === 0 && byRef.get(r)!.notAttempted && !byRef.get(r)!.errorSummary)
        ? 'probe'
        : 'drill',
      lossClass: cls,
      topic,
      bankTopic,
      skill,
      reminder,
      evidence: refs,
      clearRule: defaultClearRule(cls),
    });
  }
  return out;
}

/**
 * Split a full diagnosis into the wave to teach now and the shelf for later.
 * Ranked by marks recoverable, largest first — a 10-mark blank outranks a
 * 1-mark slip — so the student's biggest bleed is always what gets taught this
 * round, and nothing named is ever silently dropped.
 */
export function splitWave(
  items: PlanItemDraft[],
  evidence: LossEvidence[],
  waveSize = MAX_PLAN_ITEMS,
): { wave: PlanItemDraft[]; shelved: PlanItemDraft[] } {
  const ranked = [...items].sort((a, b) => marksRecoverable(b, evidence) - marksRecoverable(a, evidence));
  const wave = ranked.slice(0, Math.max(1, waveSize)).map((it, i) => ({ ...it, seq: i + 1 }));
  const shelved = ranked.slice(Math.max(1, waveSize));
  return { wave, shelved };
}

export function defaultClearRule(cls: LossClass): ClearRule {
  // Drills prove the rule — full marks on one similar question. Blanks are
  // about writing line 1 at all; partial credit already proves the unlock.
  return cls === 'blank' ? { kind: 'min_frac', frac: 0.5 } : { kind: 'full_marks' };
}

/** Marks recoverable by an item — the review-screen sort key. */
export function marksRecoverable(item: Pick<PlanItemDraft, 'evidence'>, evidence: LossEvidence[]): number {
  const byRef = new Map(evidence.map((e) => [evidenceRef(e), e]));
  return item.evidence.reduce((s, r) => {
    const e = byRef.get(r);
    return s + (e ? e.max - e.awarded : 0);
  }, 0);
}

// ---- item state machine -----------------------------------------------------

export type PlanItemState = {
  id: string;
  seq: number;
  state: ItemState;
};

/**
 * Recompute lock states: the FIRST item (by seq) that is neither cleared nor
 * skipped is 'open' (or keeps 'awaiting_marking' — a submitted worksheet stays
 * visibly in flight); everything after it is 'locked'; cleared/skipped keep
 * their state. Pure — returns a new array.
 */
export function relockItems<T extends PlanItemState>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.seq - b.seq);
  let frontierPassed = false;
  const next = sorted.map((it) => {
    if (it.state === 'cleared' || it.state === 'skipped') return { ...it };
    if (!frontierPassed) {
      frontierPassed = true;
      return { ...it, state: it.state === 'awaiting_marking' ? 'awaiting_marking' : 'open' } as T;
    }
    return { ...it, state: 'locked' } as T;
  });
  return next;
}

/** Does an attempt clear this rule? */
export function attemptClears(rule: ClearRule, score: number, outOf: number): boolean {
  if (!(outOf > 0)) return false;
  switch (rule.kind) {
    case 'full_marks': return score >= outOf;
    case 'min_frac': return score / outOf >= rule.frac - 1e-9;
    default: return false; // self_attest / submit_released clear via their own actions
  }
}

/** The item the student should see first, or null when the plan is finished. */
export function nextOpenItem<T extends PlanItemState>(items: T[]): T | null {
  const sorted = [...items].sort((a, b) => a.seq - b.seq);
  return sorted.find((it) => it.state === 'open' || it.state === 'awaiting_marking') ?? null;
}

export function planDone(items: PlanItemState[]): boolean {
  return items.length > 0 && items.every((it) => it.state === 'cleared' || it.state === 'skipped');
}

// ---- the teaching brief -----------------------------------------------------

const CLASS_LABELS: Record<LossClass, string> = {
  blank: 'Blank / abandoned (no first move)',
  procedure: 'Procedure errors (named rules misapplied)',
  discipline: 'Answer discipline (conclusions, units, signs)',
  concept: 'Concept / strategy gaps',
};

/**
 * Deterministic teaching brief for Adrian — the draft screen's report_md.
 * Groups marks lost by class, then lists the plan items with their evidence.
 * Adrian's eyes only (never parent-facing); tone is working notes, not prose.
 */
export function buildReportMd(
  paperNames: string[],
  evidence: LossEvidence[],
  items: PlanItemDraft[],
): string {
  const byRef = new Map(evidence.map((e) => [evidenceRef(e), e]));
  const classTotals = new Map<LossClass, number>();
  for (const it of items) {
    classTotals.set(it.lossClass, (classTotals.get(it.lossClass) ?? 0) + marksRecoverable(it, evidence));
  }
  const lines: string[] = [];
  lines.push(`# Game plan — teaching brief`);
  lines.push('');
  lines.push(`Source: ${paperNames.join('; ') || 'marked paper'}. Marks lost below cite the marked questions; the plan is ordered by marks recoverable.`);
  lines.push('');
  lines.push('## Where the marks went');
  for (const cls of ['blank', 'procedure', 'discipline', 'concept'] as LossClass[]) {
    const n = classTotals.get(cls);
    if (n) lines.push(`- **${CLASS_LABELS[cls]}** — ~${n} marks`);
  }
  lines.push('');
  lines.push('## Plan items');
  for (const it of items) {
    const marks = marksRecoverable(it, evidence);
    lines.push(`${it.seq}. **${it.skill}** (${it.lossClass}, ~${marks} marks) — evidence: ${it.evidence.join(', ')}`);
    for (const ref of it.evidence) {
      const e = byRef.get(ref);
      if (e?.errorSummary) lines.push(`   - ${ref} [${e.awarded}/${e.max}]: ${e.errorSummary}`);
      else if (e?.notAttempted) lines.push(`   - ${ref} [${e.awarded}/${e.max}]: not attempted`);
    }
  }
  return lines.join('\n');
}
