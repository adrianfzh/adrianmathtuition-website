import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Embedded font (loaded once at module init, injected into every SVG) ───────

const CAVEAT_FONT_PATH = path.join(process.cwd(), 'src/assets/fonts/Caveat.ttf');
let _caveatBase64: string | null = null;

function getCaveatFontBase64(): string {
  if (_caveatBase64 === null) {
    try {
      _caveatBase64 = fs.readFileSync(CAVEAT_FONT_PATH).toString('base64');
    } catch {
      console.warn('[marking-pipeline] Caveat.ttf not found, text will use system fallback');
      _caveatBase64 = '';
    }
  }
  return _caveatBase64;
}

function buildSvg(width: number, height: number, content: string): string {
  const fontBase64 = getCaveatFontBase64();
  const fontDef = fontBase64
    ? `<defs><style type="text/css">@font-face{font-family:'Caveat';src:url('data:font/ttf;base64,${fontBase64}') format('truetype');font-weight:normal;font-style:normal;}</style></defs>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${fontDef}${content}</svg>`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnnotationResult {
  annotations: Array<{
    step: number;
    type: 'tick' | 'cross' | 'incomplete' | 'comment';
    text: string;
    bbox: { x1: number; y1: number; x2: number; y2: number };
  }>;
  overall: 'correct' | 'partial' | 'incorrect';
  score_text: string;
}

export interface MarkingOutput {
  question: { number: string; prompt: string; max_marks: number | null; has_diagram: boolean };
  correct: { final_answer: string; method_summary: string };
  lines: Array<{
    line_index: number;
    transcription_latex: string;
    transcription_plain: string;
    is_crossed_out: boolean;
    verdict: 'correct' | 'wrong' | 'neutral';
    error_type: string | null;
    correction: { arrow: string | null; text_latex: string; text_plain: string } | null;
  }>;
  student_final_answer: { value_raw: string; value_latex: string; matches_correct: boolean; had_self_correction: boolean };
  marks: { awarded: number; max: number; margin_note: string };
  summary: { title: string; body_markdown: string };
  uncertainty: { raised: boolean; notes: string[] };
  meta: { level_detected: string; topic_detected: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Marking prompt (verbatim port from bot ai/annotate.js) ───────────────────

export function buildMarkingPrompt(
  questionContext: string | null,
  studentLevel: string | null,
  questionLevel: 'JC' | 'SECONDARY' | 'unknown'
): string {
  const levelNote = studentLevel ? ` (${studentLevel} student)` : '';
  const contextSection = questionContext
    ? `\nQUESTION BEING ATTEMPTED:\n${questionContext}\n`
    : '';

  const syllabusLevel = questionLevel === 'JC' ? 'JC (A-Level H2 Math)'
    : questionLevel === 'SECONDARY' ? 'Secondary (O-Level A-Math/E-Math)'
    : 'Unknown';

  const syllabusRules = `
QUESTION LEVEL: ${syllabusLevel}

CRITICAL LEVEL RULES:
- ONLY explain using methods appropriate for the student's level.
- If this is a SECONDARY question:
  - Do NOT mention implicit differentiation, integration by parts, or any JC-only methods.
  - If the question requires differentiating an implicit equation, tell the student to rearrange and make y the subject first, then differentiate — do NOT suggest implicit differentiation.
  - Explain everything using chain rule, quotient rule, product rule (which ARE in A-Math syllabus).
  - Never say "you should use implicit differentiation" to a Secondary student.
- If this is a JC question:
  - JC methods (implicit differentiation, integration by parts, Maclaurin series, etc.) are expected and correct.
- If the level is unknown, default to explaining with simpler methods first.`;

  return `You are a Singapore math tutor marking a student's handwritten working${levelNote}.
${contextSection}${syllabusRules}

You will output ONLY a JSON object matching the schema described below. No prose, no markdown fences, no preamble. Just the raw JSON.

HOW TO MARK (follow these stages internally; they produce the JSON fields):

STAGE 1 — SOLVE INDEPENDENTLY (internal; fills the "correct" field)
- Read the question. Derive YOUR OWN correct final answer from scratch, before looking at student's work.
- When solving an equation, FACTORISE — never divide both sides by an expression
  containing the variable (÷tan²y, ÷x, ÷(x−1)): that silently discards the divided-out
  factor's roots. Enumerate EVERY root family in the stated domain (e.g. tan²y·sin⁴y =
  (1/16)tan²y on 0°≤y≤180° has tan y = 0 → y = 0°, 180° AS WELL AS sin⁴y = 1/16 →
  y = 30°, 150°) before comparing with the student's answers.
- If the question specifies rounding, apply it to your answer.
- Write a 1-sentence method summary describing the correct approach.

STAGE 2 — READ THE PAGE (fills "question" and "lines" fields)
- Identify the question number and max marks (from the [N] marks indicator if visible).
- Flag has_diagram=true if the question requires a diagram/graph/construction as part of the student's answer (not just has a printed diagram in the question).
- For each visible line of the student's handwritten working, create one entry in lines[]:
  - Transcribe the handwriting into LaTeX (use $ for inline math, $$ for display math). Keep math as math, not plain text.
  - Also provide a plain-text transcription (what the line says if read aloud).
  - Mark is_crossed_out=true if the line is visibly struck through.
  - Set verdict based on whether THAT step is correct (independent of student's final answer).
- Ignore any red-pen marks or teacher annotations on the page — those are background, not ground truth.

STAGE 3 — DIAGNOSE ERRORS (fills error_type and correction fields)
- For each line with verdict="wrong": identify the specific error type from the enumeration.
- ERROR CARRIED FORWARD (ECF) — the tutor's standard: after a wrong line, judge every
  subsequent line by whether the METHOD is valid given the student's (wrong) value.
  Valid follow-through gets verdict="correct" even though the numbers are off. Never
  penalize the same error twice.
- Correction style (match the tutor's red pen):
  - Small slip → correct the exact wrong token, minimally: "you mean ∠XOY", "should be 0.6".
    Do NOT re-derive the whole line for a one-token slip.
  - Missing setup → supply the missing opening line (e.g. "let the coordinates of D be (3, y)").
  - Method fundamentally wrong or irrelevant → say why it does not apply ("this property is
    not relevant in this question") and give the correct working compactly, WITH reasons.
  - Where an early error derails later work, the correction may show the corrected
    continuation so the student sees the true path.
- Each correction object needs BOTH text_latex AND text_plain:
  - text_latex: LaTeX version for the HTML renderer (e.g. "'49% taller' means larger $= 100 + 49 = 149$, so ratio should be $100 : 149$")
  - text_plain: Telegram-safe version using Unicode only, no backslashes, no dollar signs (e.g. "'49% taller' means larger = 149, so ratio should be 100 : 149")
- Arrow direction: "up" points to the line above (common for corrections below a wrong line), "down" points to the line below, "right" for inline, null if correction stands alone.

STAGE 3B — REASONS ARE LOAD-BEARING (geometry/proof/"show that" questions)
- In geometry, proof, congruency/similarity and "show that" questions, EVERY statement
  must carry its bracketed reason in Singapore convention: (∠s in same seg), (∠s in opp
  seg), (tan ⊥ rad), (∠ at centre is 2 times ∠ at circumference), (vert opp ∠s), (isos △),
  (∠ sum of △), (∠s on str. line), (sum of ∠s in quad is 360°), (tangents from ext pt),
  (ext ∠ of cyclic quad), (corr ∠s), (alt ∠s), (given), (proven in (a)), (common ∠),
  (midpt theorem / converse of midpt theorem), (AA/ASA/SAS/SSS/RHS).
- A true statement with a MISSING reason is an error: verdict="wrong",
  error_type the closest fit, correction = "state the reason: (…)" with the right reason.
  A true statement with a WRONG reason: correct the reason only. An IMPRECISE but
  essentially-correct reason (e.g. "sides of parallelogram" where the precise reason is
  "opp. sides of parallelogram") is tightened in passing: verdict stays "correct",
  no deduction — the tutor rewords it in red without penalty.
- BUT do not invent errors: a statement that carries a correct value AND a correct
  reason is simply correct — tick it. Reasons in equivalent wording count ("isos △" =
  "base ∠s of isosceles triangle"). Fully correct work with reasons gets FULL marks and
  an empty margin_note; when unsure whether a reason is even required for a pure
  computation step (not a proof claim), do not deduct.
- When the diagram is not visible to you, do NOT second-guess configuration-dependent
  reasons (e.g. "∠s in same seg", "isos △") whose numbers are consistent: judge the
  chain as written. Suspicion about an unseen configuration is not an error — only a
  numeric contradiction or a reason that cannot apply is.
- Collinearity at Secondary level is phrased "the points lie on a straight line" (Singapore
  O-level convention; "collinear" may follow in brackets). Establish it via AB + BC = AC
  (distances) or equal gradients — never by appearance.
- Citing something as (given) when it was proven — or asserting facts not established —
  is an error to flag. When the student restates givens and then asserts the conclusion
  without a derivation, the correction MUST use the tutor's phrasing "does not prove …"
  (e.g. "does not prove PQ = SR") and supply the missing chain. When the student applies
  a property/method that does not apply to the situation, the correction MUST say it is
  "not relevant in this question" before giving the right approach.
- Similarity/congruency: each matched pair needs its own justification and the final
  test must be named (AA, ASA, …).
- Extraneous roots must be explicitly rejected with cause ("x = −4 (rej), since x ≥ …");
  keeping an extraneous root is an error even when the other root is right.
- The mirror error — LOST roots: dividing both sides by an expression containing the
  variable discards that factor's roots. If any lie in the domain, the student's solution
  set is INCOMPLETE even though every listed answer checks out: mark the dividing line
  wrong, deduct the lost family's marks (typically −2 when a whole root family vanished),
  and the correction must say "don't divide by …, factorise" and list the missing
  answers ("you are missing these answers"). Found-family answers keep their marks.
- "Show that" answers must ARRIVE at the exact stated value, never assume it.

STAGE 4 — JUDGE THE FINAL ANSWER (fills "student_final_answer" and "marks" fields)
- The student's final committed answer is on the "Answer" line or in the most recent non-crossed-out working.
- had_self_correction = true if the student visibly crossed out an earlier attempt before the final.
- matches_correct = true iff student_final_answer.value_latex is mathematically equivalent to correct.final_answer.
- Mark awards — DEDUCTION model (the tutor writes "−n" in the margin, never fractions):
  - Start from max_marks and deduct for: wrong final value; each missing/wrong required
    reason (proof questions); unjustified logical leaps; an unrejected extraneous root;
    wrong units or precision on the answer line (3 s.f. default, degrees to 1 d.p.,
    respect any stated rounding).
  - SELF-CORRECTION COSTS NOTHING: a crossed-out attempt followed by correct work earns
    FULL marks. Crossed-out work is ignored except as context.
  - ECF: after one deduction for an error, correct follow-through method earns its marks.
    But ECF never restores full marks: matches_correct is judged against the TRUE correct
    answer (never against the ECF value), so a slip that makes the final value wrong
    costs at least 1 mark even when every later line is ECF-correct. Example: one
    mis-copied coefficient in an otherwise perfect 4-line solve of a [2]-mark part →
    margin_note "-1", NOT full marks.
  - SEVERITY DECISION TREE — for the originating error of a part, answer these IN ORDER
    and stop at the first match (the tutor's severity ordering; getting this wrong is
    the worst marking failure):
    Q1. Is every key claim true AND carrying its required reason? → full marks, empty
        margin_note. Computation lines that follow arithmetically from an
        already-reasoned claim need NO separate reason (after "∠OAB = ∠OBA (isos △)",
        the line "∠OAB = (180° − 126°)/2 = 27°" is just arithmetic — tick it). Do not
        invent missing-reason deductions in work a Singapore teacher would tick through.
        CLARITY COMMENTS ARE NOT DEDUCTIONS: when the mathematics is correct and the
        final answer is right but the setup is terse or under-explained, the tutor
        writes "needs clearer explanation" beside the question number and still awards
        FULL marks — put that feedback in the summary or uncertainty notes, keep
        margin_note empty, and keep the line verdicts "correct". Deduct only when a
        required step, reason, or value is wrong or absent — never merely because the
        explanation could be clearer.
        EXCEPTION — "explain why" questions, where the explanation IS the answer: full
        marks require the explicit chain — set up the target case (e.g. "let P = 5000")
        and DERIVE the impossibility or conclusion from it. True-but-unconnected facts
        ("the exponential can never be 0, therefore P can never reach 5000", with no
        substitution showing why reaching 5000 would force it to be 0) are inadequate:
        "does not adequately explain." — deduct (−1 on a [1] explain part) and the
        correction supplies the missing derivation ("need this part for a more complete
        explanation."). Vague claims that never name the mathematical reason earn
        nothing. This exception applies ONLY to explain/justify parts, never to
        computation parts with terse setup.
    Q2. Did the student cite a property/method whose premise does NOT exist in this
        configuration, or which yields a wrong value (e.g. "∠ at centre is 2 times ∠ at
        circumference" with no centre/circumference pair)? → CONCEPTUAL FORFEIT: every
        mark resting on that value is lost, INCLUDING later generic manipulations of it
        (subtracting from 2π, rearranging, etc. — they depend on it by construction, so
        ECF does NOT apply). Whole part rests on it → margin_note "-n" (all marks). The
        correction MUST contain "not relevant in this question"; the summary ends with
        "Let's discuss this in class and try again."
        Worked example of this shape: a [2]-mark part where line 1 derives a value by
        citing a property that does not fit this configuration, and line 2 validly
        manipulates that value (subtracts it from 2π, doubles it, etc.). BOTH marks are
        lost — margin_note "-2" — because line 2's mark rests entirely on line 1's
        value. Giving "-1" here (treating the citation as a mere wrong reason) is the
        inversion error: the value is wrong BECAUSE the property does not apply.
    Q3. Is the working only restating givens and/or asserting the required conclusion,
        with no new intermediate step? → "does not prove …": forfeit the part's marks,
        supply the missing chain with reasons.
    Q3a. On a "justify/show/prove/determine" question, does the conclusion rest on ONE
        pivotal classification (e.g. "ABCD is a triangle", "the points lie on a straight
        line", "AB is a diameter", "the triangle is right-angled") that the student
        ASSERTED rather than derived? Apply the appearance test: if the claim is
        something one could assert merely by LOOKING at the printed diagram (it looks
        collinear, looks like a diameter, looks right-angled) and no derivation is given,
        → forfeit ALL the part's marks — margin_note "-n" — even when auxiliary
        computations around it (lengths, angles, even a correct final number) are right:
        without the derived link those computations do not answer the question, so they
        retain NO marks (this outranks the Q4/Q5 leniency below). Reading a fact off the
        diagram is not a justification ("since the question didn't say, we should not
        assume"). The correction derives the missing link (e.g. AB + BC = 13.0 = AC, so
        A, B and C lie on a straight line, and the figure degenerates to a triangle).
        Contrast Q4: a claim that reflects genuine mathematical insight beyond the
        picture (e.g. identifying the centre as the midpoint of GO) keeps its insight
        mark and loses only the justification mark.
        MECHANICAL CHECK — when the question says "justify/justifying" and the student's
        conclusion NAMES a classification (a triangle, a diameter, a straight line, a
        right angle) that no line of working derives, margin_note is MINUS THE PART'S
        FULL [n] — on a [3] part "-3", never "-1" or "-2". Correct auxiliary
        computations (AC = 13, a length, an angle) do NOT soften this to a partial
        deduction: with the link underived they answer a different question, so they
        retain zero of this part's marks.
    Q3c. Is the working SELF-CONTRADICTORY — two mutually exclusive models or formulas
        used interchangeably in one argument (e.g. direct proportion A = ka and inverse
        A = k/a both applied to the same relationship)? → forfeit the part's marks
        (margin_note "-n") even when the final sentence states the right conclusion: a
        "show that" earns its marks only for ONE coherent argument, and a correct
        conclusion sitting on incoherent working proves nothing. The correction asks
        "which is it?", names the confusion ("there are 2 sets of workings that tell
        separate stories"), and presents the single valid chain.
    Q3b. Does the working stop before the asked-for quantity — correct preliminary
        manipulation, but the value/percentage/conclusion the question asked for never
        appears and NO final answer is committed for the part (answer line blank)? →
        UNFINISHED: forfeit the part's marks (margin_note "-n"); the correction completes
        the remaining steps to the answer. Correct-but-preliminary algebra does not earn
        the part's marks when the asked-for quantity never appears. (Distinct from a
        COMMITTED wrong final value, which deducts −1 under Q6 when the method is right.)
        MECHANICAL CHECK — both conditions hold ⇒ margin_note is MINUS THE PART'S FULL
        [n], never a partial −1/−2: (1) no committed final answer for the part, and
        (2) the asked-for quantity (the percentage, the value, the coordinates) appears
        nowhere in the working. Do NOT award marks for the correct preliminary lines:
        the tutor ticks those lines AND still writes the full-forfeit margin. On a [3]
        part this is "-3", not "-1" or "-2".
    Q4. Is there a TRUE intermediate insight (a correct claim beyond the givens and
        beyond the asked conclusion — e.g. correctly identifying the centre as the
        midpoint of GO) whose justification is missing/incomplete? → INCOMPLETE
        EXPLANATION, not a conceptual error: award the insight's mark, deduct ONLY the
        justification mark(s) (typically −1), supply the missing chain in the correction.
    Q5. Is a statement's value TRUE but its stated reason missing or mislabeled? → −1
        per required reason; correction states the right reason.
    Q5b. Did the student pick the WRONG TOOL for the configuration — sin where the two
        sides are both legs (tan), sine rule where cosine rule is needed, the wrong
        formula variant — while the tool itself is a real method that just doesn't fit
        these givens? → METHOD ERROR, harsher than a slip but narrower than Q2's
        forfeit: deduct the step's method mark AND every answer mark resting on the
        produced value (typically −2 when the wrong ratio feeds the final answer).
        Steps whose REASONING is independent of the wrong value (a correctly-cited
        angle transfer, an established right angle) keep their marks via ECF.
    Q6. Otherwise it is a SLIP (mis-copy, arithmetic, one wrong token) → −1, and ECF
        protects the later lines that follow through on it with valid method. (Evaluating
        a CORRECT expression wrongly is a slip; CHOOSING the wrong expression is Q5b.)
    The deep distinction: right idea poorly justified (Q4 — lenient, −1) versus wrong
    idea confidently applied (Q2 — harsh, full forfeit). Never invert this.
  - Notation the tutor would merely repair in passing (sloppy but recoverable, e.g.
    m₁(m₂) for M_AB × M_BC) is corrected but NOT deducted, unless it caused the error.
  - Never award below 0; a fundamentally wrong/irrelevant attempt on an [n]-mark part is
    typically −n (all marks) with the full correct working supplied in corrections.
- margin_note: e.g. "-1" if 1 mark lost, "-2" if 2 marks lost, empty string if full marks.

STAGE 5 — WRITE THE SUMMARY ("summary" field)
- title: "Well done!" if awarded==max, otherwise "Where you went wrong".
- body_markdown: 2-4 sentences explaining the key error in plain English, naming the concept, ending with a rule of thumb the student can remember. Use **bold** for the key concept name. Speak TO the student (use "you" and "your").
- For fully correct answers: congratulate specifically on what was well done, no rule-of-thumb needed.
- If the attempt shows a CONCEPTUAL gap (not a slip) — wrong method entirely, proof with
  no valid statements — end the summary with "Let's discuss this in class and try again."
  (the tutor defers re-teaching to class rather than writing a lecture).

STAGE 6 — UNCERTAINTY (optional)
- raised = true if you have a SPECIFIC concern: unclear handwriting, ambiguous interpretation, non-standard method that might be valid, close-call partial credit.
- notes: 1-3 short bullet points each describing one specific concern. Empty array if raised=false.

PLAIN-TEXT vs LATEX — STRICT RULES:

There are TWO types of transcription in this JSON:

A) LaTeX fields (transcription_latex, correction.text_latex):
   - For rendering to image later. Use standard LaTeX.
   - Inline math in single dollars: $7x$, $(x-5)^2$
   - Display math in double dollars: $$\\frac{7x}{(x-5)^2} - \\frac{1}{x-5}$$
   - Use \\frac, \\sqrt, \\times, \\approx, etc.

B) Plain-text fields (transcription_plain, correction.text_plain):
   - For Telegram message (no math rendering available).
   - NO backslashes. NO dollar signs. NO LaTeX commands.
   - Use Unicode math symbols directly: √ ² ³ ⁴ ⁵ ¹ ⁰ ½ ⅓ ⅔ ¼ ¾ ° ± × ÷ ≠ ≈ ≤ ≥ ≡ ∞ π θ
   - Fractions: write as "7x/(x-5)²" not "\\frac{7x}{(x-5)^2}".
   - Square roots: write as "√0.81" not "\\sqrt{0.81}" or "sqrt(0.81)".
   - Powers: use Unicode superscripts for integer exponents (² ³ ⁴); use ^ for non-integer/algebraic: "0.86^(2/3)", "x^(n+1)".
   - Parentheses only where mathematically needed — not for LaTeX grouping.

VOICE — SECOND PERSON:

ALL student-facing text MUST address the student directly using "you" and "your":
- transcription_plain: describe what the student wrote in second person.
  ✓ "You wrote the order as √0.81, 0.902, 399/441, 0.86^(2/3)"
  ✓ "You computed √0.81 = 0.9"
  ✗ "Student computed √0.81 = 0.9"  ✗ "The student's working shows..."
- correction.text_plain: tell the student what it should be, directly.
  ✓ "Should be 100 : 149, since the larger is 49% taller"
  ✗ "The correct ratio is 100 : 149"
- summary.body_markdown: use "you" and "your" (already required, continue as-is).
- Never refer to the student in third person anywhere in the JSON.

EXAMPLES:

  Q1 ordering error:
    transcription_latex: "$$\\\\sqrt{0.81},\\ 0.902,\\ \\\\frac{399}{441},\\ 0.86^{\\\\tfrac{2}{3}}$$"
    transcription_plain: "You wrote the order as √0.81, 0.902, 399/441, 0.86^(2/3)"
    correction.text_latex: "Should be $\\\\sqrt{0.81} < 0.86^{2/3} < \\\\frac{399}{441} < 0.902$"
    correction.text_plain: "Should be √0.81 < 0.86^(2/3) < 399/441 < 0.902"

  Q2 algebra:
    transcription_latex: "$$\\\\frac{7x}{(x-5)^2} - \\\\frac{1}{x-5}$$"
    transcription_plain: "You rewrote it as 7x/(x-5)² − 1/(x-5)"

  Q13a bottle ratio:
    transcription_latex: "$\\\\text{small} : \\\\text{larger} = 49 : 100$"
    transcription_plain: "You set up the ratio as small : larger = 49 : 100"
    correction.text_latex: "'49% taller' means larger $= 100 + 49 = 149$, ratio should be $100 : 149$"
    correction.text_plain: "'49% taller' means larger = 149, so ratio should be 100 : 149"

OUTPUT FORMAT (raw JSON, no fences):

{
  "question": { "number": "...", "prompt": "...", "max_marks": null, "has_diagram": false },
  "correct": { "final_answer": "...", "method_summary": "..." },
  "lines": [
    {
      "line_index": 1,
      "transcription_latex": "...",
      "transcription_plain": "...",
      "is_crossed_out": false,
      "verdict": "correct",
      "error_type": null,
      "correction": null
    },
    {
      "line_index": 2,
      "transcription_latex": "...",
      "transcription_plain": "...",
      "is_crossed_out": false,
      "verdict": "wrong",
      "error_type": "ratio_inversion",
      "correction": {
        "arrow": "up",
        "text_latex": "...",
        "text_plain": "..."
      }
    }
  ],
  "student_final_answer": { "value_raw": "...", "value_latex": "...", "matches_correct": false, "had_self_correction": false },
  "marks": { "awarded": 0, "max": 0, "margin_note": "" },
  "summary": { "title": "...", "body_markdown": "..." },
  "uncertainty": { "raised": false, "notes": [] },
  "meta": { "level_detected": "...", "topic_detected": "..." }
}

RULES:
- Output valid JSON only. No text before or after. No markdown fences.
- All strings must be valid JSON strings with escaped quotes and backslashes.
- For LaTeX inside JSON strings, double-escape backslashes: \\\\frac, \\\\times, etc.
- If a field doesn't apply, use null (for objects) or empty string/array (for strings/arrays) — don't omit fields.
- Keep lines[] concise: one entry per distinct handwritten line. Don't pad.
- If the page contains multiple sub-questions, mark only the ONE indicated by the caption/context. If ambiguous, mark the first one and note in uncertainty.
- verdict enum values: "correct" | "wrong" | "neutral"
- error_type enum values: null | "ratio_inversion" | "wrong_setup" | "sign_error" | "arithmetic_slip" | "wrong_formula" | "unit_error" | "incomplete" | "conceptual" | "other"
- correction.arrow enum values: "up" | "down" | "right" | null

===
FINAL OUTPUT FORMAT — READ CAREFULLY:

Respond with a single JSON object and nothing else. No prose before. No prose after. No markdown fences.

Your response must begin with the character { and end with the character }.

Do NOT start with phrases like "I need to analyze", "Let me think", "Here is the marking", "Looking at this question", or any other narration. Begin your response directly with {"question": ...}.

If you catch yourself about to write narration, stop and begin the JSON object immediately. All internal reasoning happens silently before you start writing.
===`;
}

// ── Structured JSON → human-readable text (port from bot ai/annotate.js) ─────

export function structuredMarkingToText(json: MarkingOutput): string {
  const out: string[] = [];

  const sanitize = (s: string | null | undefined): string => {
    if (!s) return '';
    return s
      .replace(/\$\$/g, '')
      .replace(/\$/g, '')
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\approx/g, '≈')
      .replace(/\\neq/g, '≠')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\pm/g, '±')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\left|\\right/g, '')
      .replace(/\\\\/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const correctLines = (json.lines || []).filter(l => l.verdict === 'correct' && !l.is_crossed_out);
  if (correctLines.length > 0) {
    out.push('✅ Correct steps:');
    correctLines.forEach((l, i) => { out.push(`${i + 1}. ${sanitize(l.transcription_plain)}`); });
    out.push('');
  }

  const firstWrong = (json.lines || []).find(l => l.verdict === 'wrong' && !l.is_crossed_out);
  if (firstWrong) {
    out.push(`❌ Error at step ${firstWrong.line_index}:`);
    out.push(`What you wrote: ${sanitize(firstWrong.transcription_plain)}`);
    const correctionStr = firstWrong.correction?.text_plain
      ? sanitize(firstWrong.correction.text_plain)
      : firstWrong.correction?.text_latex
        ? sanitize(firstWrong.correction.text_latex)
        : null;
    if (correctionStr) out.push(`What it should be: ${correctionStr}`);
    if (firstWrong.error_type) out.push(`Error type: ${firstWrong.error_type.replace(/_/g, ' ')}`);
    out.push('');
  }

  const awarded = json.marks?.awarded ?? 0;
  const max = json.marks?.max ?? 0;
  const marginNote = json.marks?.margin_note ? ` (${json.marks.margin_note})` : '';
  let marksLine = `📊 Method marks: ${awarded}/${max}${marginNote}`;
  if (json.student_final_answer?.had_self_correction && json.student_final_answer?.matches_correct && awarded < max) {
    marksLine += ' — partial credit for self-correction';
  } else if (max > 0 && awarded === max) {
    marksLine += ' — Full marks!';
  }
  out.push(marksLine);
  out.push('');

  if (json.summary?.body_markdown) {
    out.push(`💡 ${sanitize(json.summary.body_markdown)}`);
    out.push('');
  }

  if (json.uncertainty?.raised && json.uncertainty.notes?.length > 0) {
    out.push('🤔 Uncertainty:');
    json.uncertainty.notes.forEach(note => out.push(`• ${sanitize(note)}`));
  }

  return out.join('\n').trim();
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const is5xx =
        msg.includes('503') || msg.includes('429') ||
        msg.includes('500') || msg.includes('Service Unavailable');
      if (!is5xx || attempt === maxAttempts) throw err;
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      console.log(`[${label}] attempt ${attempt} failed (${msg}). Retrying in ${delayMs}ms.`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

async function withSonnetRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429') || msg.includes('rate_limit')) {
      console.log(`[${label}] rate limited, retrying in 3s`);
      await new Promise(r => setTimeout(r, 3000));
      return await fn();
    }
    throw err;
  }
}

// ── JSON extraction from Sonnet response ─────────────────────────────────────

function extractJsonFromSonnetResponse(text: string): unknown {
  // Strategy 1: raw parse (clean JSON)
  try { return JSON.parse(text); } catch { /* fall through */ }

  // Strategy 2: strip markdown fences (```json ... ``` or ``` ... ```)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }

  // Strategy 3: extract first { ... last } block
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch { /* fall through */ }
  }

  throw new Error('Could not extract valid JSON from Sonnet response');
}

// ── Narrative PNG renderer (KaTeX + Puppeteer, best-effort) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _narrativeBrowser: any = null;

async function getNarrativeBrowser(): Promise<unknown | null> {
  if (_narrativeBrowser) return _narrativeBrowser;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    if (process.env.VERCEL === '1') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chromium = await import('@sparticuz/chromium-min') as any;
      const executablePath = await chromium.default.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'
      );
      _narrativeBrowser = await puppeteer.launch({
        args: chromium.default.args,
        executablePath,
        headless: true,
      });
    } else {
      _narrativeBrowser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return _narrativeBrowser;
  } catch (err) {
    console.warn('[getNarrativeBrowser] launch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function renderNarrativeToPng(markdownText: string, targetWidth: number): Promise<Buffer | null> {
  const browser = await getNarrativeBrowser();
  if (!browser || !markdownText.trim()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await (browser as any).newPage();
  try {
    const vpWidth = Math.max(400, Math.round(targetWidth / 2));
    await page.setViewport({ width: vpWidth, height: 400, deviceScaleFactor: 2 });

    // Convert **bold** to <strong> (escape HTML first)
    const escaped = markdownText
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    const pageContent = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fffdf8;font-family:Georgia,serif}
.narrative{padding:14px 18px;font-size:14px;line-height:1.65;color:#374151;border-top:3px solid #1e3a5f}
strong{color:#1e3a5f}
</style></head><body>
<div class="narrative" id="n">${html}</div>
<script>
document.addEventListener('DOMContentLoaded',function(){
  renderMathInElement(document.getElementById('n'),{
    delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]
  });
  window.__katexDone=true;
});
</script></body></html>`;

    await page.setContent(pageContent, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.evaluate(() => new Promise<void>(resolve => {
      if ((window as unknown as Record<string, unknown>).__katexDone) return resolve();
      const iv = setInterval(() => {
        if ((window as unknown as Record<string, unknown>).__katexDone) { clearInterval(iv); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(iv); resolve(); }, 5000);
    }));

    const rect = await page.evaluate(() => {
      const el = document.querySelector('.narrative');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: 0, y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
    });

    if (!rect || rect.height < 10) return null;
    const shot = await page.screenshot({ type: 'png', clip: rect, omitBackground: false });
    return Buffer.from(shot);
  } catch (err) {
    console.warn('[renderNarrativeToPng] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Claude Sonnet marking call ────────────────────────────────────────────────

export async function callSonnetMarking(
  imageBase64: string,
  mediaType: string,
  systemPrompt: string
): Promise<MarkingOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const imageSource = {
    type: 'base64' as const,
    media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp',
    data: imageBase64,
  };

  const makeCall = (userText: string) =>
    withSonnetRetry(
      () => client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: imageSource },
              { type: 'text', text: userText },
            ],
          },
        ],
      }),
      'sonnet-marking'
    );

  // Attempt 1: standard prompt
  const response1 = await makeCall("Mark this student's handwritten working.");
  const text1 = response1.content[0].type === 'text' ? response1.content[0].text : '';
  try {
    return extractJsonFromSonnetResponse(text1) as MarkingOutput;
  } catch {
    console.warn('[callSonnetMarking] attempt 1: JSON parse failed. Raw response (500 chars):', text1.substring(0, 500));
  }

  // Attempt 2: correction prompt with explicit JSON instruction
  const response2 = await makeCall(
    'Your previous response was not valid JSON. Please respond ONLY with the JSON object matching the schema — no prose, no markdown fences, just raw JSON starting with { and ending with }.'
  );
  const text2 = response2.content[0].type === 'text' ? response2.content[0].text : '';
  try {
    return extractJsonFromSonnetResponse(text2) as MarkingOutput;
  } catch {
    console.error('[callSonnetMarking] attempt 2: JSON parse also failed. Raw response (500 chars):', text2.substring(0, 500));
    throw new Error('Failed to parse marking JSON after 2 attempts');
  }
}

// ── Gemini annotation bbox call (port from bot handlers/messages.js) ──────────

export async function callGeminiBboxAnnotations(
  base64Image: string,
  mediaType: string,
  markingJson: MarkingOutput,
  imageWidth: number,
  imageHeight: number
): Promise<AnnotationResult> {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-pro',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } as any,
  });

  const markingFeedback = structuredMarkingToText(markingJson);

  const prompt = `Here is the marking feedback for a student's handwritten math working:

${markingFeedback.substring(0, 1500)}

Task: Detect the 2D bounding boxes of each distinct line of the student's handwritten working that the feedback refers to.

Return a JSON object with this exact structure:
{
  "annotations": [
    {"step": 1, "type": "tick", "box_2d": [y_min, x_min, y_max, x_max], "text": ""},
    {"step": 2, "type": "cross", "box_2d": [y_min, x_min, y_max, x_max], "text": "short error label"}
  ],
  "overall": "correct",
  "score_text": "4/5"
}

Rules:
- Coordinates must be in normalized 0-1000 space, in the order [y_min, x_min, y_max, x_max].
- Count correct steps in the feedback → exactly that many "tick" annotations.
- Count errors in the feedback → exactly that many "cross" annotations, each with a short error label (max 25 chars).
- Bounding boxes must tightly enclose ONLY the student's handwritten working for that specific step — not printed question text, not blank space.
- One bbox per distinct line of handwriting.
- If the page has multiple sub-questions (e.g. Q1, Q2, Q3 stacked), ensure each annotation is around the correct sub-question's handwriting.
- If a step in the feedback can't be located on the image, omit it rather than guessing.
- overall: "correct" if all steps right, "partial" if some right some wrong, "incorrect" if none right.
- score_text: brief score summary from the feedback (e.g. "4/5"), empty string if no clear score.

Output only the JSON object. No markdown, no preamble.`;

  const result = await withGeminiRetry(
    () => model.generateContent([
      { inlineData: { mimeType: mediaType, data: base64Image } },
      prompt,
    ]),
    'gemini-bbox-annotations'
  );

  const responseText = result.response.text().trim();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

  const converted: AnnotationResult = {
    annotations: [],
    overall: parsed.overall || 'partial',
    score_text: parsed.score_text || '',
  };

  for (const ann of parsed.annotations || []) {
    const box = ann.box_2d;
    if (!Array.isArray(box) || box.length !== 4) continue;
    const [yMinNorm, xMinNorm, yMaxNorm, xMaxNorm] = box;
    converted.annotations.push({
      step: ann.step,
      type: ann.type,
      text: ann.text || '',
      bbox: {
        x1: Math.round((xMinNorm / 1000) * imageWidth),
        y1: Math.round((yMinNorm / 1000) * imageHeight),
        x2: Math.round((xMaxNorm / 1000) * imageWidth),
        y2: Math.round((yMaxNorm / 1000) * imageHeight),
      },
    });
  }

  if (!converted.annotations.length) throw new Error('Gemini returned zero valid annotations');
  return converted;
}

// ── Sharp SVG composite annotated image (port from bot ai/annotate.js) ────────

export async function createAnnotatedImage(
  base64Image: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _mediaType: string,
  annotations: AnnotationResult,
  narrative?: string
): Promise<Buffer | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sharpLib: any;
  try {
    sharpLib = (await import('sharp')).default ?? (await import('sharp'));
  } catch {
    console.warn('[createAnnotatedImage] sharp not available');
    return null;
  }

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const metadata = await sharpLib(imageBuffer).metadata();
    const { width = 800, height = 1000 } = metadata;

    const fontSize = Math.max(13, Math.min(17, height / 35));
    const pillHeight = Math.round(fontSize * 2.0);
    const pillRadius = pillHeight / 2;
    const font = 'Caveat,sans-serif';

    const svgParts: string[] = [];

    for (const ann of annotations.annotations) {
      const label = String(ann.step || '');
      const bbox = ann.bbox;
      let lineCenterY: number, annotationX: number;

      if (bbox && typeof bbox.x2 === 'number' && typeof bbox.y1 === 'number' && typeof bbox.y2 === 'number') {
        const x2 = Math.max(0, Math.min(bbox.x2, width));
        const y1 = Math.max(0, Math.min(bbox.y1, height));
        const y2 = Math.max(0, Math.min(bbox.y2, height));
        lineCenterY = Math.round((y1 + y2) / 2);
        annotationX = x2 + Math.round(width * 0.02);
      } else {
        continue;
      }

      if (ann.type === 'tick') {
        const pillWidth = Math.round(label.length * fontSize * 0.6 + fontSize * 1.2 + 14);
        const px = Math.min(annotationX, width - pillWidth - 10);
        const iconSize = Math.round(pillHeight * 0.72);
        const iconX = Math.round(px + pillWidth - iconSize - 3);
        const iconY = Math.round(lineCenterY - iconSize / 2);
        svgParts.push(
          `<rect x="${px + 1}" y="${lineCenterY - pillHeight / 2 + 1}" width="${pillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.15)"/>` +
          `<rect x="${px}" y="${lineCenterY - pillHeight / 2}" width="${pillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="#00c853" stroke="white" stroke-width="1.5"/>` +
          (label ? `<text x="${px + 8}" y="${lineCenterY + fontSize * 0.35}" font-size="${fontSize}" fill="white" font-family="${font}" font-weight="bold">${label}</text>` : '') +
          `<svg x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" overflow="visible">` +
          `<path d="M4,13 L9,18 L20,6" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
          `</svg>`
        );
      } else if (ann.type === 'cross') {
        const errorText = ann.text || '';
        const mainPillWidth = Math.round(label.length * fontSize * 0.6 + fontSize * 1.2 + 14);
        const px = Math.min(annotationX, width - mainPillWidth - 10);
        const iconSize = Math.round(pillHeight * 0.62);
        const iconX = Math.round(px + mainPillWidth - iconSize - 3);
        const iconY = Math.round(lineCenterY - iconSize / 2);
        svgParts.push(
          `<rect x="${px + 1}" y="${lineCenterY - pillHeight / 2 + 1}" width="${mainPillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.15)"/>` +
          `<rect x="${px}" y="${lineCenterY - pillHeight / 2}" width="${mainPillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="#ff1744" stroke="white" stroke-width="1.5"/>` +
          (label ? `<text x="${px + 8}" y="${lineCenterY + fontSize * 0.35}" font-size="${fontSize}" fill="white" font-family="${font}" font-weight="bold">${label}</text>` : '') +
          `<svg x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" overflow="visible">` +
          `<line x1="7" y1="7" x2="17" y2="17" stroke="white" stroke-width="3" stroke-linecap="round"/>` +
          `<line x1="17" y1="7" x2="7" y2="17" stroke="white" stroke-width="3" stroke-linecap="round"/>` +
          `</svg>`
        );
        if (errorText) {
          const errorPillX = px + mainPillWidth + 4;
          const errorPillW = Math.min(Math.round(errorText.length * fontSize * 0.45 + 12), Math.round(width * 0.3));
          if (errorPillX + errorPillW < width - 4) {
            svgParts.push(
              `<rect x="${errorPillX}" y="${lineCenterY - pillHeight / 2}" width="${errorPillW}" height="${pillHeight}" rx="${pillRadius}" fill="#ff1744" opacity="0.9"/>` +
              `<text x="${errorPillX + errorPillW / 2}" y="${lineCenterY + fontSize * 0.3}" font-size="${fontSize * 0.75}" fill="white" font-family="${font}" font-weight="bold" text-anchor="middle">${escapeXml(errorText.substring(0, 25))}</text>`
            );
          }
        }
      } else if (ann.type === 'incomplete') {
        const incompleteY = (bbox && typeof bbox.y2 === 'number') ? Math.round(Math.max(0, Math.min(bbox.y2, height))) : lineCenterY;
        const labelText = escapeXml(ann.text || 'Incomplete');
        const triW = fontSize;
        const pillW = Math.min(Math.round(labelText.length * fontSize * 0.55 + triW + 20), Math.round(width * 0.5));
        const ipx = Math.round(width / 2 - pillW / 2);
        const triCx = ipx + 8 + triW / 2;
        svgParts.push(
          `<line x1="0" y1="${incompleteY}" x2="${width}" y2="${incompleteY}" stroke="#ff6d00" stroke-width="2.5" stroke-dasharray="10,6" opacity="0.8"/>` +
          `<rect x="${ipx + 1}" y="${incompleteY - pillHeight / 2 + 1}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.2)"/>` +
          `<rect x="${ipx}" y="${incompleteY - pillHeight / 2}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="#ff6d00" stroke="white" stroke-width="1.5"/>` +
          `<polygon points="${triCx},${incompleteY - triW * 0.45} ${triCx - triW * 0.5},${incompleteY + triW * 0.35} ${triCx + triW * 0.5},${incompleteY + triW * 0.35}" fill="white" opacity="0.9"/>` +
          `<text x="${ipx + triW + 14}" y="${incompleteY + fontSize * 0.35}" font-size="${fontSize * 0.85}" fill="white" font-family="${font}" font-weight="bold">${labelText}</text>`
        );
      } else if (ann.type === 'comment') {
        const commentText = escapeXml((ann.text || '').substring(0, 25));
        const textContent = [label, commentText].filter(Boolean).join(' ');
        const pillW = Math.min(Math.round(textContent.length * fontSize * 0.55 + 20), Math.round(width * 0.38));
        const px = Math.min(annotationX, width - pillW - 10);
        svgParts.push(
          `<rect x="${px + 1}" y="${lineCenterY - pillHeight / 2 + 1}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.2)"/>` +
          `<rect x="${px}" y="${lineCenterY - pillHeight / 2}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="#2979ff" stroke="white" stroke-width="1.5"/>` +
          `<text x="${px + 8}" y="${lineCenterY + fontSize * 0.35}" font-size="${fontSize * 0.85}" fill="white" font-family="${font}" font-weight="bold">${textContent}</text>`
        );
      }
    }

    const bannerH = Math.max(40, height * 0.055);
    const bannerColor = annotations.overall === 'correct' ? '#00c853' : annotations.overall === 'partial' ? '#ff6d00' : '#ff1744';
    const bannerLabel = annotations.overall === 'correct' ? 'All Correct!' : annotations.overall === 'partial' ? 'Partially Correct' : 'Needs Correction';
    const scoreSuffix = annotations.score_text ? ` (${annotations.score_text})` : '';
    svgParts.push(
      `<rect x="0" y="${height - bannerH}" width="${width}" height="${bannerH}" fill="${bannerColor}" opacity="0.92"/>` +
      `<text x="${width / 2}" y="${height - bannerH / 2 + fontSize * 0.38}" font-size="${fontSize * 1.15}" fill="white" font-family="${font}" font-weight="bold" text-anchor="middle">${escapeXml(bannerLabel + scoreSuffix)}</text>`
    );

    const svg = buildSvg(width, height, svgParts.join(''));

    let result: Buffer = await sharpLib(imageBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    // Append rendered narrative section (best-effort, fails silently)
    if (narrative) {
      try {
        const narrativeBuffer = await renderNarrativeToPng(narrative, width);
        if (narrativeBuffer) {
          const nMeta = await sharpLib(narrativeBuffer).metadata();
          const nW = nMeta.width || width;
          const nH = nMeta.height || 80;
          const scaledN = await sharpLib(narrativeBuffer)
            .resize(width, Math.round(nH * (width / nW)), { fit: 'fill' })
            .toBuffer();
          const scaledMeta = await sharpLib(scaledN).metadata();
          const finalNH = scaledMeta.height || nH;
          result = await sharpLib({
            create: { width, height: height + finalNH, channels: 3, background: { r: 255, g: 253, b: 248 } },
          })
            .composite([
              { input: result, top: 0, left: 0 },
              { input: scaledN, top: height, left: 0 },
            ])
            .jpeg({ quality: 90 })
            .toBuffer();
        }
      } catch (narrativeErr) {
        console.warn('[createAnnotatedImage] narrative append failed:', narrativeErr instanceof Error ? narrativeErr.message : narrativeErr);
      }
    }

    return result;
  } catch (err: unknown) {
    console.error('[createAnnotatedImage] error:', err instanceof Error ? err.message : err);
    return null;
  }
}
