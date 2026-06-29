// Split the 12 cumulative April 2026 invoices into per-month invoices.
//
// Each carries earlier months as "Previous month (X)" lines in Line Items Extra,
// with NO separate invoice for those months. This CREATES a separate invoice per
// prior month and deflates April to its own month, re-attributing the paid amount
// oldest-first. Σ(billed) and Σ(paid) per student are conserved.
//
//   node scripts/split-april.mjs            # dry-run (no writes) + snapshot
//   node scripts/split-april.mjs apply       # create priors + deflate April
//   node scripts/split-april.mjs revert <created.json> <snapshot.json>
import fs from 'node:fs';

const ENV = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url).pathname, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const T = ENV.AIRTABLE_TOKEN, B = ENV.AIRTABLE_BASE_ID;
const DIR = new URL('./', import.meta.url).pathname;
const mode = process.argv[2] || 'dry';
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function all(t, q = '') { let u = `https://api.airtable.com/v0/${B}/${t}?pageSize=100${q}`, o = []; while (u) { const r = await fetch(u, { headers: { Authorization: `Bearer ${T}` } }); const j = await r.json(); o.push(...j.records); u = j.offset ? `https://api.airtable.com/v0/${B}/${t}?pageSize=100&offset=${j.offset}${q}` : null; } return o; }
async function patch(id, f) { const r = await fetch(`https://api.airtable.com/v0/${B}/Invoices/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: f }) }); if (!r.ok) throw new Error(`PATCH ${id}: ${await r.text()}`); }
async function create(f) { const r = await fetch(`https://api.airtable.com/v0/${B}/Invoices`, { method: 'POST', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: f }) }); if (!r.ok) throw new Error(`CREATE: ${await r.text()}`); return (await r.json()).id; }
async function del(id) { const r = await fetch(`https://api.airtable.com/v0/${B}/Invoices/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${T}` } }); if (!r.ok) throw new Error(`DELETE ${id}: ${await r.text()}`); }
const money = (n) => '$' + Number(n).toFixed(2);

// ── revert ──
if (mode === 'revert') {
  const created = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const snap = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  for (const id of created) { await del(id); console.log('  🗑 deleted ' + id); }
  for (const s of snap) { await patch(s.id, { 'Final Amount': s.final, 'Line Items Extra': s.lie, 'Amount Paid': s.paid, 'Is Paid': s.isPaid }); console.log('  ↩ restored ' + s.name + ' April'); }
  console.log('Revert complete.'); process.exit(0);
}

const students = await all('Students', '&fields%5B%5D=Student%20Name');
const nm = Object.fromEntries(students.map((s) => [s.id, s.fields['Student Name'] || '']));
const inv = await all('Invoices');

const targets = inv.filter((r) => {
  const f = r.fields; if (f['Status'] === 'Voided') return false;
  let lie = []; try { lie = JSON.parse(f['Line Items Extra'] || '[]'); } catch { }
  return /April/.test(f['Month'] || '') && lie.some((it) => /previous month/i.test((it.description || '') + ''));
});

const snapshot = [], plan = [];
let conserveFail = 0;
for (const r of targets) {
  const f = r.fields, name = nm[f['Student'] || ''] || f['Student']?.[0];
  let lie = []; try { lie = JSON.parse(f['Line Items Extra'] || '[]'); } catch { }
  const priors = lie.filter((it) => /previous month/i.test((it.description || '') + ''))
    .map((it) => { const m = (it.description || '').match(/\(([A-Za-z]+)\)/); return { month: `${m ? m[1] : '?'} 2026`, amount: it.amount || 0 }; })
    .sort((a, b) => MO.indexOf(a.month.split(' ')[0]) - MO.indexOf(b.month.split(' ')[0]));
  const restLIE = lie.filter((it) => !/previous month/i.test((it.description || '') + ''));
  const final = f['Final Amount'] || 0, paid = f['Amount Paid'] || 0, rate = f['Rate Per Lesson'] || 0;
  const ownApr = final - priors.reduce((s, p) => s + p.amount, 0);

  // allocate paid oldest-first across priors then April
  const order = [...priors.map((p) => ({ ...p })), { month: 'April 2026', amount: ownApr, isApril: true }];
  let pool = paid;
  for (const o of order) { const ap = Math.min(pool, Math.max(o.amount, 0)); pool -= ap; o.paid = ap; o.isPaid = ap >= o.amount - 0.005; }

  const sumF = order.reduce((s, o) => s + o.amount, 0), sumP = order.reduce((s, o) => s + o.paid, 0);
  const ok = Math.abs(sumF - final) < 0.01 && Math.abs(sumP - paid) < 0.01;
  if (!ok) conserveFail++;

  // build create-fields for priors
  const baseDesc = (() => { try { return (JSON.parse(f['Line Items'] || '[]')[0]?.description || 'Lessons'); } catch { return 'Lessons'; } })();
  const mk = (o) => {
    const M = MO.indexOf(o.month.split(' ')[0]) + 1, yr = +o.month.split(' ')[1];
    const lessons = rate > 0 && Math.abs(o.amount % rate) < 0.01 ? o.amount / rate : null;
    const desc = baseDesc.replace(/[A-Za-z]+\s+\d{4}\s*$/, o.month);
    const fields = {
      'Student': f['Student'], 'Month': o.month, 'Final Amount': o.amount, 'Amount Paid': o.paid, 'Is Paid': !!o.isPaid,
      'Status': f['Status'] || 'Sent', 'Invoice Type': 'Regular',
      'Line Items': JSON.stringify(lessons ? Array.from({ length: lessons }, () => ({ description: desc })) : [{ description: desc, amount: o.amount }]),
      'Line Items Extra': '', 'Issue Date': `${M > 1 ? yr : yr - 1}-${String(M > 1 ? M - 1 : 12).padStart(2, '0')}-15`, 'Due Date': `${yr}-${String(M).padStart(2, '0')}-15`,
      'Auto Notes': 'Split from April consolidated invoice (per-month accounting)',
    };
    if (rate > 0) fields['Rate Per Lesson'] = rate;
    if (lessons) fields['Lessons Count'] = lessons;
    if (o.isPaid && f['Paid At']) fields['Paid At'] = f['Paid At'];
    return fields;
  };

  snapshot.push({ id: r.id, name, final, lie: f['Line Items Extra'] || '', paid, isPaid: f['Is Paid'] === true });
  const aprRec = order.find((o) => o.isApril);
  plan.push({
    aprId: r.id, name,
    creates: priors.map((p) => { const o = order.find((x) => x.month === p.month); return mk(o); }),
    aprPatch: { 'Final Amount': ownApr, 'Line Items Extra': restLIE.length ? JSON.stringify(restLIE) : '', 'Amount Paid': aprRec.paid, 'Is Paid': !!aprRec.isPaid },
    ok,
  });

  console.log(`\n${ok ? '✓' : '✗ CONSERVE FAIL'}  ${name}  (April was ${money(final)}, paid ${money(paid)})`);
  for (const o of order) console.log(`   ${o.month.padEnd(14)} ${money(o.amount).padStart(8)}  paid ${money(o.paid).padStart(8)}  ${o.isPaid ? '✅' : '❌'}${o.isApril ? '  ← April (deflated)' : '  ← NEW invoice'}`);
}

console.log(`\n#################### SUMMARY ####################`);
const newCount = plan.reduce((s, p) => s + p.creates.length, 0);
console.log(`April invoices to split: ${plan.length}   New prior invoices to create: ${newCount}   Conservation failures: ${conserveFail}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`${DIR}split-april-snapshot-${stamp}.json`, JSON.stringify(snapshot, null, 2));
console.log(`Snapshot: ${DIR}split-april-snapshot-${stamp}.json`);

if (mode !== 'apply') { console.log('\nDRY-RUN — no writes. Re-run with "apply".'); process.exit(0); }
if (conserveFail) { console.error('\n⛔ Conservation failed — ABORTING.'); process.exit(1); }

const created = [];
for (const p of plan) {
  for (const cf of p.creates) { const id = await create(cf); created.push(id); console.log(`  ＋ ${p.name} ${cf['Month']} (${money(cf['Final Amount'])})`); }
  await patch(p.aprId, p.aprPatch); console.log(`  ✎ ${p.name} April → ${money(p.aprPatch['Final Amount'])}`);
}
fs.writeFileSync(`${DIR}split-april-created-${stamp}.json`, JSON.stringify(created, null, 2));
console.log(`\nApply complete. ${created.length} created. Revert: node scripts/split-april.mjs revert ${DIR}split-april-created-${stamp}.json ${DIR}split-april-snapshot-${stamp}.json`);
