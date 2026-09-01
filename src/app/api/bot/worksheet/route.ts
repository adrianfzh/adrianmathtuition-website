// POST /api/bot/worksheet — worksheet-on-demand for the Telegram/WhatsApp bot.
//
// A student or parent asks the bot for practice on a topic; the bot POSTs here
// and gets back a public Blob URL to Adrian's house-style A4 PDF, which it
// forwards as a link. The WEB half is this route; the bot command is built
// against the contract below.
//
// Auth: header `x-render-secret` === env RENDER_MARKING_SECRET (the same
// bot↔website handshake /api/explanations uses).
//
// Body:
//   { level: string,            // a questions.level value ('S3_AM', 'JC2', 'EM', …)
//     topic: string,            // canonical topic; matched case/punctuation-insensitively
//     tier?: 'standard'|'advanced',   // omitted / anything else = Mixed
//     count?: number,           // default 8, hard cap 12
//     answers?: boolean,        // default false → no Answers page
//     dry?: true }              // health-check probe, see below
//
// Response 200:
//   { url, title, count, questionIds, filename, level, topic, tier, answers }
// Dry mode  200: { ok: true, poolSize, level, topic, tier }  — no PDF, no Blob.
// 400 on an unknown level (`validLevels`) or topic (`validTopics` for the level).
// 404 when the level+topic+tier pool is empty.
//
// The sheet is the SAME deterministic daily draw the kiosk prints
// (lib/kiosk-draw seeded on SGT-date|level|topic|tier over the full eligible
// pool) — a second request the same day returns the same questions at the same
// Blob URL. Eligibility comes from lib/kiosk-pool, so the never-worked-solutions
// / never-originating-school invariants hold here by construction.

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { put } from '@vercel/blob';
import { getSupabaseAdmin } from '@/lib/supabase';
import { KIOSK_LEVELS } from '@/lib/kiosk-session';
import { normalizeTier } from '@/lib/practice-tiers';
import { dailyDraw, drawSeedKey, sgtDate } from '@/lib/kiosk-draw';
import { fetchWorksheetPool, SEED_LEVELS } from '@/lib/kiosk-pool';
import {
  clampCount, matchTopic, resolveLevelKey, validLevels,
  worksheetBlobPath, worksheetFilename, worksheetTitle,
} from '@/lib/bot-worksheet';
import { renderBotWorksheetPDF } from '@/lib/render-bot-worksheet';

export const runtime = 'nodejs';
// Puppeteer cold start + KaTeX font fetch push past the 10s default.
export const maxDuration = 60;

function bad(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

/** '2026-08-22' → '22 Aug 2026' for the header line. */
function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-render-secret');
  if (!secret || !process.env.RENDER_MARKING_SECRET || !safeEqual(secret, process.env.RENDER_MARKING_SECRET)) {
    return bad(401, { error: 'Unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, { error: 'invalid JSON body' });
  }

  const levelKey = resolveLevelKey(body.level as string);
  if (!levelKey) {
    return bad(400, {
      error: `unknown level ${JSON.stringify(String(body.level ?? ''))}`,
      validLevels: validLevels(),
    });
  }
  const cfg = KIOSK_LEVELS[levelKey];
  const tier = normalizeTier(body.tier as string | null); // null = Mixed
  const dry = body.dry === true;

  const supa = getSupabaseAdmin();

  // Topic must be one the level actually has — the 400 lists them so the bot can
  // show the student a menu instead of a dead end.
  const topicsRes = await supa.rpc('practice_topics', { p_level: cfg.topicsKey });
  if (topicsRes.error) return bad(500, { error: topicsRes.error.message });
  const available = (topicsRes.data || []).map((r: { topic: string }) => r.topic);
  const topic = matchTopic(body.topic as string, available);
  if (!topic) {
    return bad(400, {
      error: `unknown topic ${JSON.stringify(String(body.topic ?? ''))} for ${cfg.label}`,
      level: levelKey,
      validTopics: available,
    });
  }

  const pool = await fetchWorksheetPool(supa, {
    seedLevels: SEED_LEVELS[levelKey] ?? cfg.questionLevels,
    topicsKey: cfg.topicsKey,
    topic,
    tier,
  });
  if (pool.error) return bad(500, { error: pool.error });

  // Dry mode: the health-check probe. Proves auth + level/topic resolution + the
  // pool query all still work, with zero Puppeteer or Blob work.
  if (dry) {
    return NextResponse.json({
      ok: true,
      poolSize: pool.items.length,
      level: levelKey,
      topic,
      tier: tier ?? 'mixed',
    });
  }

  if (pool.items.length === 0) {
    return bad(404, {
      error: `no questions available for ${cfg.label} · ${topic}${tier ? ` (${tier})` : ''}`,
      level: levelKey, topic, tier: tier ?? 'mixed', poolSize: 0,
    });
  }

  const count = clampCount(body.count);
  const answers = body.answers === true;
  const date = sgtDate();
  // Same seed as the kiosk: two students asking for the same sheet on the same
  // day get the same questions, and asking for more extends one shared order.
  const picked = dailyDraw(pool.items, drawSeedKey(levelKey, topic, tier), count);
  const title = worksheetTitle(cfg.label, topic);

  const pdf = await renderBotWorksheetPDF({
    title,
    levelLabel: cfg.label,
    topic,
    tier,
    dateLabel: dateLabel(date),
    questions: picked,
    answers,
  });

  const questionIds = picked.map((q) => q.id);
  const blob = await put(
    worksheetBlobPath({ date, levelKey, topic, tier, count: picked.length, answers, questionIds }),
    pdf,
    {
      access: 'public',
      contentType: 'application/pdf',
      // Deterministic path + overwrite: re-asking for the same sheet the same
      // day lands on the SAME url instead of littering the store.
      addRandomSuffix: false,
      allowOverwrite: true,
    },
  );

  return NextResponse.json({
    url: blob.url,
    title,
    count: picked.length,
    questionIds,
    // Handy for Telegram sendDocument, which otherwise names the file after the
    // blob path's random-looking tail.
    filename: worksheetFilename(levelKey, topic, date),
    level: levelKey,
    topic,
    tier: tier ?? 'mixed',
    answers,
  });
}
