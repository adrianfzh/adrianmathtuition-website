// "My definitions" — the I/O (14 Oct 2026). Rules: lib/my-definitions.ts.
//
// Tables (migrations/student_definitions.sql, main project, RLS on with NO
// policies — only this server code reads them, through the service client,
// with the identity taken from the session, never from the client):
//   student_definitions  one row per saved definition per student
//   definition_cache     one row per (subject, term key): the written
//                        definition OR the refusal, shared by every student,
//                        so a term is written once
// New writes are counted in portal_event_log (kind 'definition:write'), the
// same way the practice hint counts its writes.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './supabase';
import { SONNET_55, anthropicText } from './claude-models';
import { getScienceClient, scienceConfigured } from './science-bank';
import {
  SUBJECT_INFO, addAllowed, buildWriterPrompt, cleanTerm, findInList, parseWriterReply, refusalLine, termKey,
  type DefSource, type DefSubject,
} from './my-definitions';

export const MY_DEFINITIONS_MODEL = process.env.MY_DEFINITIONS_MODEL || SONNET_55;

export type MyDefinition = { id: string; term: string; text: string; formula: string | null; source: DefSource; created_at: string };

const COLS = 'id, term, text, formula, source, created_at';

export async function listMine(identity: string, subject: DefSubject): Promise<MyDefinition[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('student_definitions').select(COLS)
    .eq('identity', identity).eq('subject', subject)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MyDefinition[];
}

export async function removeMine(identity: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('student_definitions').delete().eq('identity', identity).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export type AddResult =
  | { added: MyDefinition; already?: boolean }
  | { message: string };

/** Finds the definition (list → cache → bank-grounded writer → writer) and saves it for the student. */
export async function addMine(identity: string, subject: DefSubject, rawTerm: string): Promise<AddResult> {
  const typed = cleanTerm(rawTerm);
  if (!typed) return { message: 'Type a term, for example “density”.' };
  const key = termKey(typed);
  const sb = getSupabaseAdmin();

  const [{ count: saved }, { data: dup }] = await Promise.all([
    sb.from('student_definitions').select('id', { count: 'exact', head: true }).eq('identity', identity),
    sb.from('student_definitions').select(COLS).eq('identity', identity).eq('subject', subject).eq('term_key', key).maybeSingle(),
  ]);
  if (dup) return { added: dup as MyDefinition, already: true };

  // 1. Our own list.
  const fromList = findInList(typed, SUBJECT_INFO[subject].list);
  let found: { term: string; text: string; formula?: string | null; source: DefSource } | null =
    fromList ? { term: fromList.term, text: fromList.text, formula: fromList.formula ?? null, source: 'list' } : null;

  // 2. The shared cache (a term another student already asked for — written or refused).
  if (!found) {
    const { data: hit } = await sb.from('definition_cache').select('term, text, formula, source, refusal')
      .eq('subject', subject).eq('term_key', key).maybeSingle();
    if (hit?.refusal) return { message: refusalLine(hit.refusal, typed, subject) };
    if (hit?.text) found = { term: hit.term, text: hit.text, formula: hit.formula, source: hit.source };
  }

  const gate = addAllowed(saved ?? 0, found ? 0 : await writesToday(identity), !found);
  if (gate !== 'ok') return { message: refusalLine(gate, typed, subject) };

  // 3. The writer, grounded on the bank when the bank has the term.
  if (!found) {
    const grounding = await bankGrounding(subject, typed);
    await sb.from('portal_event_log').insert({ identity, kind: 'definition:write', detail: { subject, term: typed } }).then(() => {}, () => {});
    const verdict = await writeDefinition(typed, subject, grounding);
    if (!verdict.ok) {
      if (verdict.why !== 'bad_reply') {
        await sb.from('definition_cache').upsert({ subject, term_key: key, term: typed, refusal: verdict.why }, { onConflict: 'subject,term_key' }).then(() => {}, () => {});
      }
      return { message: refusalLine(verdict.why, typed, subject) };
    }
    found = { term: verdict.term, text: verdict.text, formula: verdict.formula ?? null, source: grounding ? 'notes' : 'written' };
    const rows = [{ subject, term_key: key, term: found.term, text: found.text, formula: found.formula, source: found.source }];
    const fixedKey = termKey(found.term);
    if (fixedKey !== key) rows.push({ ...rows[0], term_key: fixedKey });
    await sb.from('definition_cache').upsert(rows, { onConflict: 'subject,term_key' }).then(() => {}, () => {});
  }

  // A corrected spelling may land on a term the student already has.
  const finalKey = termKey(found.term);
  if (finalKey !== key) {
    const { data: dup2 } = await sb.from('student_definitions').select(COLS)
      .eq('identity', identity).eq('subject', subject).eq('term_key', finalKey).maybeSingle();
    if (dup2) return { added: dup2 as MyDefinition, already: true };
  }

  const { data: row, error } = await sb.from('student_definitions')
    .insert({ identity, subject, term_key: finalKey, term: found.term, text: found.text, formula: found.formula ?? null, source: found.source })
    .select(COLS).single();
  if (error) return { message: refusalLine('busy', typed, subject) };
  return { added: row as MyDefinition };
}

async function writesToday(identity: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await getSupabaseAdmin().from('portal_event_log').select('id', { count: 'exact', head: true })
    .eq('identity', identity).eq('kind', 'definition:write').gte('created_at', since);
  return count ?? 0;
}

/**
 * Past exam questions that ask for this term ("what is meant by …", "define …"),
 * with their scheme answer, as background for the writer. '' when the bank has
 * none or is unreachable. Grounding only — never shown to the student.
 */
async function bankGrounding(subject: DefSubject, term: string): Promise<string> {
  if (!scienceConfigured()) return '';
  const safe = term.toLowerCase().replace(/[^a-z0-9 \-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (safe.length < 3) return '';
  try {
    const out: string[] = [];
    for (const lead of ['meant by', 'define']) {
      const { data } = await getScienceClient().from('questions')
        .select('question_text, answer, solution')
        .eq('subject', subject)
        .or('quarantined.is.null,quarantined.eq.false')
        .ilike('question_text', `%${lead}%${safe}%`)
        .limit(2);
      for (const r of data ?? []) {
        const ans = String(r.answer || r.solution || '').trim();
        if (ans) out.push(`Q: ${String(r.question_text).slice(0, 300)}\nScheme: ${ans.slice(0, 400)}`);
      }
      if (out.length >= 2) break;
    }
    return out.slice(0, 3).join('\n---\n');
  } catch {
    return '';
  }
}

async function writeDefinition(term: string, subject: DefSubject, grounding: string) {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false as const, why: 'bad_reply' as const };
  try {
    const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: MY_DEFINITIONS_MODEL,
      max_tokens: 3000, // Sonnet 5.5 always thinks first; the reply itself is one short line
      messages: [{ role: 'user', content: buildWriterPrompt(term, subject, grounding) }],
    });
    return parseWriterReply(anthropicText(msg), term);
  } catch (e) {
    console.error('[my-definitions] writer failed', e instanceof Error ? e.message : e);
    return { ok: false as const, why: 'bad_reply' as const };
  }
}
