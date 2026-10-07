// What makes a point-marked Geography set fit to list (SPEC-HUMANITIES.md §B,
// 7 Oct 2026). Pure: the unit test runs it over the bank, and
// scripts/humanities-bench/check-set.ts runs it over a draft. It checks the
// SHAPE — whether a seeded answer earns its marks is the bench's job.
import { GEO_CLUSTERS, POINTS_SKILLS, diagramByKey, type HumanitiesSet } from './humanities-questions';
import { figureProblem } from './humanities-chart';

const words = (t: string): number => (t.trim() ? t.trim().split(/\s+/).length : 0);
const BANNED = /\b(adrian|claude|opus|sonnet|haiku|gemini|chatgpt|ai model)\b/i;
const COMMANDS = ['describe', 'explain', 'compare', 'suggest'];

/** Every problem with one Geography set; an empty list = fit to list. */
export function geographyProblems(set: HumanitiesSet): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(`${set.id}: ${m}`);
  if (!/^g\d{2,}$/.test(set.id)) bad('id is not gNN');
  if (!set.cluster || !GEO_CLUSTERS.includes(set.cluster)) bad('cluster missing or unknown');
  if (!set.title || !set.issue) bad('title or issue missing');
  if (!set.questions.length) bad('no questions');
  set.questions.forEach((q, i) => {
    const at = (m: string) => bad(`${q.id}: ${m}`);
    if (q.id !== `${set.id}-q${i + 1}`) at('id out of order');
    if (!(POINTS_SKILLS as readonly string[]).includes(q.skill)) at(`skill ${q.skill}`);
    if (!q.command || !COMMANDS.includes(q.command)) at(`command word ${q.command}`);
    if (q.skill !== `geo_${q.command === 'describe' || q.command === 'compare' ? 'describe' : 'explain'}`) at('skill does not match the command word');
    const marks = q.marks ?? 0;
    if (marks < 2 || marks > 6) at(`${marks} marks (2 to 6)`);
    if (!q.question.trim().endsWith('.')) at('the question has no full stop');
    const pts = q.points ?? [];
    if (new Set(pts.map(p => p.id)).size !== pts.length) at('point ids repeat');
    for (const p of pts) {
      if (words(p.text) < 3 || words(p.text) > 30) at(`point ${p.id}: ${words(p.text)} words (3 to 30)`);
      if (q.develop && !p.develop) at(`point ${p.id}: no "develop" line though development earns credit`);
      if (!q.develop && p.develop) at(`point ${p.id}: a "develop" line though development earns nothing`);
    }
    // The points must be able to reach full marks, with at least one to spare for choice.
    const reach = pts.length * (q.develop ? 2 : 1);
    if (reach < marks) at(`the points reach only ${reach} of ${marks} marks`);
    if (/\btable\b|fig\./i.test(q.question) && !q.table && !q.diagram) at('the question names a table or figure it does not carry');
    if (q.diagram) {
      if (!diagramByKey(q.diagram.key)) at(`diagram ${q.diagram.key} is not in the diagram bank`);
      if (!/^Fig\. \d+:/.test(q.diagram.caption)) at('diagram caption is not "Fig. N: …"');
    }
    if (q.table) {
      if (!(q.table.figure ? /^Fig\. \d+:/ : /^Table \d+:/).test(q.table.caption)) at(`caption is not "${q.table.figure ? 'Fig.' : 'Table'} N: …"`);
      const fp = q.table.figure ? figureProblem(q.table, q.table.figure) : null;
      if (fp) at(fp);
      if (q.table.rows.some(r => r.length !== q.table!.columns.length)) at('a table row does not match the columns');
    }
    const levels = (q.seeded ?? []).map(s => s.level).sort((a, b) => a - b);
    if (levels.join() !== Array.from({ length: marks + 1 }, (_, k) => k).join()) at(`seeded answers at marks ${levels.join()} (need 0 to ${marks})`);
    for (const s of q.seeded ?? []) if (words(s.text) > 220) at(`seeded ${s.level}: ${words(s.text)} words (220 at most)`);
  });
  if (BANNED.test(JSON.stringify(set))) bad('names the tutor or a model');
  return out;
}
