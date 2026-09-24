// One photo → what it shows (the bot's /api/portal-classify: text, ONE
// sub-skill, marks) + a bank seed under that sub-skill the student may see.
// Extracted from /api/portal/practice/photo (23 Sep 2026) on 24 Sep 2026 so
// the practice SHEET route (SPEC-PRACTICE-PHOTO §14) files each of its photos
// the same way. The single-question route keeps its own copy of this flow
// until it is retired; the rules are identical.
import type { SupabaseClient } from '@supabase/supabase-js';
import { practiceEligibility } from '@/lib/portal-find';
import { qbLevelsFor, bankScope } from '@/lib/qb-levels';
import { questionServableTo, type SubgroupAudienceRow } from '@/lib/subgroup-visibility';
import { parseClassification, pickSeed, type PhotoClassification, type SeedCandidate, type SeedPick } from '@/lib/practice-photo';

export type ClassifyAccount = { id: string; level: string | null; subjects: string[] | null; is_ip: boolean | null };

type SeedRow = SeedCandidate & {
  deleted_at: string | null; school: string | null; national: boolean | null; legacy_syllabus: boolean | null;
  flagged_count: number | null; verified: boolean | null; question_text: string | null; has_image: boolean | null;
  image_url: string | null; parts: unknown;
};

export type ClassifiedPhoto =
  | { ok: true; classification: PhotoClassification; seed: SeedPick | null }
  | { ok: false; status: number; error: string; reason?: string | null };

export type BotDoor = { botBase: string; botSecret: string };

/** The bot's read of one photo. `null` = the bot could not be reached or answered nonsense. */
export async function classifyImage(door: BotDoor, imageBase64: string, level: string, timeoutMs = 50_000): Promise<PhotoClassification | null> {
  const r = await fetch(`${door.botBase}/api/portal-classify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${door.botSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, level }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await r.json().catch(() => null);
  return parseClassification(raw);
}

/** A bank question under the photo's sub-skill this student may see, closest in marks; null when none. */
export async function seedFor(
  admin: SupabaseClient,
  account: ClassifyAccount,
  c: PhotoClassification,
  avoidId: string | null,
): Promise<SeedPick | null> {
  if (!c.subgroup) return null;
  const viewer = {
    levels: qbLevelsFor(account.level, account.subjects).map(l => bankScope(l.key).level),
    isIp: Boolean(account.is_ip),
  };
  const { data: sg } = await admin.from('subgroups').select('level, visibility, ip_extra_level')
    .eq('id', c.subgroup.id).maybeSingle<SubgroupAudienceRow>();
  if (!sg || !questionServableTo([sg], viewer)) return null;
  const { data: filings } = await admin.from('question_subgroups')
    .select('question_id, questions!inner(id, total_marks, difficulty, ai_generated, reported_at, deleted_at, school, national, legacy_syllabus, flagged_count, verified, question_text, has_image, image_url, parts)')
    .eq('subgroup_id', c.subgroup.id).is('questions.deleted_at', null).limit(400);
  const rows: SeedRow[] = [];
  for (const f of (filings ?? []) as unknown as { questions: SeedRow | SeedRow[] | null }[]) {
    const q = Array.isArray(f.questions) ? f.questions[0] : f.questions;
    if (q && practiceEligibility(q as unknown as Parameters<typeof practiceEligibility>[0]).ok) rows.push(q);
  }
  return pickSeed(rows, { marks: c.marks, avoidId });
}

/** Classify one photo and pick its seed. Refusals carry the student-facing line. */
export async function classifyPhoto(
  admin: SupabaseClient,
  account: ClassifyAccount,
  door: BotDoor,
  input: { imageBase64: string; level: string; avoidId?: string | null },
  messages: { unreadable: string; unfiled?: string },
): Promise<ClassifiedPhoto> {
  let c: PhotoClassification | null;
  try {
    c = await classifyImage(door, input.imageBase64, input.level);
  } catch {
    return { ok: false, status: 502, error: 'Could not read the photo right now — try again in a minute.' };
  }
  if (!c) return { ok: false, status: 502, error: 'Could not read the photo right now — try again in a minute.' };
  if (!c.extractedText.trim()) return { ok: false, status: 422, error: messages.unreadable, reason: c.reason };
  if (!c.subgroup && messages.unfiled) return { ok: false, status: 422, error: messages.unfiled, reason: c.reason };
  const seed = await seedFor(admin, account, c, input.avoidId ?? null).catch(() => null);
  return { ok: true, classification: c, seed };
}
