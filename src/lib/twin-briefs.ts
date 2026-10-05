// Cloud twins — the briefs the doors hand a cloud session (5 Oct 2026). Pure text builders.
// The wording is the local scripts' (scripts/twins/twin.mjs `brief` + `check`,
// scripts/science-twins/sci-twin.mjs `brief` + `check`) with two changes for the cloud:
// files are "in your run folder" (no Mac paths), and a figure's spec language comes from
// the door `GET /api/agent/twins/figure?doc=<family>` instead of `figure.mjs --doc`.
// Keep the two in step: a rule changed there is changed here.
import {
  flatParts, mathQuestionText, sciQuestionText, keyOf, type MathPlan, type MathTwinDraft, type MathPart, type SciTwinDraft, type SciKey,
} from './twin-gates';

export const FIGURE_DOOR = 'curl -s -H "Authorization: Bearer $AGENT_TOKEN_TWINS" "https://www.adrianmathtuition.com/api/agent/twins/figure?doc=<family>"';

const SHAPE: Record<string, { subject: string; code: string; tag: string }> = {
  EM: { subject: 'Elementary Mathematics', code: '4052', tag: 'E Math' },
  AM: { subject: 'Additional Mathematics', code: '4049', tag: 'A Math' },
  S3_EM: { subject: 'Elementary Mathematics (Sec 3)', code: '4052', tag: 'S3 E Math' },
  S3_AM: { subject: 'Additional Mathematics (Sec 3)', code: '4049', tag: 'S3 A Math' },
  S1: { subject: 'Mathematics (Sec 1)', code: 'Sec 1', tag: 'Sec 1' },
  S2: { subject: 'Mathematics (Sec 2)', code: 'Sec 2', tag: 'Sec 2' },
  JC1: { subject: 'H2 Mathematics (JC 1)', code: '9758', tag: 'JC1' },
  JC2: { subject: 'H2 Mathematics', code: '9758', tag: 'JC2' },
};
export const shapeOf = (level: string) => SHAPE[level] ?? { subject: `Mathematics (${level})`, code: level, tag: level };
/** JC blind solves on Opus (Adrian, 30 Sep 2026); else Sonnet. */
export const mathModels = (level: string) => ({ author: 'opus', blind: /^JC/.test(level) ? 'opus' : 'sonnet', moderate: 'opus', figure: 'opus' });

type Knowledge = { kind: string; title?: string | null; body: string };
export type MathSeed = { id: string; level: string; question_text: string | null; parts: MathPart[] | null; answer: string | null; solution: string | null; total_marks: number | null };

export function mathAuthorBrief(src: MathSeed, plan: MathPlan, knowledge: Knowledge[], avoid: { ref: string; text: string }[]): string {
  const shape = shapeOf(plan.level);
  const flat = flatParts(src.parts);
  const keyLines = flat.length ? flat.map((p) => `${p.label} [${p.marks}] → ${p.answer ?? '(no answer on file)'}`).join('\n') : `(single part, ${plan.marks} marks) → ${src.answer ?? '(no answer on file)'}`;
  const kText = knowledge.length ? knowledge.map((k) => `- (${k.kind}) ${k.title ?? ''} ${k.body}`.slice(0, 600)).join('\n') : '(none on file for these topics)';
  const structText = plan.structure.length
    ? plan.structure.map((p) => `(${p.label}) ${p.marks} marks${p.sub.length ? ` = ${p.sub.map((s) => `(${s.label}) ${s.marks}`).join(' + ')}` : ''}`).join('; ')
    : `single part, ${plan.marks} marks`;
  return `# Twin — ${shape.tag}, ${plan.marks} marks

Level: ${plan.level} (${shape.subject}, ${shape.code}). Difficulty: ${plan.difficulty}.
Topics (bank names, keep exactly): ${plan.topics.join(' | ')}
Sub-skill filing (the twin must test exactly these): ${plan.subgroups.map((s) => `${s.name}${s.is_primary ? ' (primary)' : ''}${s.description ? ` — ${s.description}` : ''}`).join('; ') || '(unfiled — test what the source tests)'}
Structure to reproduce exactly: ${structText}
Figure: ${plan.has_figure ? `the source HAS a diagram — the twin needs one too. Describe it in figure_description exactly (every given length/angle/label). It is drawn ONLY by the figure library from a typed spec: list the families with \`curl … /api/agent/twins/figure\`, read one family's spec language with ${FIGURE_DOOR}, and send the spec as figure_spec. No family fits = park this seed (say so), never a hand drawing.` : 'the source has no diagram; the twin must not need one either'}

## THE SOURCE QUESTION (read for its skill, structure and method — then write something else)
${mathQuestionText(src)}

Source answer key:
${keyLines}
${src.solution ? `\nSource solution (method only — your twin has its own numbers):\n${String(src.solution).slice(0, 3000)}` : ''}
${avoid.length ? `\n## Already in the bank — your twin must not read like any of these either\n${avoid.map((a, i) => `${i + 1}. [${a.ref}] ${a.text.slice(0, 500)}`).join('\n\n')}\n` : ''}
## Adrian's method notes for these topics (background — teach the same method, never quote these)
${kText}

## OUTPUT
Write ONE JSON file Q1.json in your run folder (no prose, no code fence):
{"stem": string, "parts": [{"label": "(a)", "text": string, "marks": int, "answer": string, "subparts": [{"label": "(i)", "text": string, "marks": int, "answer": string}]}], "answer": string, "total_marks": ${plan.marks}, "topics": ${JSON.stringify(plan.topics)}, "difficulty": "${plan.difficulty}", "needs_figure": ${plan.has_figure}, "figure_description": string, "solution": string, "method_note": "one line: the method the source teaches and how your twin teaches the same one", "originality_note": "one line: what is new — context, numbers, sentences"}
"parts" is [] for a single-part question (its final answer sits in "answer"). Labels and marks per part must match the structure above EXACTLY. The solution is one step a line and every part's working ends with a bold **Answer:** line. Never name a school, a year, a paper, or any computer program. Inside JSON strings every backslash is doubled (\\\\frac) and a newline is \\n.
`;
}

export function mathSolverBrief(level: string, marks: number, q: MathTwinDraft): string {
  const shape = shapeOf(level);
  const text = mathQuestionText(q);
  const shown = q.needs_figure && q.figure_description ? `${text}\n\n[The diagram, described in words — the printed question shows it as a figure: ${String(q.figure_description).trim()}]` : text;
  return `You are an expert ${shape.subject} (${shape.code}) examiner. Solve the question below completely and independently, exactly as the strongest candidate would. Work it fully in your reasoning, then return only final answers. Be exact where the question demands exact form; otherwise give 3 significant figures. For a "show that"/"prove"/"explain why" part answer "shown" only if you completed the argument and the target is true; if the target is false or the part cannot be done from the given information, say so in issues.
Write ONE JSON file Q1.blind.json: {"answers": {"<part label, e.g. (a) or (b)(ii), or 'single'>": "<final answer as a marker writes it>"}, "solvable": bool, "issues": ["specific ambiguity / missing information / false target / step that cannot be done — or empty"]}

# QUESTION (${marks} marks)

${shown}
`;
}

export function mathModeratorBrief(plan: MathPlan, q: MathTwinDraft, src: MathSeed): string {
  const shape = shapeOf(plan.level);
  const text = mathQuestionText(q);
  const shown = q.needs_figure && q.figure_description ? `${text}\n\n[The diagram, described in words: ${String(q.figure_description).trim()}]` : text;
  const flat = flatParts(q.parts);
  const key = flat.length ? flat.map((p) => `${p.label} [${p.marks}] ${p.answer}`).join('\n') : `single: ${q.answer}`;
  return `You are a SEAB moderator for ${shape.subject} (${shape.code}), and you are checking a TWIN: our own question written to teach the same sub-skill, with the same part structure and marks, as one school's question. Three jobs.

1. CHECK THE KEY. An independent examiner solved the twin blind (Q1.blind.json in the run folder). Compare part by part with the setter's key below. Two answers AGREE when mathematically equivalent or differing only in presentation (0.5 vs 1/2; 3\\sqrt{5} vs 6.71 to 3 s.f.; "shown" vs "proved"). They DISAGREE when a value, a sign, a root or an interval differs, or when the examiner reports the part cannot be done. Where they disagree, work the part yourself and say who is right.

2. IS IT A TWIN, NOT A COPY. Put the twin beside the source (below). It must test the same sub-skill by the same method with the same structure — and it must NOT be the source re-numbered: a new context or situation, new sentences, numbers that are not a constant offset or multiple of the source's. If a candidate who had just done the source would recognise the twin as "the same question with different numbers", set reads_as_source to true (the twin is then rejected).

3. JUDGE THE QUESTION. Could it sit in a school's paper at this level? Register (imperatives, precision demands, part labels, mark discipline), difficulty for the marks, syllabus scope, clarity, examination-clean numbers, and the solution reads in a teacher's voice with the method shown. Nothing in it names a school, a year, a paper or a computer program.
Scores: 5 = indistinguishable from a real question; 4 = real after a light edit; 3 = recognisably machine-made; 2 = wrong weight, scope or method; 1 = unusable.

Write ONE JSON file Q1.verdict.json: {"parts": [{"label": string, "agree": bool, "note": string}], "all_agree": bool, "key_verdict": "one sentence — who is right where they differ", "same_skill": bool, "same_method": bool, "reads_as_source": bool, "score": 1|2|3|4|5, "fixes": ["specific edits that would raise the score — empty at 5"], "why": "one or two sentences"}
Use exactly the setter's part labels in "parts" — the door checks every one.

# THE TWIN (${plan.marks} marks; sub-skill: ${plan.subgroups.map((s) => s.name).join('; ') || 'as the source'})

${shown}

## Setter's key
${key}

## Setter's solution
${q.solution ?? ''}

## Setter's notes
method: ${q.method_note ?? ''}
originality: ${q.originality_note ?? ''}

# THE SOURCE (${plan.marks} marks)

${mathQuestionText(src)}

Source key:
${flatParts(src.parts).map((p) => `${p.label} ${p.answer ?? ''}`).join('\n') || src.answer || ''}
`;
}

// ── science ─────────────────────────────────────────────────────────────────────────
const SCI_NAME: Record<SciKey, { name: string; code: string; cs: string }> = {
  PHY: { name: 'Physics', code: '6091', cs: 'CS_PHYS' },
  CHEM: { name: 'Chemistry', code: '6092', cs: 'CS_CHEM' },
  BIO: { name: 'Biology', code: '6093', cs: 'CS_BIO' },
};
export const syllabusOf = (key: SciKey, combined: boolean) => combined
  ? `Singapore-Cambridge GCE O-Level Combined Science (5086 / 5087 / 5088), the ${SCI_NAME[key].name} section — narrower than pure ${SCI_NAME[key].name}: test ONLY what the Combined Science ${SCI_NAME[key].name} syllabus covers`
  : `Singapore-Cambridge GCE O-Level ${SCI_NAME[key].name} (${SCI_NAME[key].code})`;

export type SciPlan = { key: SciKey; combined: boolean; topic: string; skill: string | null; subgroups: { id: number; name: string | null; description?: string | null }[]; seed_level: string | null; seed_reason: string | null; seed_has_image: boolean };
export type SciSeed = { id: string; question_text: string | null; answer: string | null; solution: string | null };

export function scienceAuthorBrief(src: SciSeed, plan: SciPlan, siblings: { question_text: string | null }[], avoid: { ref: string; text: string }[]): string {
  const syl = syllabusOf(plan.key, plan.combined);
  const skillLine = plan.subgroups.length ? plan.subgroups.map((s) => `${s.name}${s.description ? ` — ${s.description}` : ''}`).join('; ') : (plan.skill ?? '(no sub-skill filed — use the seed itself)');
  return `# Science twin — author brief

You write ONE new multiple-choice question for Singapore students: OUR OWN question for the
sub-skill below, modelled on the seed, at the seed's level (${plan.seed_level ? `**${plan.seed_level[0].toUpperCase()}${plan.seed_level.slice(1)}**` : 'the same demand as the seed'}).${plan.combined ? ' It is for **Combined Science** students: write it inside the Combined Science syllabus, even though the seed is from a pure-science paper.' : ''}
Write Q1.json in your run folder and stop.

## The seed (a school's question — never copy it)
- Syllabus: ${syl}
- Topic: **${plan.topic}**
- Sub-skill: **${skillLine}**
- The seed's level: ${plan.seed_level ?? 'unknown'}${plan.seed_reason ? ` (${plan.seed_reason})` : ''}
- The seed${plan.seed_has_image ? ' HAS A FIGURE (not shown; its question text describes enough to see the idea)' : ''}:

\`\`\`
${src.question_text ?? ''}
\`\`\`
Key: ${keyOf(src.answer) ?? src.answer ?? ''}
${src.solution ? `Its solution:\n\`\`\`\n${String(src.solution).slice(0, 1500)}\n\`\`\`` : ''}
${siblings.length ? `\n## Other questions of the same sub-skill (the range of the skill — do not copy these either)\n${siblings.map((s, i) => `${i + 1}. ${String(s.question_text ?? '').slice(0, 600)}`).join('\n\n')}\n` : ''}${avoid.length ? `\n## Already in the bank — do not read like these (our earlier twins and the nearest questions)\n${avoid.map((a, i) => `${i + 1}. [${a.ref}] ${a.text.slice(0, 500)}`).join('\n\n')}\n` : ''}
## What to write
- **Same sub-skill, same demand as the seed.** Core = one idea, most students get it; Exam = a
  typical exam step or two; Challenge = two or three ideas joined, a step most skip, or a trap.
  Match the seed's level — never easier. Not harder by obscure facts, long arithmetic or trick wording.
- **A NEW situation and new numbers.** A teacher holding both must NOT say "that is the seed with
  the numbers changed". Different object, setting, quantities, sentences and order of ideas.
  Syllabus phrasing that belongs to everyone ("Which statement is correct?") is fine.
- **Only ${syl} content.**${plan.key === 'PHY' ? ' Physics: NO equations of motion (no suvat, no v = u + at, no v² = u² + 2as) — kinematics is graphs, gradients, areas, average speed; NO momentum or impulse; NO circular motion; take g = 10 m/s² (or N/kg) and say so when it is used.' : ''}${plan.key === 'CHEM' ? ' Chemistry: relative atomic masses given in the stem when needed (e.g. "Aᵣ: C = 12, O = 16"); a gas volume 24 dm³ per mole at r.t.p. when used.' : ''}${plan.key === 'BIO' ? ' Biology: the syllabus facts and terms as the syllabus words them.' : ''}
- **Four options, exactly one defensible answer.** Every wrong option is a REAL mistake a student
  makes (a skipped step, a unit slip, a reversed idea, a common misconception) — not filler.
  Options of similar length and form. Numbers: plausible values, ascending order.
- **Plain words, one idea per sentence.** Units with every quantity. Chemical formulae with Unicode
  subscripts (H₂SO₄, CO₂, Fe²⁺). Maths in $…$ only where it helps ($\\frac{1}{2}$, $10^{-3}$).
- **No figure unless the question cannot stand without one.** If it needs one, it is drawn by the
  figure library from a typed spec (families: free-body-diagram, moments-lever, circuit-diagram,
  ray-diagram, speed-time, chem-apparatus, chem-graph, chem-energy-profile, chem-dot-cross,
  chem-electron-shells, chem-structure, measuring-instrument, function-graph, coordinate-plane):
  read the family's spec language first with
  ${FIGURE_DOOR}
  then write Q1.figure.json as ONE flat object \`{"family": "...", …the family's fields…}\` exactly as
  the doc's example shows. Never copy or describe the seed's figure. The stem must still read
  correctly with the figure beside it.
- **No family can draw it?** Then do NOT invent one and do NOT copy the seed's: set
  "needs_figure": true, leave Q1.figure.json out, and add
  "figure_need": {"what": "one plain line: the picture the question needs", "shape": "a short kebab-case name for that kind of picture, e.g. u-tube-manometer"}.
  The seed is set aside and the picture goes on the list of figure families to build.
- Never name a school, a year, an exam paper, a source, or any computer program in anything a
  student reads.

## The solution (house style — exactly this shape)
\`\`\`
**Key idea:** <the one idea the question turns on, one line>
<one step a line — a short sentence or one calculation each, units kept>
<…>
**Answer: B**
**Why not the others**
- **A:** <what is wrong with A>
- **C:** …
- **D:** …
\`\`\`
"Why not the others" may name the mistake that gives an option ONLY when that mistake reproduces
the option exactly (check the arithmetic). Otherwise just say why it is wrong.

## Q1.json — exactly this shape
\`\`\`json
{
  "stem": "the question text, WITHOUT the options",
  "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
  "answer": "B",
  "solution": "**Key idea:** …\\n…\\n**Answer: B**\\n**Why not the others**\\n- **A:** …\\n- **C:** …\\n- **D:** …",
  "distractors": { "A": "the mistake that gives A", "C": "…", "D": "…" },
  "why_level": "what makes it the level it is (the ideas joined, the step, the trap), one or two lines",
  "originality_note": "how it differs from the seed: situation, numbers, order of ideas",
  "needs_figure": false
}
\`\`\`
`;
}

export function scienceSolveBrief(plan: SciPlan, q: SciTwinDraft): string {
  return `# Blind solve

You are an expert examiner for ${syllabusOf(plan.key, plan.combined)}. Solve this multiple-choice question
yourself, exactly as the strongest candidate would, working it fully. You have NOT seen
the setter's key. Then write Q1.blind.json in the run folder:

\`\`\`json
{ "answer": "A|B|C|D", "confidence": 0.0-1.0, "working": "your working, one step a line",
  "other_defensible": ["any OTHER letter a strong candidate could defend, with why — or empty"],
  "issues": ["anything unclear, wrong or out of syllabus in the question — or empty"] }
\`\`\`
${q.needs_figure ? '\nThe question has a figure: open Q1.figure.png in the run folder with the Read tool and use it.\n' : ''}
## The question

${sciQuestionText(q)}
`;
}

export function scienceCheckBrief(plan: SciPlan, q: SciTwinDraft, src: SciSeed, nearest: { text: string; jaccard: number } | null): string {
  const syl = syllabusOf(plan.key, plan.combined);
  return `# Checker — one science twin

You are a senior ${syl} examiner checking OUR OWN practice MCQ (target level: ${plan.seed_level ?? "the seed's demand"}) before any student
sees it. Read this file, then the blind solver's answer in Q1.blind.json${q.needs_figure ? ' and the figure Q1.figure.png' : ''} (run folder).
Work the question yourself first. Then write Q1.verdict.json and stop.

## The twin
${sciQuestionText(q)}

Setter's key: **${q.answer}**

Setter's solution:
\`\`\`
${q.solution ?? ''}
\`\`\`
Setter's notes — distractors: ${JSON.stringify(q.distractors ?? {})}; why this level: ${q.why_level ?? q.why_challenge ?? '-'}

## What it is modelled on (the seed, a school's question)
Topic ${plan.topic} · sub-skill ${plan.subgroups.map((s) => s.name).join(', ') || plan.skill || '-'}
\`\`\`
${src.question_text ?? ''}
\`\`\`
Seed key: ${keyOf(src.answer)}

## The nearest bank question by wording (trigram Jaccard ${nearest?.jaccard ?? 0})
\`\`\`
${nearest ? nearest.text.slice(0, 1200) : '(none)'}
\`\`\`

## Judge every point (false on any = the twin is NOT published)
1. key_correct — your own answer equals the key; blind_agrees — the blind solver's letter equals it.
2. one_defensible_answer — no other option a strong candidate could defend (read the blind solver's "other_defensible").
3. in_syllabus — everything needed is in ${syl}.${plan.key === 'PHY' ? ' No equations of motion, no momentum, no circular motion.' : ''}
4. original — not the seed (or the nearest question) with numbers or nouns swapped: a new situation, new numbers, new sentences. reads_as_source = true if a teacher holding both would call it the same question.
5. same_skill — it exercises the seed's sub-skill.
6. level — rate the work as the estimator does: steps, ideas that must be joined, traps; work_score 1–5 (1–2 Core, 3 Exam, 4–5 Challenge). level_ok = ${plan.seed_level ? `its work score sits in the ${plan.seed_level} band (Core 1–2, Exam 3, Challenge 4–5) — or one band above, never below —` : 'it is at least as demanding as the seed'} AND any difficulty is for a good reason (not obscure, not trick wording, not long arithmetic).
7. distractors_real — each wrong option is a real student mistake.
8. house_style — **Key idea:**, one step a line, units kept, bold **Answer: X**, then **Why not the others** with one line per wrong option; plain short words.
9. why_not_honest — wherever "why not the others" says an option comes from a particular mistake, that mistake reproduces the option EXACTLY (check the arithmetic). A line that just says why it is wrong is fine.
10. student_safe — nothing names a school, a year, a paper or a computer program; the facts are right.

\`\`\`json
{ "key_correct": true, "blind_agrees": true, "one_defensible_answer": true, "in_syllabus": true,
  "original": true, "reads_as_source": false, "same_skill": true,
  "work_score": 3, "level_ok": true, "distractors_real": true, "house_style": true,
  "why_not_honest": true, "student_safe": true,
  "score": 1-5, "why": "one or two lines", "fixes": ["a concrete fix per failed point — or empty"] }
\`\`\`
`;
}
