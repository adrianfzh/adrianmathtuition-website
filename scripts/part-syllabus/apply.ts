// Apply part-level out-of-syllabus marks from a JSON list (SPEC-PART-SYLLABUS.md).
//
//   npx tsx scripts/part-syllabus/apply.ts marks.json            ← DRY RUN (the default): reads, prints, writes nothing
//   npx tsx scripts/part-syllabus/apply.ts marks.json --apply    ← writes `parts`, and an undo file beside the list
//   npx tsx scripts/part-syllabus/apply.ts marks.undo.json --apply --undo   ← puts the old `parts` back
//
// The list:
//   [ { "question_id": "<uuid>", "part_label": "(b)(ii)", "reason": "de Moivre (not in 9758)" },
//     { "question_id": "<uuid>", "part_label": "(b)(iv)", "needs": ["(b)(ii)"] } ]
// An entry with `reason` marks that part out of syllabus. An entry with `needs` says that
// part cannot be done without the parts named ("hence") — it is hidden with them. One entry
// may carry both. Nothing here guesses a dependency: later parts that say "Hence", name a
// hidden part, or whose working cites it are printed as DECIDE lines, and a question with
// one left undecided is NOT written. Decide each with one more entry:
//     { "question_id": "<uuid>", "part_label": "(b)(iii)", "needs": ["(b)(i)"] }          ← it needs it: hidden too
//     { "question_id": "<uuid>", "part_label": "(b)(iii)", "stands_alone": ["(b)(i)"] }   ← it can be done alone: kept
// A question whose student view has something a person must read (a sentence that may
// name a re-lettered part, labels that are not a plain run) is written but NOT served
// until confirmed — on /admin/questions, or here with { "question_id": "<uuid>", "confirm": true }
// as the LAST entry for that question.
//
// Students see the remaining parts RE-LETTERED; the stored labels are never changed.
// The dry run prints each rename ("(iii) shown as (ii)").
//
// Only `questions.parts` is written, and only the three mark keys on the named part.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.env.local')));
for (const k of Object.keys(env)) if (env[k] && !process.env[k]) process.env[k] = String(env[k]).trim();

type Entry = { question_id?: string; part_label?: string; reason?: string; needs?: string[]; stands_alone?: string[]; confirm?: boolean };
type Row = { id: string; school: string | null; year: number | null; paper: string | null; question_number: string | null; question_text: string | null; parts: unknown; total_marks: number | null; answer: string | null; solution: string | null };

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const apply = args.includes('--apply');
  const undo = args.includes('--undo');
  if (!file) { console.error('usage: npx tsx scripts/part-syllabus/apply.ts <marks.json> [--apply] [--undo]'); process.exit(2); }
  const { getSupabaseAdmin } = await import('../../src/lib/supabase');
  const { applyPartMark, confirmPartChecks, studentView } = await import('../../src/lib/part-syllabus');
  const sb = getSupabaseAdmin();
  const list = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown[];
  if (!Array.isArray(list)) throw new Error('the file must hold a JSON list');

  if (undo) {
    const rows = list as { id: string; parts: unknown }[];
    console.log(`${apply ? 'UNDO' : 'DRY RUN (undo)'} — ${rows.length} question(s)`);
    for (const r of rows) {
      if (apply) { const { error } = await sb.from('questions').update({ parts: r.parts }).eq('id', r.id); if (error) throw new Error(`${r.id}: ${error.message}`); }
      console.log(`  ${r.id}  parts put back${apply ? '' : ' (not written)'}`);
    }
    return;
  }

  const entries = list as Entry[];
  const ids = [...new Set(entries.map((e) => String(e.question_id || '')).filter((id) => /^[0-9a-f-]{36}$/.test(id)))];
  const rows = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('questions')
      .select('id, school, year, paper, question_number, question_text, parts, total_marks, answer, solution').in('id', ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Row[]) rows.set(r.id, r);
  }

  const before = new Map<string, unknown>();
  const work = new Map<string, Row>();
  const count = { ok: 0, refused: 0, notServed: 0, undecided: 0, toRead: 0, answerWithheld: 0 };
  console.log(`${apply ? 'APPLY' : 'DRY RUN — nothing is written (add --apply to write)'} · ${entries.length} entries · ${ids.length} questions\n`);
  for (const e of entries) {
    const id = String(e.question_id || '');
    const row = work.get(id) ?? rows.get(id);
    const name = row ? [row.school, row.year, row.paper, row.question_number ? `Q${row.question_number}` : null].filter(Boolean).join(' ') : id;
    if (!row) { count.refused++; console.log(`✗ ${id}: not in the bank`); continue; }
    const res = e.confirm === true
      ? confirmPartChecks(row)
      : applyPartMark(row, {
        part: String(e.part_label || ''),
        ...(e.reason ? { legacy: true, reason: e.reason } : {}),
        ...(Array.isArray(e.needs) ? { needs: e.needs } : {}),
        ...(Array.isArray(e.stands_alone) ? { cleared: e.stands_alone } : {}),
      });
    if (!res.ok) { count.refused++; console.log(`✗ ${name} ${e.confirm ? 'confirm' : e.part_label}: ${res.error}`); continue; }
    if (!before.has(id)) before.set(id, rows.get(id)!.parts);
    work.set(id, { ...row, parts: res.parts });
    count.ok++;
    const v = res.view;
    const hidden = v.hidden.filter((h) => h.via !== 'parent').map((h) => `${h.label}${h.via === 'marked' ? '' : ` (${h.reason})`}`).join(', ');
    console.log(`✓ ${name}: hide ${hidden || '—'} · marks ${v.originalMarks ?? '?'} → ${v.marks ?? '?'}${v.enoughLeft ? '' : ' · TOO LITTLE LEFT — will not be served'}`);
    for (const r of v.labels.renames) console.log(`    ${r.fromLabel} shown as ${r.toLabel || 'the question itself (no letter)'}`);
    for (const n of v.notes) console.log(`    note: ${n}`);
  }
  // What each question comes to once every entry is in: the decisions still owed, and what a person must read.
  const blocked = new Set<string>();
  for (const row of work.values()) {
    const v = studentView(row);
    const name = [row.school, row.year, row.paper, row.question_number ? `Q${row.question_number}` : null].filter(Boolean).join(' ');
    if (!v.enoughLeft) count.notServed++;
    if (v.notes.includes('answer_withheld')) count.answerWithheld++;
    for (const d of v.dependents) {
      console.log(`  DECIDE ${name} ${d.label}: ${d.why}. Add { "question_id": "${row.id}", "part_label": "${d.label}", "needs": ["${d.onLabel}"] }  or  "stands_alone": ["${d.onLabel}"]`);
    }
    if (v.dependents.length) { count.undecided++; blocked.add(row.id); }
    if (v.checks.length && !v.checksConfirmed) {
      count.toRead++;
      for (const c of v.checks) console.log(`  READ ${name}: ${c.detail}`);
    }
  }
  console.log(`\n${count.ok} entries fit · ${count.refused} refused · ${count.notServed} question(s) left with too little to serve · ${count.undecided} with a "does it need it?" still to decide (NOT written) · ${count.toRead} to read and confirm before students get them · ${count.answerWithheld} with the answer line held back`);

  if (!apply) return;
  for (const id of blocked) { work.delete(id); before.delete(id); }
  const undoFile = file.replace(/\.json$/i, '') + `.undo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(undoFile, JSON.stringify([...before].map(([id, parts]) => ({ id, parts })), null, 1));
  console.log(`undo file: ${undoFile}`);
  for (const row of work.values()) {
    const { error } = await sb.from('questions').update({ parts: row.parts }).eq('id', row.id);
    if (error) throw new Error(`${row.id}: ${error.message} — stop; ${undoFile} holds what was there`);
  }
  console.log(`written: ${work.size} question(s)`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
