// Per-month invoice migration.
//
// Deflates each invoice to its OWN month: strips the carry-forward
// "Outstanding balance — <month>" lump from Line Items Extra, lowers Final
// Amount accordingly, and re-attributes each family's payments oldest-month-first
// across their invoices (Amount Paid / Is Paid). Σ(billed) and Σ(paid) per family
// are conserved — only WHICH invoice holds the amount changes.
//
// Usage:
//   node scripts/migrate-permonth.mjs          # dry-run + write snapshot (NO Airtable writes)
//   node scripts/migrate-permonth.mjs apply     # snapshot, then APPLY the writes
//   node scripts/migrate-permonth.mjs revert <snapshot.json>   # restore from snapshot
import fs from 'node:fs';

const ENVPATH = new URL('../.env.local', import.meta.url).pathname;
const env = Object.fromEntries(fs.readFileSync(ENVPATH, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const TOKEN = env.AIRTABLE_TOKEN, BASE = env.AIRTABLE_BASE_ID;
if (!TOKEN || !BASE) { console.error('Missing Airtable env'); process.exit(1); }

const mode = process.argv[2] || 'dry';
const SNAPDIR = new URL('./', import.meta.url).pathname;

async function fetchAll(table, q = '') {
  let url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?pageSize=100${q}`; const out = [];
  while (url) { const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } }); if (!r.ok) throw new Error(`${table} ${r.status} ${await r.text()}`); const j = await r.json(); out.push(...j.records); url = j.offset ? `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?pageSize=100&offset=${j.offset}${q}` : null; }
  return out;
}
async function patch(id, fields) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/Invoices/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`PATCH ${id} ${r.status} ${await r.text()}`);
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const mkey = (label) => { const m = String(label || '').trim().match(/([A-Za-z]+)\s+(\d{4})/); if (!m) return -1; const i = MONTHS.indexOf(m[1].toLowerCase()); return i < 0 ? -1 : parseInt(m[2], 10) * 12 + i; };
const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
function splitExtra(raw) { let items = []; try { items = JSON.parse(raw || '[]'); } catch { items = []; } const lumps = [], rest = []; for (const it of items) (/outstanding balance/i.test((it.description || it.label || '').toString()) ? lumps : rest).push(it); return { lumps, rest }; }

// ── revert mode ──
if (mode === 'revert') {
  const file = process.argv[3];
  if (!file) { console.error('Usage: revert <snapshot.json>'); process.exit(1); }
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Reverting ${snap.length} invoices from ${file} …`);
  for (const s of snap) {
    await patch(s.id, { 'Final Amount': s.final, 'Line Items Extra': s.lie, 'Amount Paid': s.paid, 'Is Paid': s.isPaid });
    console.log(`  ↩ ${s.name} ${s.month} restored`);
  }
  console.log('Revert complete.');
  process.exit(0);
}

// ── build the plan ──
const students = await fetchAll('Students', '&fields%5B%5D=Student%20Name');
const nameById = Object.fromEntries(students.map((s) => [s.id, s.fields['Student Name'] || '']));
const all = await fetchAll('Invoices');

// group by student, find families with a lump invoice
const byStu = {};
for (const r of all) { const sid = r.fields['Student']?.[0]; if (!sid) continue; (byStu[sid] = byStu[sid] || []).push(r); }
const targetStudents = Object.keys(byStu).filter((sid) => byStu[sid].some((r) => r.fields['Status'] !== 'Voided' && splitExtra(r.fields['Line Items Extra']).lumps.length));

const snapshot = [];
const changes = [];      // {id, name, month, fields}
let famCount = 0, invChanged = 0, conserveFail = 0;
let grandBefore = 0, grandAfter = 0;

for (const sid of targetStudents) {
  const recs = byStu[sid].filter((r) => r.fields['Status'] !== 'Voided').sort((a, b) => mkey(a.fields['Month']) - mkey(b.fields['Month']));
  const name = nameById[sid] || sid;
  famCount++;
  // own-month + pooled payments
  let pool = 0, sumOwn = 0, sumPaidOld = 0;
  const items = recs.map((r) => {
    const final = r.fields['Final Amount'] || 0; const paid = r.fields['Amount Paid'] || 0;
    const { lumps, rest } = splitExtra(r.fields['Line Items Extra']);
    const lump = lumps.reduce((s, it) => s + (it.amount || 0), 0);
    const own = final - lump; pool += paid; sumOwn += own; sumPaidOld += paid;
    return { r, final, paid, own, rest, lump };
  });
  // allocate oldest-first
  let remaining = pool; const N = items.length;
  items.forEach((it, idx) => {
    let applied = Math.min(remaining, Math.max(it.own, 0)); remaining -= applied;
    if (idx === N - 1 && remaining > 0.005) applied += remaining;   // leftover credit → last invoice
    it.newPaid = applied; it.newIsPaid = applied >= it.own - 0.005;
  });
  const sumPaidNew = items.reduce((s, it) => s + it.newPaid, 0);
  const beforeOut = sumOwn - sumPaidOld, afterOut = sumOwn - sumPaidNew;
  const ok = Math.abs(beforeOut - afterOut) < 0.01 && Math.abs(sumPaidNew - sumPaidOld) < 0.01;
  if (!ok) conserveFail++;
  grandBefore += Math.max(beforeOut, 0); grandAfter += Math.max(afterOut, 0);

  console.log(`\n${ok ? '✓' : '✗ CONSERVE FAIL'}  ${name}`);
  for (const it of items) {
    const newLIE = it.rest.length ? JSON.stringify(it.rest) : '';
    snapshot.push({ id: it.r.id, name, month: it.r.fields['Month'], final: it.final, lie: it.r.fields['Line Items Extra'] || '', paid: it.paid, isPaid: it.r.fields['Is Paid'] === true });
    const fields = { 'Final Amount': it.own, 'Line Items Extra': newLIE, 'Amount Paid': it.newPaid, 'Is Paid': !!it.newIsPaid };
    const needsWrite = it.own !== it.final || it.newPaid !== it.paid || (it.r.fields['Is Paid'] === true) !== !!it.newIsPaid || it.lump;
    if (needsWrite) { changes.push({ id: it.r.id, name, month: it.r.fields['Month'], fields }); invChanged++; }
    console.log(`   ${String(it.r.fields['Month']).padEnd(12)} Final ${money(it.final).padStart(9)}→${money(it.own).padStart(9)}  ` +
      `Paid ${money(it.paid).padStart(9)}→${money(it.newPaid).padStart(9)}  ${needsWrite ? '✎' : '·'}` + (it.lump ? `  (−lump ${money(it.lump)})` : ''));
  }
  console.log(`   outstanding before ${money(beforeOut)} → after ${money(afterOut)} ${ok ? '✓ conserved' : '⚠'}`);
}

console.log(`\n#################### SUMMARY ####################`);
console.log(`Families: ${famCount}   Invoices to change: ${invChanged}   Conservation failures: ${conserveFail}`);
console.log(`Total outstanding before ${money(grandBefore)} → after ${money(grandAfter)} ${Math.abs(grandBefore - grandAfter) < 0.01 ? '✓' : '⚠ MISMATCH'}`);

// write snapshot
const stamp = process.argv[4] || new Date().toISOString().replace(/[:.]/g, '-');
const snapFile = `${SNAPDIR}migration-snapshot-${stamp}.json`;
fs.writeFileSync(snapFile, JSON.stringify(snapshot, null, 2));
console.log(`\nSnapshot (${snapshot.length} invoices) written: ${snapFile}`);
console.log(`Revert with:  node scripts/migrate-permonth.mjs revert ${snapFile}`);

if (mode !== 'apply') { console.log('\nDRY-RUN — no Airtable writes. Re-run with "apply" to write.'); process.exit(0); }

if (conserveFail > 0) { console.error('\n⛔ Conservation failed for some families — ABORTING, no writes.'); process.exit(1); }

console.log(`\nAPPLYING ${changes.length} invoice updates …`);
for (const c of changes) { await patch(c.id, c.fields); console.log(`  ✎ ${c.name} ${c.month}`); }
console.log('Apply complete.');
