// Reading a photo a student added to My Notebook (SPEC-NOTEBOOK-V2 §7, Adrian
// 11 Sep 2026: "yes do OCR, auto-tagging" — and no switch: "it's default for
// everyone"). Two cheap model calls, after the response, fail-soft:
//
//   1. Vision (Claude Haiku): the words on the page (OCR — search's raw material)
//      and the ONE canonical topic the page is mostly about, chosen from the
//      lists for the student's own levels — the same vocabulary the picker and
//      the bank use, so a guess is never a stranger's label.
//   2. Text: the bank sub-skill (`subgroups.name`) for that topic — the same
//      filing the bot gives an ask (bot lib/ask-skill.js) and Find uses.
//
// Written to portal_notes: ocr_text, auto_topic, auto_skill, ocr_at — and
// `topic` itself when the student left it blank, so the gallery's chips and the
// later search see it without anyone typing. Nothing here blocks the upload.
//
// The pure pieces (prompt text, parsing, level mapping) are tested; the model
// call and the row update live in readPhotoForNotebook.
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTopicsForPaperLevel } from './canonical-topics';

export const PHOTO_TAG_MODEL = 'claude-haiku-4-5-20251001';
/** OCR text kept per photo — enough for search, not a transcript of a textbook. */
export const MAX_OCR_CHARS = 4000;

export interface PhotoRead {
  text: string;
  topic: string | null;
  /** The QB level key the topic was found under ('AM', 'S3_EM', 'JC2', …). */
  levelKey: string | null;
}

export interface LevelTopics { key: string; topics: string[] }

/** The canonical topics for each of the student's QB level keys, deduped per key. */
export function levelTopicsFor(levelKeys: readonly string[]): LevelTopics[] {
  const out: LevelTopics[] = [];
  for (const key of levelKeys) {
    const topics = [...new Set(getTopicsForPaperLevel(key).flatMap(c => c.topics))];
    if (topics.length) out.push({ key, topics });
  }
  return out;
}

/** The `subgroups.level` a QB level key files under. */
export function subgroupLevelFor(levelKey: string | null | undefined): string | null {
  const k = String(levelKey || '').toUpperCase();
  if (!k) return null;
  if (k === 'AM' || k === 'S3_AM') return 'AM';
  if (k === 'EM' || k === 'S3_EM' || k === 'EM_NA') return 'EM';
  if (k === 'S1') return 'S1';
  if (k === 'S2') return 'S2';
  if (k.startsWith('JC')) return 'JC';
  return null;
}

export function buildPhotoReadPrompt(levels: LevelTopics[]): string {
  const lists = levels.map(l => `${l.key}: ${l.topics.join(' | ')}`).join('\n');
  return [
    'This is a photo of a Singapore secondary or JC maths student\'s own paper — school notes, a worksheet, homework, or a textbook page.',
    'Do two things and reply with ONLY a JSON object, no prose:',
    '1. "text": the words and maths on the page, transcribed plainly (plain text, LaTeX-free, keep line breaks; skip decorations). Empty string if there is no readable text.',
    '2. "topic" and "level": the ONE topic the page is mostly about, copied VERBATIM from the lists below, with the level key it sits under. null for both if none fits or the page is not maths.',
    '',
    lists,
    '',
    'Format: {"text": "...", "level": "AM", "topic": "Trigonometry (Identities)"}',
  ].join('\n');
}

/** Parse the vision reply: text clipped, topic snapped to the allowed lists (case-insensitive), else null. */
export function parsePhotoRead(raw: string, levels: LevelTopics[]): PhotoRead {
  let obj: Record<string, unknown> = {};
  try {
    const s = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    obj = JSON.parse(s) as Record<string, unknown>;
  } catch { /* falls through to empty */ }
  const text = typeof obj.text === 'string' ? obj.text.trim().slice(0, MAX_OCR_CHARS) : '';
  const wantTopic = typeof obj.topic === 'string' ? obj.topic.trim().toLowerCase() : '';
  const wantLevel = typeof obj.level === 'string' ? obj.level.trim().toUpperCase() : '';
  let topic: string | null = null;
  let levelKey: string | null = null;
  if (wantTopic) {
    // Prefer the level the model named; fall back to any level that lists the topic.
    const ordered = [...levels].sort((a, b) => (a.key.toUpperCase() === wantLevel ? -1 : 0) - (b.key.toUpperCase() === wantLevel ? -1 : 0));
    for (const l of ordered) {
      const hit = l.topics.find(t => t.toLowerCase() === wantTopic);
      if (hit) { topic = hit; levelKey = l.key; break; }
    }
  }
  return { text, topic, levelKey };
}

export interface SubgroupRow { id: number; name: string; description: string | null }

export function buildSubgroupPrompt(topic: string, subs: SubgroupRow[], ocrText: string): string {
  const list = subs.map(s => `- id ${s.id}: ${s.name}${s.description ? ` — ${s.description.slice(0, 220)}` : ''}`).join('\n');
  return [
    `Sub-skills of the topic "${topic}":`,
    list,
    '',
    'The page (transcribed):',
    ocrText.slice(0, 2500),
    '',
    'Which ONE sub-skill is this page mostly about? Reply with ONLY {"id": <number>} — or {"id": null} if none fits.',
  ].join('\n');
}

/** Parse the sub-skill reply: the chosen row, or null when the id is missing or not in the list. */
export function parseSubgroupChoice(raw: string, subs: SubgroupRow[]): SubgroupRow | null {
  try {
    const s = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const obj = JSON.parse(s) as { id?: unknown };
    const id = typeof obj.id === 'number' ? obj.id : typeof obj.id === 'string' && /^\d+$/.test(obj.id) ? Number(obj.id) : null;
    if (id == null) return null;
    return subs.find(r => r.id === id) ?? null;
  } catch {
    return null;
  }
}

function textOf(msg: Anthropic.Message): string {
  return msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
}

/**
 * Read one saved photo and stamp the row. Never throws; every failure is a
 * warning and the row simply stays unread (ocr_at null), so a later sweep can
 * retry. `topicWasBlank` → the guessed topic is also written to `topic`.
 */
export async function readPhotoForNotebook(opts: {
  svc: SupabaseClient;
  noteId: string;
  image: { data: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' };
  levelKeys: readonly string[];
  topicWasBlank: boolean;
}): Promise<{ topic: string | null; skill: string | null; chars: number } | null> {
  try {
    const levels = levelTopicsFor(opts.levelKeys);
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const first = await anthropic.messages.create({
      model: PHOTO_TAG_MODEL,
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: opts.image.mediaType, data: opts.image.data } },
          { type: 'text', text: buildPhotoReadPrompt(levels) },
        ],
      }],
    });
    const read = parsePhotoRead(textOf(first), levels);

    let skill: string | null = null;
    if (read.topic) {
      const level = subgroupLevelFor(read.levelKey);
      let q = opts.svc.from('subgroups').select('id, name, description').eq('topic', read.topic);
      if (level) q = q.eq('level', level);
      const { data: subs } = await q;
      const rows = (subs ?? []) as SubgroupRow[];
      if (rows.length && read.text) {
        const second = await anthropic.messages.create({
          model: PHOTO_TAG_MODEL,
          max_tokens: 60,
          messages: [{ role: 'user', content: buildSubgroupPrompt(read.topic, rows, read.text) }],
        });
        skill = parseSubgroupChoice(textOf(second), rows)?.name ?? null;
      }
    }

    const patch: Record<string, unknown> = {
      ocr_text: read.text || null, auto_topic: read.topic, auto_skill: skill, ocr_at: new Date().toISOString(),
    };
    if (opts.topicWasBlank && read.topic) patch.topic = read.topic;
    const { error } = await opts.svc.from('portal_notes').update(patch).eq('id', opts.noteId);
    if (error) throw error;
    console.log(`[photo-tag] ${opts.noteId.slice(0, 8)} ${read.text.length} chars → ${read.topic ?? '(no topic)'}${skill ? ` · ${skill}` : ''}`);
    return { topic: read.topic, skill, chars: read.text.length };
  } catch (e) {
    console.warn('[photo-tag] skipped:', (e as Error).message);
    return null;
  }
}
