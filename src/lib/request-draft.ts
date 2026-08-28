// Auto-draft a worksheet for a /app/requests "worksheet" request (2026-08-29).
//
// Adrian's spec, verbatim: "possible to automate, but then let me vet the
// output first through telegram then i hit approve or send, then it is send
// out." So this module only ever produces a DRAFT: the PDF goes to Blob and
// to Adrian's Telegram; the student sees nothing until he approves on
// /admin/requests (draft_url → result_url is his tap, never automatic).
//
// Generation rides the SAME rails as the kiosk and the bot's worksheet-on-
// demand (lib/kiosk-pool eligibility + lib/kiosk-draw seeded draw +
// lib/render-bot-worksheet), so the never-worked-solutions /
// never-originating-school invariants hold here by construction — see
// docs/KIOSK.md. Anything this module can't confidently parse simply skips:
// the request stays a normal manual-queue row and Adrian's doorbell ping has
// already gone out.
import type { SupabaseClient } from '@supabase/supabase-js';
import { put } from '@vercel/blob';
import { KIOSK_LEVELS } from './kiosk-session';
import { dailyDraw, drawSeedKey, sgtDate } from './kiosk-draw';
import { fetchWorksheetPool, SEED_LEVELS } from './kiosk-pool';
import { DEFAULT_WORKSHEET_COUNT, worksheetTitle } from './bot-worksheet';
import { renderBotWorksheetPDF } from './render-bot-worksheet';

/**
 * portal_accounts.level → kiosk level keys to try, in order. Sec 3/4 students
 * take AM first (an A-Math topic name can only match an AM list), falling
 * through to EM when the topic lives there instead. Unknown/blank → [] and
 * the request stays manual.
 */
export function levelKeysForPortalLevel(level: string | null | undefined): string[] {
  const key = String(level ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const m = key.match(/^s(?:ec)?([1-4])$/);
  if (m) {
    const n = m[1];
    // Upper sec sits across two syllabi; AM first — an A-Math topic name can
    // only match the AM list, so the order just decides ties like 'Vectors'.
    const keys = n === '3' || n === '4' ? ['AM', 'EM'] : [`S${n}`];
    return keys.filter(k => k in KIOSK_LEVELS);
  }
  if (key === 'jc' || /^jc[12]$/.test(key)) return ['JC2'].filter(k => k in KIOSK_LEVELS);
  return [];
}

/** Word-boundary token string: 'Algebra (Expansion)!' → ' algebra expansion '. */
function tokens(s: string): string {
  const words = String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return words ? ` ${words} ` : '';
}

/**
 * Find which canonical topic a student's free text is asking for. Matching is
 * on whole words ("worksheets" can never hit the topic "Sets"), trying each
 * topic's full name and, for "Family (Part)" names, the part alone — so
 * "something on expansion please" finds "Algebra (Expansion)". Longest match
 * wins; null when nothing matches (the request stays manual).
 */
export function findTopicInText(detail: string | null | undefined, available: string[]): string | null {
  const hay = tokens(detail ?? '');
  if (hay === '') return null;
  let best: { topic: string; len: number } | null = null;
  for (const topic of available) {
    const variants = [topic];
    const part = topic.match(/\(([^()]+)\)/)?.[1];
    if (part && part.replace(/[^a-z0-9]/gi, '').length >= 5) variants.push(part);
    for (const v of variants) {
      const needle = tokens(v);
      if (needle.trim().length < 4) continue; // 'Sets'-sized tokens are too collision-prone
      if (hay.includes(needle) && (!best || needle.length > best.len)) {
        best = { topic, len: needle.length };
      }
    }
  }
  return best?.topic ?? null;
}

/** "exam difficulty", "harder ones", "challenging" → the advanced tier. */
export function tierFromText(detail: string | null | undefined): 'advanced' | null {
  return /\b(exam|hard|harder|difficult|challeng\w*|advanced)\b/i.test(String(detail ?? ''))
    ? 'advanced'
    : null;
}

export interface RequestDraft {
  url: string;
  title: string;
  levelKey: string;
  topic: string;
  tier: 'advanced' | null;
  count: number;
}

/**
 * Generate the draft PDF for one request, or return the reason it was skipped.
 * Never throws for expected shapes (unknown level, no topic match, empty
 * pool) — callers treat a skip as "stays manual".
 */
export async function generateRequestDraft(
  supa: SupabaseClient,
  args: { portalLevel: string | null | undefined; detail: string; requestId: string },
): Promise<RequestDraft | { skip: string }> {
  const levelKeys = levelKeysForPortalLevel(args.portalLevel);
  if (levelKeys.length === 0) return { skip: `no kiosk level for portal level ${JSON.stringify(args.portalLevel ?? null)}` };

  const tier = tierFromText(args.detail);
  for (const levelKey of levelKeys) {
    const cfg = KIOSK_LEVELS[levelKey];
    const topicsRes = await supa.rpc('practice_topics', { p_level: cfg.topicsKey });
    if (topicsRes.error) return { skip: `practice_topics failed: ${topicsRes.error.message}` };
    const topic = findTopicInText(args.detail, (topicsRes.data || []).map((r: { topic: string }) => r.topic));
    if (!topic) continue;

    const pool = await fetchWorksheetPool(supa, {
      seedLevels: SEED_LEVELS[levelKey] ?? cfg.questionLevels,
      topicsKey: cfg.topicsKey,
      topic,
      tier,
    });
    if (pool.error) return { skip: `pool query failed: ${pool.error}` };
    // Tier can empty a pool the mixed draw would serve — retry untiered before
    // giving up on this level.
    const items = pool.items.length > 0 || tier === null
      ? pool.items
      : (await fetchWorksheetPool(supa, {
          seedLevels: SEED_LEVELS[levelKey] ?? cfg.questionLevels,
          topicsKey: cfg.topicsKey,
          topic,
          tier: null,
        })).items;
    if (items.length === 0) return { skip: `empty pool for ${levelKey} · ${topic}` };

    const picked = dailyDraw(items, drawSeedKey(levelKey, topic, tier), DEFAULT_WORKSHEET_COUNT);
    const date = sgtDate();
    const title = worksheetTitle(cfg.label, topic);
    const pdf = await renderBotWorksheetPDF({
      title,
      levelLabel: cfg.label,
      topic,
      tier,
      dateLabel: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-SG', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
      }),
      questions: picked,
      answers: false,
    });
    const blob = await put(`requests/drafts/${args.requestId}.pdf`, pdf, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { url: blob.url, title, levelKey, topic, tier, count: picked.length };
  }
  return { skip: 'no topic matched the request text' };
}
