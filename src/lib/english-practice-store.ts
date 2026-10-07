// English practice — the I/O half. Pure rules live in lib/english-practice.ts.
// SPEC-ENGLISH-PRACTICE.md.
//
// 7 Oct 2026: the page serves ONLY our own sets (lib/english-own-data.ts, written by us —
// docs/HANDOFF-ENGLISH-BUILD.md step 1). The language bank is not read here at all: no school
// or national passage, question or scheme reaches a student (docs/CONTENT-POLICY.md).
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './supabase';
import { sgtDayStartISO } from './sgt';
import { anthropicText } from './claude-models';
import {
  DAILY_ENGLISH_MODEL_CAP, ENGLISH_CHECK_MODEL,
  buildShortPrompt, buildSummaryPrompt, parseShortReply, parseSummaryReply, ruleShort, summaryContentMax, withinLimit,
  type EditingSet, type ShortVerdict, type SummaryVerdict, type Unit,
} from './english-practice';
import { isEditing, ownEditingSet, ownPassage, ownUnits, ownUuid, type OwnReading, type VisualBlock, type VisualTheme } from './english-own';
import { OWN_EDITING, OWN_READING, ownByUuid } from './english-own-data';

// ── Editing ─────────────────────────────────────────────────────────────────
export interface EditingListing { itemId: string; about: string }

export async function loadEditingList(): Promise<EditingListing[]> {
  return OWN_EDITING.map(s => ({ itemId: ownUuid(s.id), about: s.about }));
}

export async function loadEditingSet(id: string): Promise<EditingSet | null> {
  const s = ownByUuid(id);
  return s && isEditing(s) ? ownEditingSet(s) : null;
}

// ── Reading sets: one text and the questions on it ──────────────────────────
export interface ReadingListing { textId: string; label: string; group: 'visual' | 'narrative' | 'non_narrative'; questions: number; marks: number; summary: boolean }
export interface ReadingSet {
  textId: string; title: string; group: ReadingListing['group'];
  paragraphs: string[] | null;
  visual: { format: string; theme: VisualTheme; blocks: VisualBlock[] } | null;
  units: Unit[];
}

const reading = (id: string): OwnReading | null => {
  const s = ownByUuid(id);
  return s && !isEditing(s) ? s : null;
};

export async function loadReadingList(): Promise<ReadingListing[]> {
  return OWN_READING.map(s => {
    const us = ownUnits(s);
    return { textId: ownUuid(s.id), label: s.title, group: s.kind, questions: us.length,
      marks: us.reduce((n, u) => n + (u.kind === 'summary' ? 0 : u.marks), 0), summary: us.some(u => u.kind === 'summary') };
  });
}

export async function loadReadingSet(textId: string): Promise<ReadingSet | null> {
  const s = reading(textId);
  if (!s) return null;
  return {
    textId: ownUuid(s.id), title: s.title, group: s.kind,
    paragraphs: s.kind === 'visual' ? null : (s.paragraphs ?? []),
    visual: s.kind === 'visual' ? { format: s.format ?? 'poster', theme: s.theme ?? 'teal', blocks: s.visual ?? [] } : null,
    units: ownUnits(s),
  };
}

/** One unit with its passage (for the check). */
export async function loadUnit(itemId: string, key: string): Promise<{ unit: Unit; passage: string } | null> {
  const s = reading(itemId);
  const unit = s ? ownUnits(s).find(u => u.key === key) : undefined;
  return s && unit ? { unit, passage: ownPassage(s) } : null;
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

const ruled = (unit: Unit, right: boolean): ShortCheck =>
  ({ state: 'marked', usedModel: false, verdict: { awarded: right ? unit.marks : 0, why: right ? 'That is the answer.' : 'That is not the answer.', missing: null } });

/** The reading itself, with no cap and no log — the page's check and the bench (scripts/english-bench) share it. */
export async function judgeShort(unit: Unit, answer: string, passage: string): Promise<ShortCheck> {
  const rule = ruleShort(unit, answer);
  if (rule !== null) return ruled(unit, rule);
  const text = await ask(buildShortPrompt(unit, answer, passage), 3000);
  const verdict = text ? parseShortReply(text, unit.marks) : null;
  return verdict ? { state: 'marked', verdict, usedModel: true } : { state: 'failed' };
}

/** A short answer: the free rule first; a judgement goes to one reading against the scheme. */
export async function checkShort(unit: Unit, answer: string, passage: string, identity: string): Promise<ShortCheck> {
  const rule = ruleShort(unit, answer);
  if (rule !== null) return ruled(unit, rule);
  if ((await modelChecksToday(identity).catch(() => DAILY_ENGLISH_MODEL_CAP)) >= DAILY_ENGLISH_MODEL_CAP) return { state: 'capped' };
  return judgeShort(unit, answer, passage);
}

export type SummaryCheck =
  | { state: 'marked'; verdict: SummaryVerdict; contentMax: number; content: number }
  | { state: 'capped' } | { state: 'failed' };

export async function checkSummary(unit: Unit, answer: string, passage: string, identity: string): Promise<SummaryCheck> {
  if ((await modelChecksToday(identity).catch(() => DAILY_ENGLISH_MODEL_CAP)) >= DAILY_ENGLISH_MODEL_CAP) return { state: 'capped' };
  return judgeSummary(unit, answer, passage);
}

/** The summary reading itself, with no cap — shared with the bench. */
export async function judgeSummary(unit: Unit, answer: string, passage: string): Promise<SummaryCheck> {
  const text = await ask(buildSummaryPrompt(unit, withinLimit(answer), passage), 5000);
  const verdict = text ? parseSummaryReply(text, unit.scheme.points.length) : null;
  if (!verdict) return { state: 'failed' };
  const contentMax = summaryContentMax(unit.scheme);
  return { state: 'marked', verdict, contentMax, content: Math.min(contentMax, verdict.hit.length) };
}
