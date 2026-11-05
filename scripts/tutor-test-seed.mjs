#!/usr/bin/env node
// 🧑‍🏫 Make (or reset) the TEST tutor account for the tutor portal (SPEC-TUTOR-TOOLS.md §7).
//
//   node scripts/tutor-test-seed.mjs
//
// Reads TUTOR_TEST_EMAIL + TUTOR_TEST_PASSWORD from .env.local (the password is kept there,
// never in the repo or a chat). Creates the account if missing, sets its password, cap 5,
// and one test student "Test Student". Safe to run again: it only resets the password and
// cap, and adds the student only when the tutor has none.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const email = (process.env.TUTOR_TEST_EMAIL || '').trim().toLowerCase();
const password = (process.env.TUTOR_TEST_PASSWORD || '').trim();
if (!url || !key || !email || password.length < 10) {
  console.error('Need SUPABASE_URL, SUPABASE_SECRET_KEY, TUTOR_TEST_EMAIL and TUTOR_TEST_PASSWORD (10+ chars) in .env.local');
  process.exit(1);
}
// Same format as lib/tutor-portal.ts hashPassword.
const salt = crypto.randomBytes(16);
const hash = `scrypt$${salt.toString('base64url')}$${crypto.scryptSync(password, salt, 32).toString('base64url')}`;

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: existing } = await sb.from('tutor_accounts').select('id').eq('email', email).maybeSingle();
let id = existing?.id;
if (id) {
  const { error } = await sb.from('tutor_accounts')
    .update({ password_hash: hash, monthly_paper_cap: 5, active: true, invite_token_hash: null, invite_expires_at: null }).eq('id', id);
  if (error) throw error;
} else {
  const { data, error } = await sb.from('tutor_accounts')
    .insert({ email, display_name: 'Test Tutor', password_hash: hash, monthly_paper_cap: 5, note: 'test account (scripts/tutor-test-seed.mjs)' })
    .select('id').single();
  if (error) throw error;
  id = data.id;
}
const { count } = await sb.from('tutor_students').select('id', { count: 'exact', head: true }).eq('tutor_id', id);
if (!count) await sb.from('tutor_students').insert({ tutor_id: id, name: 'Test Student', level: 'Sec 4' });
console.log(`test tutor ready: ${email} (id ${id}) — password in .env.local TUTOR_TEST_PASSWORD`);
