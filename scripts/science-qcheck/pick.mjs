// 🧪 Pick the night's structured science questions to check (14 Oct 2026, Adrian: "yes").
//   node scripts/science-qcheck/pick.mjs <work dir> [count=30]
// Unchecked (no practice_checked_at, no practice_check_note) structured rows that structured
// practice could serve, in the OPEN practice topics (pure + Combined). Round-robin over the
// topic pools, the pools with the fewest passes first; inside a pool no-figure rows first,
// then the newest year. Writes <work>/batch.json + <work>/img/*.png; prints "PICKED <n>".
import fs from 'node:fs';
import path from 'node:path';
import { rest, LEVELS, SUBJECT, servableStructured, flat, figureUrls, openTopics } from './lib.mjs';

const work = path.resolve(process.argv[2] || 'qcheck-work');
const want = Number(process.argv[3] || 30);
// Fill each OPEN topic up to about TARGET checked structured questions, then leave it (Adrian,
// 14 Oct 2026: "A" — fill the open topics first; the other topics wait). About 7 in 10 pass, so a
// topic is offered up to 1.5× what it still lacks.
const TARGET = Number(process.env.QCHECK_TARGET || 40);
fs.mkdirSync(path.join(work, 'img'), { recursive: true });
const cols = 'id,level,school,year,question_text,parts,answer,solution,topics,total_marks,has_image,image_url,images,image_watermark_status,verified,ai_generated,quarantined,not_in_syllabus,practice_hidden,practice_checked_at,practice_check_note';
const { pure, combined } = await openTopics();
const pools = [];
for (const [key, list] of [['', pure], ['CS_', combined]]) for (const [lk, topics] of Object.entries(list)) for (const t of topics || []) {
  if (!LEVELS[lk]) continue;
  pools.push({ key: `${key}${LEVELS[lk]}|${t}`, subject: SUBJECT[lk], levels: key ? [`CS_${LEVELS[lk]}`, `CS_${LEVELS[lk]}_NA`] : [LEVELS[lk]], topic: t });
}
for (const p of pools) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`questions?select=${cols}&subject=eq.${p.subject}&level=in.(${p.levels.join(',')})&topics=cs.${encodeURIComponent(JSON.stringify([p.topic]).replace('[', '{').replace(']', '}'))}&order=id&offset=${from}&limit=1000`);
    rows.push(...page); if (page.length < 1000) break;
  }
  const s = rows.filter(servableStructured);
  p.passed = s.filter(r => r.practice_checked_at).length;
  p.todo = s.filter(r => !r.practice_checked_at && !r.practice_check_note)
    .sort((a, b) => (figureUrls(a).length ? 1 : 0) - (figureUrls(b).length ? 1 : 0) || (b.year || 0) - (a.year || 0) || a.id.localeCompare(b.id));
  p.todo = p.todo.slice(0, Math.max(0, Math.ceil((TARGET - p.passed) * 1.5)));
}
pools.sort((a, b) => a.passed - b.passed);
const picked = new Map();
for (let round = 0; picked.size < want && pools.some(p => p.todo.length); round++) {
  for (const p of pools) {
    if (picked.size >= want) break;
    while (p.todo.length) { const r = p.todo.shift(); if (picked.has(r.id)) { picked.get(r.id).pools.push(p.key); continue; } picked.set(r.id, { r, pools: [p.key] }); break; }
  }
}
const strip = p => ({ label: p.label, text: p.text, marks: p.marks, scheme_answer: p.answer ?? null, scheme_solution: p.solution ?? null,
  ...(p.subparts?.length ? { subparts: p.subparts.map(strip) } : {}), ...(p.image_url || p.image_url_after ? { has_part_figure: true } : {}) });
const items = [];
for (const { r, pools: ps } of picked.values()) {
  const files = [];
  for (const [i, u] of figureUrls(r).entries()) {
    const f = path.join(work, 'img', `${r.id}_${i}.png`);
    try { const res = await fetch(u); if (!res.ok) { files.push({ missing: res.status }); continue; } fs.writeFileSync(f, Buffer.from(await res.arrayBuffer())); files.push(f); }
    catch { files.push({ missing: 'fetch' }); }
  }
  items.push({ id: r.id, pools: ps, total_marks: r.total_marks, question_text: r.question_text, parts: (r.parts || []).map(strip), answer: r.answer, solution: r.solution, figure_files: files });
}
fs.writeFileSync(path.join(work, 'batch.json'), JSON.stringify(items, null, 1));
console.log(`PICKED ${items.length}`);
console.log(`LEFT ${pools.reduce((s, p) => s + p.todo.length, 0)}`);
