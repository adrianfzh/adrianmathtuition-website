// English practice — the I/O half (service key; the language bank and the attempts table
// have RLS with no policies). Pure rules live in lib/english-practice.ts.
// SPEC-ENGLISH-PRACTICE.md. Nothing here returns a school, a year or a file name.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './supabase';
import { sgtDayStartISO } from './sgt';
import { anthropicText } from './claude-models';
import {
  DAILY_ENGLISH_MODEL_CAP, ENGLISH_CHECK_MODEL, ENGLISH_PRACTICE_LEVELS, READING_KINDS,
  buildShortPrompt, buildSummaryPrompt, parseShortReply, parseSummaryReply, passageLabel, ruleShort, summaryContentMax,
  toEditingSet, unitsOf, withinLimit,
  type EditingSet, type ItemRow, type ShortVerdict, type SummaryVerdict, type Unit,
} from './english-practice';

const ITEM_COLS = 'id, section_kind, question_number, question_text, options, parts, total_marks, answer, text_id, level, national, answer_source, deleted_at';
const IMAGE_BUCKET = 'language_images';

function itemsQuery() {
  return getSupabaseAdmin().from('language_items').select(ITEM_COLS)
    .eq('subject', 'english').eq('national', false).is('deleted_at', null).eq('answer_source', 'mark_scheme')
    .in('level', [...ENGLISH_PRACTICE_LEVELS]);
}

// ── Editing ─────────────────────────────────────────────────────────────────
export interface EditingListing { itemId: string; about: string }

/** "… about Singapore’s mangroves." in the instructions → the passage's topic. */
export function editingAbout(text: string): string {
  const m = /\babout\s+([^.\n]{3,90})\./i.exec(text);
  return m ? m[1].trim().replace(/^./, c => c.toUpperCase()) : 'A short passage';
}

export async function loadEditingList(): Promise<EditingListing[]> {
  const { data, error } = await itemsQuery().eq('section_kind', 'editing').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ItemRow[]).map(toEditingSet).filter((s): s is EditingSet => !!s)
    .map(s => ({ itemId: s.itemId, about: editingAbout(s.text) }));
}

export async function loadEditingSet(id: string): Promise<EditingSet | null> {
  const { data } = await itemsQuery().eq('section_kind', 'editing').eq('id', id).maybeSingle();
  return data ? toEditingSet(data as ItemRow) : null;
}

// ── Reading sets: one text and the questions on it ──────────────────────────
interface TextRow { id: string; kind: string | null; title: string | null; text: string | null; image: string | null }
export interface ReadingListing { textId: string; label: string; group: 'visual' | 'passage'; questions: number; marks: number; summary: boolean }
export interface ReadingSet { textId: string; title: string | null; text: string; hasImage: boolean; units: Unit[] }

async function loadTexts(ids: string[]): Promise<Map<string, TextRow>> {
  const out = new Map<string, TextRow>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await getSupabaseAdmin().from('language_texts').select('id, kind, title, text, image')
      .in('id', ids.slice(i, i + 150)).eq('national', false).is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const t of (data ?? []) as TextRow[]) out.set(t.id, t);
  }
  return out;
}

const byNumber = (a: Unit, b: Unit): number => (parseFloat(a.number) || 0) - (parseFloat(b.number) || 0) || a.number.localeCompare(b.number);

export async function loadReadingList(): Promise<ReadingListing[]> {
  const { data, error } = await itemsQuery().in('section_kind', [...READING_KINDS]).not('text_id', 'is', null).limit(3000);
  if (error) throw new Error(error.message);
  const groups = new Map<string, Unit[]>();
  for (const r of (data ?? []) as ItemRow[]) {
    const us = unitsOf(r);
    if (us.length && r.text_id) groups.set(r.text_id, [...(groups.get(r.text_id) ?? []), ...us]);
  }
  const texts = await loadTexts([...groups.keys()]);
  const out: ReadingListing[] = [];
  for (const [textId, us] of groups) {
    const t = texts.get(textId);
    if (!t || (!t.text && !t.image)) continue;
    const visual = us.every(u => u.sectionKind === 'visual_text');
    out.push({ textId, label: passageLabel(t.title, t.text), group: visual ? 'visual' : 'passage', questions: us.length,
      marks: us.reduce((s, u) => s + (u.kind === 'summary' ? 0 : u.marks), 0), summary: us.some(u => u.kind === 'summary') });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadReadingSet(textId: string): Promise<ReadingSet | null> {
  const t = (await loadTexts([textId])).get(textId);
  if (!t || (!t.text && !t.image)) return null;
  const { data, error } = await itemsQuery().in('section_kind', [...READING_KINDS]).eq('text_id', textId);
  if (error) throw new Error(error.message);
  const units = ((data ?? []) as ItemRow[]).flatMap(unitsOf).sort(byNumber);
  return units.length ? { textId, title: t.title, text: t.text ?? '', hasImage: !!t.image, units } : null;
}

/** One unit with its passage (for the check). */
export async function loadUnit(itemId: string, key: string): Promise<{ unit: Unit; passage: string } | null> {
  const { data } = await itemsQuery().eq('id', itemId).maybeSingle();
  if (!data) return null;
  const row = data as ItemRow;
  const unit = unitsOf(row).find(u => u.key === key);
  if (!unit) return null;
  const t = row.text_id ? (await loadTexts([row.text_id])).get(row.text_id) : null;
  return { unit, passage: t?.text ?? '' };
}

/** A text's picture, as bytes — its storage name carries the source, so it is never linked directly. */
export async function loadTextImage(textId: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const t = (await loadTexts([textId])).get(textId);
  if (!t?.image) return null;
  const { data, error } = await getSupabaseAdmin().storage.from(IMAGE_BUCKET).download(t.image);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), type: data.type || 'image/png' };
}

// ── Attempts and the day's cap ──────────────────────────────────────────────
export async function modelChecksToday(identity: string): Promise<number> {
  const { count } = await getSupabaseAdmin().from('english_practice_attempts').select('id', { count: 'exact', head: true })
    .eq('identity', identity).eq('used_model', true).gte('created_at', sgtDayStartISO());
  return count ?? 0;
}

export async function logAttempt(row: { identity: string; itemId: string; unit: string; kind: 'editing' | 'short' | 'choice' | 'summary'; answer: string; awarded: number | null; max: number; usedModel: boolean; result?: unknown }): Promise<void> {
  const { error } = await getSupabaseAdmin().from('english_practice_attempts').insert({
    identity: row.identity, item_id: row.itemId, unit: row.unit, kind: row.kind, answer: row.answer.slice(0, 4000),
    awarded: row.awarded, max_marks: row.max, used_model: row.usedModel, result: row.result ?? null,
  });
  if (error) console.error('[english-practice] attempt insert failed:', error.message);
}

async function ask(prompt: string, maxTokens: number): Promise<string | null> {
  try {
    const msg = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: ENGLISH_CHECK_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }],
    });
    // This model always thinks first, and the thinking counts against max_tokens — so the
    // allowance is generous and the reply is read past any thinking block (lib/claude-models).
    const text = anthropicText(msg);
    if (!text) console.error(`[english-practice] no text in the reply (stop: ${msg.stop_reason})`);
    return text;
  } catch (e) {
    console.error('[english-practice] check failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export type ShortCheck =
  | { state: 'marked'; verdict: ShortVerdict; usedModel: boolean }
  | { state: 'capped' } | { state: 'failed' };

/** A short answer: the free rule first; a judgement goes to one reading against the scheme. */
export async function checkShort(unit: Unit, answer: string, passage: string, identity: string): Promise<ShortCheck> {
  const rule = ruleShort(unit, answer);
  if (rule !== null) {
    return { state: 'marked', usedModel: false, verdict: { awarded: rule ? unit.marks : 0, why: rule ? 'That is the answer.' : 'That is not the answer.', missing: null } };
  }
  if ((await modelChecksToday(identity).catch(() => DAILY_ENGLISH_MODEL_CAP)) >= DAILY_ENGLISH_MODEL_CAP) return { state: 'capped' };
  const text = await ask(buildShortPrompt(unit, answer, passage), 3000);
  const verdict = text ? parseShortReply(text, unit.marks) : null;
  return verdict ? { state: 'marked', verdict, usedModel: true } : { state: 'failed' };
}

export type SummaryCheck =
  | { state: 'marked'; verdict: SummaryVerdict; contentMax: number; content: number }
  | { state: 'capped' } | { state: 'failed' };

export async function checkSummary(unit: Unit, answer: string, passage: string, identity: string): Promise<SummaryCheck> {
  if ((await modelChecksToday(identity).catch(() => DAILY_ENGLISH_MODEL_CAP)) >= DAILY_ENGLISH_MODEL_CAP) return { state: 'capped' };
  const text = await ask(buildSummaryPrompt(unit, withinLimit(answer), passage), 5000);
  const verdict = text ? parseSummaryReply(text, unit.scheme.points.length) : null;
  if (!verdict) return { state: 'failed' };
  const contentMax = summaryContentMax(unit.scheme);
  return { state: 'marked', verdict, contentMax, content: Math.min(contentMax, verdict.hit.length) };
}
