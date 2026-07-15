#!/usr/bin/env node
// scripts/embed-bio.mjs — backfill embeddings for the adrianbiology question bank.
// Matches the math/chem/phy banks: text-embedding-3-small, vector(1536).
// Reads questions where embedding IS NULL, embeds question_text (+ flattened parts),
// writes the vectors. Idempotent — safe to re-run; only fills nulls.
//
// Needs: OPENAI_API_KEY (from the bot .env) + BIO_SUPABASE_URL + BIO_SERVICE_KEY.
// Run: OPENAI_API_KEY=... BIO_SERVICE_KEY=... node scripts/embed-bio.mjs
import { createClient } from '@supabase/supabase-js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const BIO_URL = process.env.BIO_SUPABASE_URL || 'https://kgvvykcacttlpnqvolxq.supabase.co';
const BIO_KEY = process.env.BIO_SERVICE_KEY;
if (!OPENAI_KEY || !BIO_KEY) { console.error('need OPENAI_API_KEY and BIO_SERVICE_KEY'); process.exit(2); }

const supa = createClient(BIO_URL, BIO_KEY);
const MODEL = 'text-embedding-3-small';
const BATCH = 256; // OpenAI allows up to 2048 inputs; 256 keeps requests small & robust

function embedInput(q) {
  let t = (q.question_text || '').trim();
  if (q.parts) {
    try {
      const parts = typeof q.parts === 'string' ? JSON.parse(q.parts) : q.parts;
      const flat = JSON.stringify(parts).replace(/[{}\[\]"]/g, ' ').replace(/\s+/g, ' ').trim();
      if (flat && flat.length > 2) t += '\n' + flat.slice(0, 4000);
    } catch { /* parts not JSON — skip */ }
  }
  if (Array.isArray(q.topics) && q.topics.length) t += '\nTopics: ' + q.topics.join(', ');
  return t.slice(0, 8000) || '(no text)';
}

async function embed(texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.data.map(d => d.embedding);
}

let done = 0, failed = 0;
for (;;) {
  const { data: rows, error } = await supa
    .from('questions')
    .select('id, question_text, parts, topics')
    .is('embedding', null)
    .limit(BATCH);
  if (error) { console.error('read error:', error.message); process.exit(1); }
  if (!rows || rows.length === 0) break;

  const inputs = rows.map(embedInput);
  let vectors;
  try { vectors = await embed(inputs); }
  catch (e) { console.error('embed batch failed:', e.message); failed += rows.length; continue; }

  // write each vector back
  await Promise.all(rows.map((row, i) =>
    supa.from('questions').update({ embedding: vectors[i] }).eq('id', row.id)
      .then(({ error }) => { if (error) { failed++; console.error('write', row.id, error.message); } else done++; })
  ));
  console.log(`embedded ${done} (failed ${failed})`);
}
console.log(`\nDONE — embedded ${done}, failed ${failed}`);
