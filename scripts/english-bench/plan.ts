#!/usr/bin/env node
// The English Practise bench ON THE PLAN (Adrian, 7 Oct 2026: "all on plan") — no paid key.
// The unread rows of a results file are written out as task sheets; plan-billed readers
// (in-session agents) mark them with the page's own rules and write one JSON line a row;
// this script folds their lines back into the results file, and run.ts --report-only scores it.
//
//   npx tsx scripts/english-bench/plan.ts export --name batch-2026-10-07 --out <dir> [--chunk 150]
//   npx tsx scripts/english-bench/plan.ts import --name batch-2026-10-07 --out <dir>
//   npx tsx scripts/english-bench/run.ts --name batch-2026-10-07 --sets … --report-only
//
// A second read of the same answer ("repeat" rows) always goes on a DIFFERENT sheet from its
// first read, so no reader sees its own earlier mark. Rows on a sheet are shuffled so the
// seeded answers to one question do not sit side by side.
// Limit, said plainly in the report: a sheet holds many answers in one reading, where the page
// reads one answer at a time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownPassage, ownUnits } from '../../src/lib/english-own';
import { OWN_READING } from '../../src/lib/english-own-data';
import { SUMMARY_WORD_LIMIT, parseShortReply, parseSummaryReply, ruleShort, summaryContentMax, withinLimit, type Unit } from '../../src/lib/english-practice';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const mode = args[0];
const name = opt('--name', '');
const outDir = opt('--out', '');
const CHUNK = Number(opt('--chunk', '150'));
const FILE = path.join(HERE, 'results', `${name}.json`);
if (!name || !outDir || !fs.existsSync(FILE)) { console.error('need export|import --name <results name> --out <dir>'); process.exit(2); }

interface Row { key: string; kind: string; setId: string; unit: string; text: string; max: number; done?: boolean; awarded?: number | null; hit?: number[] | null; usedModel?: boolean; why?: string; by?: string }
const data = JSON.parse(fs.readFileSync(FILE, 'utf8')) as { rows: Row[] };
const sets = new Map(OWN_READING.map(s => [s.id, { passage: ownPassage(s), title: s.title, units: new Map(ownUnits(s).map(u => [u.number, u])) }]));
const unitOf = (r: Row): Unit => sets.get(r.setId)!.units.get(r.unit)!;
const isSummary = (r: Row) => r.kind === 'summary' || r.kind === 'summary_repeat';
const isSecond = (r: Row) => r.kind === 'repeat' || r.kind === 'summary_repeat';

const RULES = `You are marking answers to O-Level English comprehension questions against the mark scheme. The scheme is the only standard: award what it would award, no more and no less. Judge EVERY answer entirely on its own, as if it were the only answer you had seen — never compare one answer with another on this sheet.

SHORT ANSWERS
- Same meaning in different words earns the mark. A paraphrase is not wrong.
- The student has never seen the scheme. An answer that happens to match the scheme's own wording is simply right; "own words" only rules out words lifted from the PASSAGE.
- If the question says "in your own words", words lifted straight from the passage for the key idea do not earn the mark.
- If the question asks for a word or a phrase from the passage, extra words that change or blur the answer do not earn it.
- A blank, an answer to a different question, or a vague answer with no key idea earns 0.
- Half marks only when the question is worth 2 or more and the scheme has two separable ideas. Marks are whole numbers or halves, from 0 to the question's marks.
- Do not correct spelling or grammar unless it changes the meaning.

SUMMARIES (content only)
- A point is made when its idea is clearly there, in the student's own words or close to them. Order does not matter.
- A point that is only hinted at, or merged so loosely that the idea is lost, is not made.
- Do not award a point that is not on the list. List the NUMBERS of the points made.

OUTPUT — one line per answer, nothing else, written to the output file named in your instructions:
{"id": <row id>, "awarded": <number>, "why": "<8 words at most>"}        for a short answer
{"id": <row id>, "hit": [<point numbers>], "language": "ok"}              for a summary`;

function seededShuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs]; let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

if (mode === 'export') {
  fs.mkdirSync(outDir, { recursive: true });
  // the free rule first — it costs nothing and is what the page does
  let ruled = 0;
  for (const r of data.rows) {
    if (r.done || isSummary(r)) continue;
    const u = unitOf(r); const rule = ruleShort(u, r.text);
    if (rule !== null) { r.awarded = rule ? u.marks : 0; r.usedModel = false; r.why = 'by rule'; r.done = true; ruled++; }
  }
  const todo = data.rows.map((r, id) => ({ r, id })).filter(x => !x.r.done);
  const sheets: { r: Row; id: number }[][] = [];
  for (const second of [false, true]) {
    const part = todo.filter(x => isSecond(x.r) === second);
    const bySet = new Map<string, typeof part>();
    for (const x of part) bySet.set(x.r.setId, [...(bySet.get(x.r.setId) ?? []), x]);
    let cur: typeof part = [];
    for (const [, rows] of bySet) {
      if (cur.length && cur.length + rows.length > CHUNK) { sheets.push(cur); cur = []; }
      cur.push(...rows);
    }
    if (cur.length) sheets.push(cur);
  }
  sheets.forEach((sheet, n) => {
    const out: string[] = [RULES, ''];
    const ids = [...new Set(sheet.map(x => x.r.setId))];
    for (const setId of ids) {
      const s = sets.get(setId)!;
      out.push(`\n================ TEXT ${setId}: ${s.title} ================\n${s.passage}\n`);
      for (const { r, id } of seededShuffle(sheet.filter(x => x.r.setId === setId), n * 97 + setId.length * 13 + sheet.length)) {
        const u = unitOf(r);
        if (isSummary(r)) {
          out.push(`--- ROW ${id} — SUMMARY on text ${setId}\nTASK: ${u.text.replace(/\n+/g, ' ')}\nTHE SCHEME'S POINTS:\n${u.scheme.points.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nTHE STUDENT'S SUMMARY (only the first ${SUMMARY_WORD_LIMIT} words count):\n<<<${withinLimit(r.text)}>>>\n`);
        } else {
          out.push(`--- ROW ${id} — text ${setId}, ${u.marks} mark${u.marks === 1 ? '' : 's'}\nQUESTION: ${u.stem ? u.stem + ' ' : ''}${u.text}\nSCHEME: ${u.scheme.answer ?? '(see the points)'}${u.scheme.accept.length ? '\nAlso accepted: ' + u.scheme.accept.join(' | ') : ''}${u.scheme.points.length ? '\nPoints: ' + u.scheme.points.join(' | ') : ''}\nTHE STUDENT'S ANSWER:\n<<<${r.text}>>>\n`);
        }
      }
    }
    fs.writeFileSync(path.join(outDir, `sheet-${String(n + 1).padStart(2, '0')}.txt`), out.join('\n'));
  });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 1));
  console.log(`${ruled} marked by the free rule · ${todo.length} rows on ${sheets.length} sheets (${sheets.map(s => s.length).join(', ')}) in ${outDir}`);
} else if (mode === 'import') {
  let taken = 0, bad = 0;
  for (const f of fs.readdirSync(outDir).filter(x => /^marks-\d+\.jsonl$/.test(x))) {
    for (const line of fs.readFileSync(path.join(outDir, f), 'utf8').split('\n').filter(l => l.trim().startsWith('{'))) {
      let o: { id?: number }; try { o = JSON.parse(line); } catch { bad++; continue; }
      const r = typeof o.id === 'number' ? data.rows[o.id] : undefined;
      if (!r || r.done) { if (!r) bad++; continue; }
      const u = unitOf(r);
      if (isSummary(r)) {
        const v = parseSummaryReply(line, u.scheme.points.length);
        if (!v) { bad++; continue; }
        r.hit = v.hit; r.awarded = Math.min(summaryContentMax(u.scheme), v.hit.length);
      } else {
        const v = parseShortReply(line, u.marks);
        if (!v) { bad++; continue; }
        r.awarded = v.awarded; r.why = v.why;
      }
      r.usedModel = true; r.by = 'plan'; r.done = true; taken++;
    }
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 1));
  console.log(`${taken} rows taken in · ${bad} lines unusable · ${data.rows.filter(r => !r.done).length} still unread`);
} else { console.error('export or import'); process.exit(2); }
