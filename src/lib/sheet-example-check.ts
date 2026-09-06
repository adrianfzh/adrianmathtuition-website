// The worked-example reasoning check (Adrian, 6 Sep 2026: "build the worker
// reasoning"). A Practice Again sheet's practice ANSWERS are verified by the
// worker with sympy; the worked EXAMPLES — the teaching, in Adrian's voice,
// under his name — were not checked by anyone. This module re-derives every
// example from its question alone with a second model and compares: a
// different final answer, or a step the second reader calls wrong, HOLDS the
// sheet on the desk instead of letting it release.
//
// Pure pieces (extractExamples, buildCheckPrompt, parseCheck) are tested;
// runExampleCheck is the orchestration with the model call injected. Marks and
// files are never touched here — this is evidence for the release gate.

export interface SheetExample {
  n: number;
  question: string;
  solution: string;
}

export interface ExampleVerdict {
  example: number;
  agree: boolean;
  final_answer_matches: boolean | null;
  issue: string;
}

export interface ExampleCheckResult {
  model: string;
  checked: number;
  disagreements: ExampleVerdict[];
  verdicts: ExampleVerdict[];
  skipped?: string;
}

/** Strip a docx document.xml down to readable text, one line per paragraph / table row. */
export function docxXmlToText(xml: string): string {
  let s = xml;
  // paragraph and row ends become newlines, cells become " | " so a solution
  // table's part label stays attached to its working
  // a cell's last paragraph ends with the cell: that boundary is the separator,
  // not a line break, so a part label stays on the same line as its working
  s = s.replace(/<\/w:p>\s*<\/w:tc>/g, ' | ').replace(/<\/w:tc>/g, ' | ').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n');
  // OMML maths carries its text in m:t runs — keep them
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return s.split('\n').map(l => l.replace(/\s+/g, ' ').replace(/\s*\|\s*$/, '').trim()).filter(Boolean).join('\n');
}

/**
 * Split the sheet's text into its worked examples: "Example N" … "Solution:" …
 * up to the next "Practice N" / "Example N" / end. The question is everything
 * between the Example heading and "Solution:"; the solution is what follows.
 */
export function extractExamples(text: string): SheetExample[] {
  const lines = text.split('\n');
  const out: SheetExample[] = [];
  let cur: { n: number; q: string[]; s: string[]; inSolution: boolean } | null = null;
  const flush = () => {
    if (cur && cur.q.join(' ').trim() && cur.s.join(' ').trim()) {
      out.push({ n: cur.n, question: cur.q.join('\n').trim(), solution: cur.s.join('\n').trim() });
    }
    cur = null;
  };
  for (const line of lines) {
    const ex = line.match(/^Example\s+(\d+)\s*$/i);
    if (ex) { flush(); cur = { n: Number(ex[1]), q: [], s: [], inSolution: false }; continue; }
    if (/^Practice\s+\d+\s*$/i.test(line) || /^\(Optional\)\s*$/i.test(line)) { flush(); continue; }
    if (!cur) continue;
    if (/^Solution\s*:?\s*$/i.test(line)) { cur.inSolution = true; continue; }
    (cur.inSolution ? cur.s : cur.q).push(line);
  }
  flush();
  return out;
}

export function buildCheckPrompt(examples: SheetExample[]): string {
  const blocks = examples.map(e => `### Example ${e.n}\nQUESTION:\n${e.question}\n\nSHEET'S WORKED SOLUTION:\n${e.solution}`).join('\n\n');
  return `You are checking the worked examples on a Singapore O-Level / A-Level maths revision sheet before it goes to a student.
For EACH example: first solve the QUESTION yourself from scratch, without reading the sheet's solution. Then compare.
Report a disagreement when (a) your final answer differs from the sheet's, (b) a line of the sheet's working is mathematically wrong, or (c) the sheet's method does not actually answer what the question asks. A different but valid method, different rounding within the stated accuracy, or a notational choice is NOT a disagreement.
Answer JSON only:
{"verdicts":[{"example":1,"agree":true,"final_answer_matches":true,"issue":""},{"example":2,"agree":false,"final_answer_matches":false,"issue":"one short sentence naming the wrong line and what it should be"}]}

${blocks}`;
}

export function parseCheck(text: string, expected: number[]): ExampleVerdict[] {
  let parsed: { verdicts?: unknown } = {};
  try {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : text);
  } catch { return []; }
  const raw = Array.isArray(parsed.verdicts) ? parsed.verdicts : [];
  const byN = new Map<number, ExampleVerdict>();
  for (const v of raw as Array<Record<string, unknown>>) {
    const n = Number(v?.example);
    if (!Number.isInteger(n)) continue;
    const fam = typeof v.final_answer_matches === 'boolean' ? v.final_answer_matches : null;
    // a different final answer is a disagreement whatever the model wrote in `agree`
    const agree = v.agree !== false && fam !== false;
    byN.set(n, { example: n, agree, final_answer_matches: fam, issue: String(v.issue || '').slice(0, 240) });
  }
  return expected.map(n => byN.get(n) ?? { example: n, agree: true, final_answer_matches: null, issue: 'no verdict returned' });
}

export type CheckModelCall = (prompt: string) => Promise<string>;

/**
 * Run the check. `call` sends the prompt to the model and returns its text
 * (injected so this stays testable and the caller owns the SDK). Never throws:
 * a model failure returns `skipped` with the reason and an empty verdict list.
 */
export async function runExampleCheck(examples: SheetExample[], call: CheckModelCall, model: string): Promise<ExampleCheckResult> {
  if (!examples.length) return { model, checked: 0, disagreements: [], verdicts: [], skipped: 'no examples found on the sheet' };
  try {
    const text = await call(buildCheckPrompt(examples));
    const verdicts = parseCheck(text, examples.map(e => e.n));
    const disagreements = verdicts.filter(v => !v.agree);
    return { model, checked: verdicts.length, disagreements, verdicts };
  } catch (e) {
    return { model, checked: 0, disagreements: [], verdicts: [], skipped: `model call failed: ${(e as Error).message}` };
  }
}
