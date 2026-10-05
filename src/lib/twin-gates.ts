// Cloud twins — the deterministic gates (5 Oct 2026, Adrian: "yes" to letting claude.ai
// cloud sessions write twins, maths and science, WITHOUT the database master key reaching
// the cloud). The doors are /api/agent/twins/* (AGENT_TOKEN_TWINS, lib/agent-auth.ts); this
// file is everything they decide that is not a database read. Pure, no I/O — tested in
// twin-gates.test.ts.
//
// The rules are the SAME as the local scripts (scripts/twins/twin.mjs `check` + `publish`'s
// verdictOk, scripts/science-twins/sci-twin.mjs `gateQuestion` + `verdictOk`) — ported, not
// re-invented — plus what a door must add because it cannot trust the caller:
//   · the blind solver's answers are re-compared HERE (science: the letter must equal the key;
//     maths: every key part needs a blind answer, two plain numbers must agree to 3 s.f., and
//     the checker must mark every part agreed),
//   · maths text is screened for the words a student must never read (models, papers),
//   · a maths solution must carry the bold **Answer** line every twin in the bank has.
// SPEC-TWINS.md §4 (maths) and §11 (science) are the law; docs/CLOUD.md §Cloud twins the doors.

export const NOVELTY_MAX = 0.4;            // word-trigram Jaccard above this = a disguised copy (gce-paper's bar)
// maths: verified twins per sub-skill, in two STAGES (Adrian, 3 Oct 2026: "finish sec 1 and sec 2
// first (5 per subskill is for future)") — every level to 3 first, then 5. The Fly lane's
// TWINS_TARGETS="3 5" is the same list. TWINS_PER_SKILL is the stage counted by default.
export const TWIN_STAGES = [3, 5] as const;
export const TWINS_PER_SKILL = TWIN_STAGES[0];
export const SCI_PER_SKILL = 3;            // science: verified twins per (pool, sub-skill) at the seed's level (SPEC-TWINS §11, 5 Oct 2026)
export const TWIN_SCHOOL = 'AdrianMath';
export const TWIN_EXAM_TYPE = 'Twin';

// ── text helpers (identical to the scripts') ─────────────────────────────────────────
export type MathPart = { label?: string; text?: string; marks?: number; answer?: string; subparts?: MathPart[] };
export type MathQuestionLike = { stem?: string | null; question_text?: string | null; parts?: MathPart[] | null; total_marks?: number | null; answer?: string | null };

const normLabel = (l: unknown) => { const s = String(l ?? '').trim().replace(/^\(|\)$/g, ''); return s ? `(${s})` : ''; };
const bare = (l: unknown) => String(l ?? '').trim().replace(/^\(|\)$/g, '');

function partsText(parts: MathPart[] | null | undefined, depth = 0): string {
  const pad = '  '.repeat(depth);
  return (parts ?? []).map((p) => {
    const head = `${pad}${normLabel(p.label)} ${String(p.text ?? '').trim()} [${p.marks ?? '?'}]`;
    return p.subparts?.length ? `${head}\n${partsText(p.subparts, depth + 1)}` : head;
  }).join('\n');
}
export const mathQuestionText = (q: MathQuestionLike) =>
  [String(q.stem ?? q.question_text ?? '').trim(), partsText(q.parts)].filter(Boolean).join('\n');

export function sumMarks(q: MathQuestionLike): number {
  if (!q.parts?.length) return Number(q.total_marks) || 0;
  const s = (list: MathPart[]): number => list.reduce((a, p) => a + (p.subparts?.length ? s(p.subparts) : Number(p.marks) || 0), 0);
  return s(q.parts);
}

export function grams(text: string, n = 3): Set<string> {
  const toks = String(text).toLowerCase().replace(/\\[a-z]+/g, ' ').replace(/[${}^_()\[\]\\|,.;:!?'"“”‘’*]/g, ' ').split(/\s+/).filter(Boolean);
  const g = new Set<string>();
  for (let i = 0; i + n <= toks.length; i++) g.add(toks.slice(i, i + n).join(' '));
  return g;
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
/** the number-swap detector: digits masked, the sentences compared */
export const maskedMath = (t: string) => String(t).toLowerCase().replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
const maskedSci = (t: string) => String(t).toLowerCase().replace(/\d+(\.\d+)?/g, '#').replace(/[^a-z#]+/g, ' ').trim();

export type StructNode = { label: string; marks: number; sub: StructNode[] };
export type Structure = StructNode[];
export function structureOf(parts: MathPart[] | null | undefined): Structure {
  return (parts ?? []).map((p) => ({ label: bare(p.label), marks: Number(p.marks) || 0, sub: p.subparts?.length ? structureOf(p.subparts) : [] }));
}
export type FlatPart = { label: string; text: string; marks: number; answer?: string };
export function flatParts(parts: MathPart[] | null | undefined, prefix = ''): FlatPart[] {
  const out: FlatPart[] = [];
  for (const p of parts ?? []) {
    const label = `${prefix}${normLabel(p.label)}`;
    if (p.subparts?.length) out.push(...flatParts(p.subparts, label));
    else out.push({ label, text: String(p.text ?? ''), marks: Number(p.marks) || 0, answer: p.answer });
  }
  return out;
}

export type CorpusRow = { id: string; ref: string; text: string };
export type Novelty = { vs_source: number; nearest: string | null; nearest_id: string | null; nearest_jaccard: number; max: number; number_swap: boolean; same_options?: number };

function nearestOf(g: Set<string>, corpus: CorpusRow[]) {
  let nearest: string | null = null, nearestId: string | null = null, s = 0;
  for (const r of corpus) { const j = jaccard(g, grams(r.text)); if (j > s) { s = j; nearest = r.ref; nearestId = r.id; } }
  return { nearest, nearestId, s: Number(s.toFixed(3)) };
}

/** The k corpus rows closest to `text` by word-trigram Jaccard (for the author's "do not copy" list). */
export function closest(text: string, corpus: CorpusRow[], k = 5): (CorpusRow & { jaccard: number })[] {
  const g = grams(text);
  return corpus.map((r) => ({ ...r, jaccard: Number(jaccard(g, grams(r.text)).toFixed(3)) }))
    .sort((a, b) => b.jaccard - a.jaccard).slice(0, k);
}

// Nothing a student reads names a model, a school paper or a sitting (sci-twin's FORBIDDEN).
// Maths drops "secondary school" — a statistics question may honestly mention one.
const FORBIDDEN_COMMON = [/\bclaude\b/i, /\bopus\b/i, /\bsonnet\b/i, /\bgpt\b/i, /\bgemini\b/i, /\bchatbot\b/i, /\bA\.?I\.?[- ]generated\b/i, /\bprelim/i, /\bGCE\b/, /\bO[- ]Level paper\b/i, /\bTYS\b/, /\b(19|20)\d{2}\s+(paper|prelim|exam)/i];
export const FORBIDDEN_MATH = FORBIDDEN_COMMON;
export const FORBIDDEN_SCIENCE = [...FORBIDDEN_COMMON, /secondary school/i];

// ── maths ───────────────────────────────────────────────────────────────────────────
export type MathTwinDraft = MathQuestionLike & {
  topics?: string[]; difficulty?: string; needs_figure?: boolean; figure_description?: string;
  solution?: string; method_note?: string; originality_note?: string;
};
export type MathPlan = {
  source: string; level: string; marks: number; difficulty: string; topics: string[];
  subgroups: { id: number; name?: string | null; is_primary?: boolean; description?: string | null }[];
  structure: Structure; has_figure: boolean;
};

export type GateResult = { pass: boolean; problems: string[]; novelty: Novelty };

/** twin.mjs `check`, plus the door's extra screens. */
export function gateMathTwin(q: MathTwinDraft, ctx: { plan: MathPlan; srcText: string; corpus: CorpusRow[] }): GateResult {
  const { plan, srcText, corpus } = ctx;
  const problems: string[] = [];
  const text = mathQuestionText(q);
  const want = JSON.stringify(plan.structure), got = JSON.stringify(structureOf(q.parts));
  if (want !== got) problems.push(`structure differs: want ${want} got ${got}`);
  const marks = sumMarks(q);
  if (marks !== plan.marks) problems.push(`marks ${marks} ≠ ${plan.marks}`);
  if (Number(q.total_marks) !== plan.marks) problems.push(`total_marks ${q.total_marks} ≠ ${plan.marks}`);
  const flat = flatParts(q.parts);
  for (const p of flat) { if (!String(p.answer ?? '').trim()) problems.push(`${p.label} has no answer`); if (!p.text.trim()) problems.push(`${p.label} has no text`); }
  if (!flat.length && !String(q.answer ?? '').trim()) problems.push('single-part question has no answer');
  const sol = String(q.solution ?? '');
  if (sol.trim().length < 40) problems.push('solution missing or too short');
  else if (!/\*\*\s*Answer/i.test(sol)) problems.push('solution: no bold **Answer:** line (every twin in the bank ends its working with one)');
  if (sol.split('\n').some((l) => l.length > 400)) problems.push('solution: a line over 400 characters — one step a line');
  if (!String(q.stem ?? '').trim() && !flat.length) problems.push('empty question');
  const topics = Array.isArray(q.topics) ? q.topics : [];
  if (JSON.stringify([...topics].sort()) !== JSON.stringify([...(plan.topics ?? [])].sort())) problems.push(`topics ${JSON.stringify(topics)} ≠ source ${JSON.stringify(plan.topics ?? [])}`);
  if (plan.has_figure && !q.needs_figure) problems.push('source has a figure; twin says needs_figure=false');
  if (q.needs_figure && !String(q.figure_description ?? '').trim()) problems.push('needs_figure without figure_description');
  const everything = `${text}\n${sol}`;
  for (const re of FORBIDDEN_MATH) if (re.test(everything)) problems.push(`names something a student must never read (${re})`);
  const g = grams(text);
  const vsSource = Number(jaccard(g, grams(srcText)).toFixed(3));
  const n = nearestOf(g, corpus);
  if (vsSource > NOVELTY_MAX) problems.push(`too close to the source (trigram Jaccard ${vsSource} > ${NOVELTY_MAX})`);
  if (n.s > NOVELTY_MAX) problems.push(`too close to ${n.nearest} (trigram Jaccard ${n.s} > ${NOVELTY_MAX})`);
  const m = maskedMath(text);
  const numberSwap = m === maskedMath(srcText) || corpus.some((r) => maskedMath(r.text) === m);
  if (numberSwap) problems.push('number swap: with the numbers masked it is the source (or a bank question)');
  const srcLower = srcText.toLowerCase();
  for (const p of flat) { const t = p.text.trim().toLowerCase(); if (t.length > 25 && srcLower.includes(t)) problems.push(`${p.label} text appears verbatim in the source`); }
  const stem = String(q.stem ?? '').trim().toLowerCase();
  if (stem.length > 25 && srcLower.includes(stem)) problems.push('stem appears verbatim in the source');
  return { pass: problems.length === 0, problems, novelty: { vs_source: vsSource, nearest: n.nearest, nearest_id: n.nearestId, nearest_jaccard: n.s, max: NOVELTY_MAX, number_swap: numberSwap } };
}

export type MathVerdict = { parts?: { label?: string; agree?: boolean; note?: string }[]; all_agree?: boolean; key_verdict?: string; same_skill?: boolean; same_method?: boolean; reads_as_source?: boolean; score?: number; fixes?: string[]; why?: string };

/** twin.mjs publish's verdictOk. */
export function mathVerdictOk(v: MathVerdict | null | undefined): boolean {
  return !!v && v.all_agree === true && v.reads_as_source !== true && v.same_skill !== false && v.same_method !== false && Number(v.score) >= 4;
}

const labelKey = (l: unknown) => String(l ?? '').toLowerCase().replace(/[\s()]/g, '');
/** A plain decimal, maybe with a unit or "x =" in front — the only form compared by value. */
export function plainNumber(s: unknown): number | null {
  const t = String(s ?? '').replace(/\$/g, '').replace(/^\s*[a-z]\s*=\s*/i, '').replace(/,(?=\d{3}\b)/g, '').trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*(?:[a-z°%²³/\\ ]*)$/i.exec(t);
  return m ? Number(m[1]) : null;
}
const sig3 = (x: number) => (x === 0 ? 0 : Number(x.toPrecision(3)));

/**
 * The blind solver's answers against the setter's key, re-checked by the door:
 * every key part has a blind answer; where BOTH are plain numbers they agree to 3 s.f.;
 * and the checker marked every key part agreed. Exact forms (3√5 vs 6.71) are the
 * checker's call — the door cannot evaluate them, so it insists the checker covered them.
 */
export function mathBlindAgrees(flatKey: FlatPart[], singleAnswer: string | null | undefined, blind: Record<string, unknown> | null | undefined, verdict: MathVerdict | null | undefined): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const answers = new Map(Object.entries(blind ?? {}).map(([k, v]) => [labelKey(k), String(v ?? '')]));
  const vparts = new Map((verdict?.parts ?? []).map((p) => [labelKey(p.label), p]));
  const keys = flatKey.length ? flatKey.map((p) => ({ label: p.label, answer: String(p.answer ?? '') })) : [{ label: 'single', answer: String(singleAnswer ?? '') }];
  for (const k of keys) {
    const lk = labelKey(k.label);
    const b = answers.get(lk) ?? (keys.length === 1 ? (answers.get('single') ?? (answers.size === 1 ? [...answers.values()][0] : undefined)) : undefined);
    if (b == null || !b.trim()) { problems.push(`blind solver gave no answer for ${k.label}`); continue; }
    const kn = plainNumber(k.answer), bn = plainNumber(b);
    if (kn != null && bn != null && sig3(kn) !== sig3(bn)) problems.push(`${k.label}: key ${k.answer} but the blind solver got ${b}`);
    const vp = vparts.get(lk) ?? (keys.length === 1 ? (verdict?.parts ?? [])[0] : undefined);
    if (!vp || vp.agree !== true) problems.push(`${k.label}: the checker did not mark the blind answer as agreeing`);
  }
  return { ok: problems.length === 0, problems };
}

// ── science ─────────────────────────────────────────────────────────────────────────
export const LETTERS = ['A', 'B', 'C', 'D'] as const;
export type SciKey = 'PHY' | 'CHEM' | 'BIO';
export type SciTwinDraft = {
  stem?: string; options?: Partial<Record<'A' | 'B' | 'C' | 'D', string>>; answer?: string; solution?: string;
  distractors?: Record<string, string>; why_level?: string; why_challenge?: string; originality_note?: string; needs_figure?: boolean;
};

// Things the O-Level syllabi do not ask (Adrian, 5 Oct 2026: "physics: no suvat equations,
// no momentum, no circular motion") — sci-twin.mjs SCOPE_WORDS verbatim.
export const SCOPE_WORDS: Record<SciKey, RegExp[]> = {
  PHY: [/momentum/i, /impulse/i, /centripetal/i, /circular motion/i, /angular/i, /projectile/i, /\bsuvat\b/i,
    /v\s*=\s*u\s*\+\s*at/i, /v\s*(\^\s*2|²)\s*=\s*u\s*(\^\s*2|²)/i, /s\s*=\s*ut/i, /\bv\s*(\^\s*2|²)\s*=\s*2\s*g\s*h/i, /\bv\s*(\^\s*2|²)\s*=\s*2\s*a\s*s/i, /coefficient of friction/i, /\bμ\b/],
  CHEM: [/\bmolarity\b/i, /\bKc\b/, /equilibrium constant/i, /\bpH\s*=\s*-?\s*log/i, /enthalpy of formation/i, /hybridi[sz]ation/i],
  BIO: [/\bKrebs\b/i, /\bglycolysis\b/i, /\bATP synthase\b/i, /\bHardy[- ]Weinberg\b/i],
};

const normOpt = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();

/** Split a bank MCQ into its stem and A–D options (both stored forms: "A) x" and "A  x"). */
export function splitMcq(text: unknown): { stem: string; options: Record<string, string> } {
  const lines = String(text ?? '').split('\n');
  const opts: Record<string, string> = {}; const stem: string[] = [];
  let cur: string | null = null;
  for (const l of lines) {
    const m = /^\s*\(?([A-D])[).:]?\s+(.*)$/.exec(l);
    if (m && (m[1] === 'A' || cur)) { cur = m[1]; opts[cur] = m[2].trim(); continue; }
    if (cur && l.trim()) { opts[cur] += ` ${l.trim()}`; continue; }
    if (!cur) stem.push(l);
  }
  return { stem: stem.join('\n').trim(), options: opts };
}
export const keyOf = (answer: unknown) => { const m = /([A-D])/.exec(String(answer ?? '').replace(/^\s*\*\*\(?/, '')); return m ? m[1] : null; };
export function sciQuestionText(q: SciTwinDraft): string {
  return `${String(q.stem ?? '').trim()}\n\n${LETTERS.map((l) => `${l}) ${String(q.options?.[l] ?? '').trim()}`).join('\n')}`;
}

/** sci-twin.mjs gateQuestion, verbatim in rule. */
export function gateScienceTwin(q: SciTwinDraft, ctx: { srcText: string; corpus: CorpusRow[]; key: SciKey }): GateResult {
  const problems: string[] = [];
  const stem = String(q.stem ?? '').trim();
  if (stem.length < 30) problems.push('stem too short');
  if (/^\s*\(?[A-D][).]\s/m.test(stem)) problems.push('the stem carries option lines — options go in "options" only');
  for (const l of LETTERS) if (!String(q.options?.[l] ?? '').trim()) problems.push(`option ${l} is empty`);
  const normed = LETTERS.map((l) => normOpt(q.options?.[l]));
  if (new Set(normed).size < 4) problems.push('two options are the same');
  const ans = String(q.answer ?? '').trim().toUpperCase();
  if (!(LETTERS as readonly string[]).includes(ans)) problems.push('answer must be one letter A–D');
  const sol = String(q.solution ?? '');
  if (!/\*\*Key idea:\*\*/.test(sol)) problems.push('solution: no "**Key idea:**" line');
  const am = /\*\*Answer:\s*\(?([A-D])\)?\*\*/.exec(sol);
  if (!am) problems.push('solution: no "**Answer: X**" line');
  else if (am[1] !== ans) problems.push(`solution says Answer ${am[1]} but the key is ${ans}`);
  if (!/\*\*Why not the others\*\*/.test(sol)) problems.push('solution: no "**Why not the others**" heading');
  for (const l of LETTERS) {
    const bullet = new RegExp(`^\\s*-\\s*\\*\\*${l}:?\\*\\*`, 'm').test(sol);
    if (l !== ans && !bullet) problems.push(`solution: no "- **${l}:**" line under Why not the others`);
    if (l === ans && bullet) problems.push(`solution: the key ${l} is listed under Why not the others`);
  }
  const longLines = sol.split('\n').filter((l) => l.length > 260);
  if (longLines.length) problems.push(`solution: ${longLines.length} line(s) over 260 characters — one step a line`);
  const text = sciQuestionText(q);
  const everything = `${text}\n${sol}`;
  for (const re of FORBIDDEN_SCIENCE) if (re.test(everything)) problems.push(`names something a student must never read (${re})`);
  for (const re of SCOPE_WORDS[ctx.key] ?? []) if (re.test(everything)) problems.push(`out of the syllabus scope (${re})`);
  const g = grams(text);
  const vsSource = Number(jaccard(g, grams(ctx.srcText)).toFixed(3));
  const n = nearestOf(g, ctx.corpus);
  if (vsSource > NOVELTY_MAX) problems.push(`too close to the seed (trigram Jaccard ${vsSource} > ${NOVELTY_MAX})`);
  if (n.s > NOVELTY_MAX) problems.push(`too close to a bank question ${n.nearest} (trigram Jaccard ${n.s} > ${NOVELTY_MAX})`);
  const m = maskedSci(text);
  const numberSwap = m === maskedSci(ctx.srcText) || ctx.corpus.some((r) => maskedSci(r.text) === m);
  if (numberSwap) problems.push('number-swap: with the numbers masked it is the same as a bank question');
  const so = splitMcq(ctx.srcText).options;
  const sameOpts = LETTERS.filter((l) => so[l] && normed.includes(normOpt(so[l]))).length;
  if (sameOpts >= 3) problems.push(`${sameOpts} of the seed's options reappear — new options, please`);
  return { pass: problems.length === 0, problems, novelty: { vs_source: vsSource, nearest: n.nearest, nearest_id: n.nearestId, nearest_jaccard: n.s, max: NOVELTY_MAX, number_swap: numberSwap, same_options: sameOpts } };
}

export type SciVerdict = {
  key_correct?: boolean; blind_agrees?: boolean; one_defensible_answer?: boolean; in_syllabus?: boolean; original?: boolean;
  reads_as_source?: boolean; same_skill?: boolean; work_score?: number; level_ok?: boolean; is_challenge?: boolean; distractors_real?: boolean;
  house_style?: boolean; why_not_honest?: boolean; student_safe?: boolean; score?: number; why?: string; fixes?: string[];
};
/** sci-twin.mjs verdictOk: the blind LETTER equals the key and every checker point is true. */
export function scienceVerdictOk(v: SciVerdict | null | undefined, blindLetter: unknown, key: unknown): boolean {
  if (!v) return false;
  const letter = String(blindLetter ?? '').trim().toUpperCase();
  return !!letter && letter === String(key ?? '').trim().toUpperCase()
    && v.key_correct === true && v.blind_agrees === true && v.one_defensible_answer === true
    && v.in_syllabus === true && v.original === true && v.reads_as_source !== true && v.same_skill === true
    && Number(v.work_score) >= 1 && Number(v.work_score) <= 5 && (v.level_ok === true || v.is_challenge === true) && v.distractors_real === true
    && v.house_style === true && v.why_not_honest === true && v.student_safe === true && Number(v.score) >= 4;
}
/** The checker points that failed, in words, for the door's refusal. */
export function scienceVerdictFailures(v: SciVerdict | null | undefined, blindLetter: unknown, key: unknown): string[] {
  if (!v) return ['no checker verdict'];
  const out: string[] = [];
  const letter = String(blindLetter ?? '').trim().toUpperCase();
  if (!letter) out.push('no blind answer');
  else if (letter !== String(key ?? '').trim().toUpperCase()) out.push(`blind solver chose ${letter}, the key is ${key}`);
  for (const k of ['key_correct', 'blind_agrees', 'one_defensible_answer', 'in_syllabus', 'original', 'same_skill', 'distractors_real', 'house_style', 'why_not_honest', 'student_safe'] as const) if (v[k] !== true) out.push(`checker: ${k} is not true`);
  if (v.level_ok !== true && v.is_challenge !== true) out.push('checker: level_ok is not true (not at the seed\'s level)');
  if (v.reads_as_source === true) out.push('checker: reads_as_source');
  if (!(Number(v.work_score) >= 1 && Number(v.work_score) <= 5)) out.push(`checker: work_score ${v.work_score ?? '?'} is not 1–5`);
  if (!(Number(v.score) >= 4)) out.push(`checker: score ${v.score ?? '?'} < 4`);
  return out;
}
export function mathVerdictFailures(v: MathVerdict | null | undefined): string[] {
  if (!v) return ['no moderator verdict'];
  const out: string[] = [];
  if (v.all_agree !== true) out.push('moderator: all_agree is not true');
  if (v.reads_as_source === true) out.push('moderator: reads_as_source');
  if (v.same_skill === false) out.push('moderator: not the same skill');
  if (v.same_method === false) out.push('moderator: not the same method');
  if (!(Number(v.score) >= 4)) out.push(`moderator: score ${v.score ?? '?'} < 4`);
  return out;
}

// ── the submit body ─────────────────────────────────────────────────────────────────
export type Bank = 'maths' | 'science';
export type SubmitBody = {
  bank: Bank; seed_id: string; dry: boolean;
  math?: MathTwinDraft; sci?: SciTwinDraft;
  figure_spec: Record<string, unknown> | null;
  gate: { blind_answer: unknown; blind: Record<string, unknown> | null; checker: Record<string, unknown> | null; notes: string | null };
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BODY_CHARS = 60_000;

/**
 * Accepts the shapes a cloud session naturally sends:
 *   {bank, seed_id, question, options?, answer, solution, figure_spec?, gate_record, dry?}
 * where `question` is the author's whole Q1.json (an object) or just the stem (a string);
 * top-level options / answer / solution win over the ones inside it.
 */
export function parseSubmit(raw: unknown): { ok: true; value: SubmitBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'body must be a JSON object' };
  const b = raw as Record<string, unknown>;
  if (JSON.stringify(b).length > MAX_BODY_CHARS) return { ok: false, error: `body over ${MAX_BODY_CHARS} characters` };
  const bank = b.bank === 'maths' || b.bank === 'math' ? 'maths' : b.bank === 'science' ? 'science' : null;
  if (!bank) return { ok: false, error: 'bank must be "maths" or "science"' };
  const seed = String(b.seed_id ?? '');
  if (!UUID.test(seed)) return { ok: false, error: 'seed_id must be the seed question\'s uuid' };
  const q0: Record<string, unknown> | null = typeof b.question === 'string' ? { stem: b.question } : (b.question && typeof b.question === 'object' && !Array.isArray(b.question) ? { ...(b.question as Record<string, unknown>) } : null);
  if (!q0) return { ok: false, error: 'question is required (the author\'s Q1.json object, or the stem)' };
  for (const k of ['options', 'answer', 'solution'] as const) if (b[k] != null) q0[k] = b[k];
  const fig = b.figure_spec;
  if (fig != null && (typeof fig !== 'object' || Array.isArray(fig))) return { ok: false, error: 'figure_spec must be an object {family, …fields}' };
  const gr = (b.gate_record && typeof b.gate_record === 'object' && !Array.isArray(b.gate_record)) ? b.gate_record as Record<string, unknown> : {};
  const asObj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null);
  const gate = {
    blind_answer: gr.blind_answer ?? gr.blind_answers ?? asObj(gr.blind)?.answer ?? asObj(gr.blind)?.answers ?? null,
    blind: asObj(gr.blind),
    checker: asObj(gr.checker) ?? asObj(gr.verdict) ?? asObj(gr.checker_verdict),
    notes: gr.notes == null ? null : String(gr.notes).slice(0, 2000),
  };
  const value: SubmitBody = { bank, seed_id: seed, dry: b.dry === true, figure_spec: (fig as Record<string, unknown>) ?? null, gate };
  if (bank === 'maths') value.math = q0 as MathTwinDraft; else value.sci = q0 as SciTwinDraft;
  if (!value.dry && !gate.checker) return { ok: false, error: 'gate_record.checker (the checker / moderator verdict JSON) is required — send dry:true to run only the automatic gates' };
  if (!value.dry && gate.blind_answer == null) return { ok: false, error: 'gate_record.blind_answer is required (science: the letter; maths: {"(a)": "…", …})' };
  return { ok: true, value };
}

/** A figure spec in either shape → one flat {family, …fields} object (what the registry verifies). */
export function flatFigureSpec(spec: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!spec) return null;
  const inner = spec.spec;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return { ...(inner as Record<string, unknown>), family: spec.family ?? (inner as Record<string, unknown>).family };
  return { ...spec };
}

// ── the rate limit (per token, per rolling hour, counted from agent_actions) ──────────
export const RATE = { callsPerHour: 600, submitsPerHour: 120 };
export function rateDecision(used: { calls: number; submits: number }, isSubmit: boolean, limits = RATE): { allowed: boolean; reason?: string } {
  if (used.calls > limits.callsPerHour) return { allowed: false, reason: `over ${limits.callsPerHour} twin-door calls in the last hour — wait and retry` };
  if (isSubmit && used.submits > limits.submitsPerHour) return { allowed: false, reason: `over ${limits.submitsPerHour} submits in the last hour — wait and retry` };
  return { allowed: true };
}

// ── the maths queue order (twin.mjs queue, verbatim in rule) ─────────────────────────
export type TwinQueueRow = { source_id: string; level: string; subgroup_id: number | null; subgroup?: string | null; topic?: string | null; draws_90d: number; total_marks?: number | null; has_image?: boolean | null };
export function orderMathQueue(rows: TwinQueueRow[], have: Map<number, number>, opts: { per?: number; focus?: Set<number>; level: string; limit: number; focusOnly?: boolean }) {
  const per = opts.per ?? TWINS_PER_SKILL;
  const focus = opts.focus ?? new Set<number>();
  const buckets = new Map<number, { need: number; draws: number; rows: (TwinQueueRow & { need: number; have: number })[] }>();
  for (const r of rows) {
    if (r.subgroup_id == null) continue;
    const need = per - (have.get(r.subgroup_id) ?? 0);
    if (need <= 0) continue;
    if (!buckets.has(r.subgroup_id)) buckets.set(r.subgroup_id, { need, draws: 0, rows: [] });
    const b = buckets.get(r.subgroup_id)!; b.rows.push({ ...r, need, have: per - need }); b.draws += r.draws_90d;
  }
  const inBucket = (a: TwinQueueRow, b: TwinQueueRow) => (b.draws_90d - a.draws_90d) || ((a.level === opts.level ? 0 : 1) - (b.level === opts.level ? 0 : 1)) || String(a.source_id).localeCompare(String(b.source_id));
  for (const b of buckets.values()) b.rows.sort(inBucket);
  if (opts.focusOnly) for (const k of [...buckets.keys()]) if (!focus.has(k)) buckets.delete(k);
  const order = [...buckets.entries()].sort(([ka, a], [kb, b]) => (Number(focus.has(kb)) - Number(focus.has(ka))) || (b.draws - a.draws) || (b.need - a.need) || (b.rows.length - a.rows.length) || String(ka).localeCompare(String(kb)));
  const spread: (TwinQueueRow & { need: number; have: number; focus: boolean })[] = [];
  for (let round = 0; ; round++) { let any = false; for (const [k, b] of order) if (b.rows[round]) { spread.push({ ...b.rows[round], focus: focus.has(k) }); any = true; } if (!any) break; }
  // a sub-skill can take no more twins than it has seeds left (one twin per seed)
  return { picked: spread.slice(0, opts.limit), subskills: buckets.size, toWrite: [...buckets.values()].reduce((n, b) => n + Math.min(b.need, b.rows.length), 0) };
}

/** One row of the maths project's math_twin_units(levels, per_skill) — THE gap (migrations/math_twin_units.sql). */
export type MathTwinUnit = { subgroup_id: number; subgroup: string | null; topic: string | null; twins: number; need: number; free_seeds: number; writable: number; draws_90d: number };
/** Sub-skill → live verified twins, from the units (the `have` map orderMathQueue takes). */
export function haveFromUnits(units: MathTwinUnit[]): Map<number, number> {
  return new Map(units.map((u) => [Number(u.subgroup_id), Number(u.twins) || 0]));
}
/** The one summary every surface reports (door, twin.mjs, dashboard). Pure. */
export function mathGapSummary(units: MathTwinUnit[], per: number) {
  const short = units.filter((u) => Number(u.need) > 0);
  const blocked = short.filter((u) => Number(u.free_seeds) < Number(u.need));
  return {
    per_skill: per,
    subskills: units.length,
    full: units.length - short.length,
    short: short.length,
    to_write: short.reduce((n, u) => n + Number(u.writable), 0),
    // sub-skills that cannot reach `per` from the seeds left (every seed twinned, or too few seeds)
    blocked_subskills: blocked.length,
    blocked_twins: blocked.reduce((n, u) => n + Number(u.need) - Number(u.writable), 0),
  };
}

/** One seed per sub-skill per round (sci-twin.mjs queue's spread inside a topic). */
/** The level a twin with no seed level is filed at, from the checker's work score (the estimator's bands). */
export function levelFromWork(w: unknown): 'core' | 'exam' | 'challenge' {
  const n = Math.round(Number(w) || 3);
  return n <= 2 ? 'core' : n === 3 ? 'exam' : 'challenge';
}
/** One science twin per seed PER POOL: a pure twin keeps the old key, a Combined one carries its pool (= sci-twin.mjs twinItem). */
export function sciTwinItem(pool: string, seed: string): string {
  return String(pool).startsWith('CS_') ? `sci-twin-${pool}-${seed}` : `sci-twin-${seed}`;
}
export type SciUnit = { pool: string; sci_key: string; combined: boolean; subject: string; bank_level: string; topic: string; subgroup_id: number; subgroup: string; is_open: boolean; twins: number; need: number; seed_count: number; seeds: string[]; rnk: number };
/** The queue from science_twin_units rows (already in gap order): one seed per sub-skill a round, a sub-skill never past its need. Pure; = sci-twin.mjs queue. */
export function scienceQueueFromUnits(units: SciUnit[], limit: number, pool?: string | null): { source_id: string; pool: string; topic: string; subgroup_id: number; subgroup: string; is_open: boolean; twins: number; need: number }[] {
  const rows = units.filter((u) => u.need > 0 && (u.seeds ?? []).length && (!pool || u.pool === pool));
  const out: ReturnType<typeof scienceQueueFromUnits> = []; const used = new Set<string>();
  for (let round = 0; out.length < limit; round++) {
    let left = 0;
    for (const u of rows) {
      if (round >= u.need) continue;
      const sid = (u.seeds ?? [])[round];
      if (!sid) continue;
      left++;
      const k = `${u.pool}|${sid}`;
      if (out.length < limit && !used.has(k)) { out.push({ source_id: sid, pool: u.pool, topic: u.topic, subgroup_id: Number(u.subgroup_id), subgroup: u.subgroup, is_open: u.is_open, twins: u.twins, need: u.need }); used.add(k); }
    }
    if (!left) break;
  }
  return out;
}
export function spreadBySubgroup<T extends { subgroup_id: number | null; source_id: string }>(seeds: T[]): T[] {
  const bySg = new Map<string, T[]>();
  for (const s of seeds) { const k = s.subgroup_id != null ? String(s.subgroup_id) : `none-${s.source_id}`; if (!bySg.has(k)) bySg.set(k, []); bySg.get(k)!.push(s); }
  const spread: T[] = [];
  for (let round = 0; spread.length < seeds.length; round++) { let added = 0; for (const l of bySg.values()) if (l[round]) { spread.push(l[round]); added++; } if (!added) break; }
  return spread;
}

/** Interleave the per-topic seed lists, biggest gap first, a seed used once. */
export function interleaveTopics<T extends { source_id: string }>(lists: T[][], limit: number): T[] {
  const out: T[] = []; const used = new Set<string>();
  for (let i = 0; out.length < limit; i++) {
    let left = 0;
    for (const l of lists) { const s = l[i]; if (!s) continue; left++; if (out.length < limit && !used.has(s.source_id)) { out.push(s); used.add(s.source_id); } }
    if (!left) break;
  }
  return out;
}
