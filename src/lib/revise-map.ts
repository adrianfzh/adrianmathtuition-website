// Revise-concepts bridge: dropped-mark questions → swipe-card sub-groups.
//
// At release time, one model call maps every dropped-marks question on a paper
// to the ONE sub-group in the content bank whose skill the student should
// revise. The mapping is stored on the run (`result_json.revise`) and rendered
// on /app/marking as "📚 Revise: {concept} →" links into the worked-examples
// swipe player. Fail-soft everywhere: a mapping that can't be built (unknown
// level, no candidates, model refusal) simply means no chips — it must never
// block or delay a release.
//
// Two grounding rules keep the links honest:
//   1. Candidates are ONLY sub-groups that already have published, web-visible
//      worked-example cards — a chip must never land on a "coming soon" page.
//      (AM is fully covered; EM/JC are sparse, so their papers map partially
//      or not at all, which is correct.)
//   2. The model picks FROM the candidate list by id — parseMapperResponse
//      drops anything not in it, so a hallucinated id can't ship a dead link.
//
// Pure logic (level vote, extraction, prompt, parse) lives up top with a
// sibling .test.ts; the orchestrator with I/O is at the bottom.

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';

export const REVISE_MAP_MODEL = 'claude-opus-4-8';

/** Content-bank levels — match `subgroups.level` and /revise URL segments. */
export type BankLevel = 'AM' | 'EM' | 'JC' | 'S1' | 'S2';

export interface DroppedForMapping {
  questionNumber: string;
  lost: number;
  /** Free-text `topic_detected` from the marker — a hint, not bank vocabulary. */
  topic: string | null;
  /** Per-part error summaries + study notes — what actually went wrong. */
  slips: string[];
}

export interface SubgroupCandidate {
  id: number;
  topic: string;
  name: string;
  description: string | null;
}

export interface ReviseItem {
  /** Question number on the paper. */
  for: string;
  subgroup_id: number;
  /** Sub-group name — the chip label. */
  name: string;
  /** Canonical bank topic — the URL path segment (via topicSlug). */
  topic: string;
}

export interface ReviseBlock {
  level: BankLevel;
  items: ReviseItem[];
  mapped_at: string;
}

// Prompt size guard — a 13-dropped-questions paper maps fine, but keep the
// worst case bounded. Biggest losses first, so the cap trims the cheap end.
const MAX_QUESTIONS = 15;

type Json = Record<string, unknown>;
function asRecord(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// ── Level detection ──────────────────────────────────────────────────────────
// `meta.level_detected` is free text and NOISY — real AM papers carry labels
// like "A-Level H2 / JC1 (or Additional Maths)" on individual questions. So:
// classify each question's string independently, then majority-vote the paper.
// Subject markers (A-Math / E-Math) outrank level markers (H2/JC) because a
// combined label on a school paper almost always means the marker hedged about
// an O-Level question, not that a JC paper mentioned Additional Maths.

export function classifyLevelString(s: string): BankLevel | null {
  const t = s.toLowerCase();
  // Bare "additional"/"elementary" count too — "Additional/E-Maths" puts the
  // word far from "math". Word boundaries stop "the mathematics" reading as
  // "e math" and "NA math" as "a math".
  const am = /\badditional\b|\ba[-\s]?math|\badd\s*math|4049/.test(t);
  const em = /\belementary\b|\be[-\s]?math|4048/.test(t);
  if (am && em) return null; // "Additional/E-Maths" — the marker itself hedged
  if (am) return 'AM';
  if (em) return 'EM';
  if (/\bh[12]\b|\bjc\d?\b|a[-\s]?levels?\b/.test(t)) return 'JC';
  if (/\bsec(?:ondary)?\s*1\b/.test(t)) return 'S1';
  if (/\bsec(?:ondary)?\s*2\b/.test(t)) return 'S2';
  return null; // plain "O-Level", "IGCSE", etc — no vote
}

export function detectBankLevel(resultJson: unknown): BankLevel | null {
  const results = asRecord(resultJson)?.results;
  if (!Array.isArray(results)) return null;

  const votes = new Map<BankLevel, number>();
  for (const raw of results) {
    const r = asRecord(raw);
    const meta = asRecord(asRecord(r?.marking_output)?.meta);
    const label = str(meta?.level_detected);
    if (!label) continue;
    const level = classifyLevelString(label);
    if (level) votes.set(level, (votes.get(level) ?? 0) + 1);
  }
  if (!votes.size) return null;

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  // A tie means the paper's identity is genuinely unclear — no mapping beats a
  // wrong one that links a Sec 4 student into JC content.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

// ── Dropped-question extraction ──────────────────────────────────────────────

export function extractDroppedForMapping(resultJson: unknown): DroppedForMapping[] {
  const results = asRecord(resultJson)?.results;
  if (!Array.isArray(results)) return [];

  const out: DroppedForMapping[] = [];
  for (const raw of results) {
    const r = asRecord(raw);
    const marking = asRecord(r?.marking);
    if (!marking) continue;
    const max = num(marking.total_max);
    const awarded = num(marking.total_awarded);
    if (max <= 0 || awarded >= max) continue;

    const meta = asRecord(asRecord(r?.marking_output)?.meta);
    const slips: string[] = [];
    const parts = Array.isArray(marking.parts) ? marking.parts : [];
    for (const p of parts) {
      const part = asRecord(p);
      if (!part) continue;
      if (num(part.awarded) >= num(part.max)) continue;
      for (const field of ['error_summary', 'study_note'] as const) {
        const text = str(part[field]);
        if (text) slips.push(text);
      }
    }

    out.push({
      questionNumber: str(r?.question_number) || '?',
      lost: max - awarded,
      topic: str(meta?.topic_detected) || null,
      slips,
    });
  }

  return out
    .sort((a, b) => b.lost - a.lost || a.questionNumber.localeCompare(b.questionNumber))
    .slice(0, MAX_QUESTIONS);
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export function buildMapperPrompt(
  dropped: DroppedForMapping[],
  candidates: SubgroupCandidate[]
): string {
  const questionLines = dropped.map(q => {
    const bits = [`Q${q.questionNumber} (lost ${q.lost} mark${q.lost === 1 ? '' : 's'})`];
    if (q.topic) bits.push(`topic: ${q.topic}`);
    if (q.slips.length) bits.push(`what went wrong: ${q.slips.slice(0, 6).join(' | ')}`);
    return '- ' + bits.join(' — ');
  });

  const candidateLines = candidates.map(
    c => `${c.id} | ${c.topic} | ${c.name}${c.description ? ` — ${c.description}` : ''}`
  );

  return `A student dropped marks on these questions in a Singapore school maths paper:

${questionLines.join('\n')}

Below is the full list of revision sub-skills we have worked-example cards for, as "id | topic | name — description":

${candidateLines.join('\n')}

For each question, pick the ONE sub-skill the student most needs to revise to fix what went wrong — judged by the errors, not just the topic label. Only map a question when a sub-skill genuinely covers its weakness; if nothing in the list fits, leave that question out rather than stretching.

Reply with ONLY a JSON object (no markdown fences):
{"items":[{"for":"<question number without the Q prefix, e.g. 10>","subgroup_id":<id from the list>}]}`;
}

// ── Response parsing ─────────────────────────────────────────────────────────

export function parseMapperResponse(
  text: string,
  candidates: SubgroupCandidate[],
  dropped: DroppedForMapping[]
): ReviseItem[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }

  const items = asRecord(raw)?.items;
  if (!Array.isArray(items)) return [];

  const byId = new Map(candidates.map(c => [c.id, c]));
  const validFor = new Set(dropped.map(q => q.questionNumber));
  const seen = new Set<string>();
  const out: ReviseItem[] = [];

  for (const rawItem of items) {
    const item = asRecord(rawItem);
    if (!item) continue;
    // The prompt displays questions as "Q10", so models echo the prefix back
    // despite instructions — accept both spellings.
    const forQ = str(item.for).replace(/^q/i, '');
    const candidate = byId.get(num(item.subgroup_id));
    // Every reject here is a hallucination guard: unknown id, a question we
    // never asked about, or a second answer for the same question.
    if (!candidate || !validFor.has(forQ) || seen.has(forQ)) continue;
    seen.add(forQ);
    out.push({
      for: forQ,
      subgroup_id: candidate.id,
      name: candidate.name,
      topic: candidate.topic,
    });
  }
  return out;
}

// ── Orchestrator (I/O) ───────────────────────────────────────────────────────

/**
 * Build the revise block for one run's result_json, or null when there is
 * nothing to map (full marks, undetectable level, no covered content, model
 * came back empty). One model call per paper. Throws only on I/O errors —
 * callers treat any throw as "no mapping this time".
 */
export async function buildReviseBlock(resultJson: unknown): Promise<ReviseBlock | null> {
  const level = detectBankLevel(resultJson);
  const dropped = extractDroppedForMapping(resultJson);
  if (!level || !dropped.length) return null;

  const supa = getSupabaseAdmin();

  // Grounding rule 1: only sub-groups with published, web-visible worked
  // examples. The whole bank is a few hundred cards per level — one page.
  const { data: cards, error: cardsErr } = await supa
    .from('content_snippets')
    .select('subgroup_id')
    .eq('level', level)
    .eq('content_kind', 'worked_example')
    .eq('is_published', true)
    .in('feature', ['both', 'web'])
    .limit(2000);
  if (cardsErr) throw new Error(`content_snippets: ${cardsErr.message}`);
  const coveredIds = [...new Set((cards ?? []).map(c => c.subgroup_id).filter(Boolean))];
  if (!coveredIds.length) return null;

  const { data: sgs, error: sgErr } = await supa
    .from('subgroups')
    .select('id, topic, name, description')
    .in('id', coveredIds)
    .order('topic')
    .order('id');
  if (sgErr) throw new Error(`subgroups: ${sgErr.message}`);
  const candidates = (sgs ?? []) as SubgroupCandidate[];
  if (!candidates.length) return null;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: REVISE_MAP_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: buildMapperPrompt(dropped, candidates) }],
  });
  const text = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { text: string }).text)
    .join('');

  const items = parseMapperResponse(text, candidates, dropped);
  if (!items.length) return null;
  return { level, items, mapped_at: new Date().toISOString() };
}
