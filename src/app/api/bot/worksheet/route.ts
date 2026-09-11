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
//     studentId?: string,       // Airtable rec id of the student the sheet is for —
//                               // resolves the sub-group AUDIENCE (IP students get
//                               // 'ip' sub-groups such as AM Modulus Functions in
//                               // both the topic list and the pool); see
//                               // lib/worksheet-audience.ts
//     isIp?: boolean,           // explicit audience — wins over studentId; neither
//                               // → the ordinary student (what the dry probe gets)
//     dry?: true }              // health-check probe, see below
//
// Response 200:
//   { url, title, count, questionIds, filename, level, topic, tier, answers, isIp }
// Dry mode  200: { ok: true, poolSize, level, topic, tier, isIp }  — no PDF, no Blob.
// 400 on an unknown level (`validLevels`) or topic (`validTopics` for the level —
//     drawn for the SAME audience, so an IP student's menu lists Modulus).
// 404 when the level+topic+tier pool is empty.
//
// The sheet is the SAME deterministic daily draw the kiosk prints
// (lib/kiosk-draw seeded on SGT-date|level|topic|tier over the full eligible
// pool) — a second request the same day returns the same questions at the same
// Blob URL. Eligibility comes from lib/kiosk-pool, so the never-worked-solutions
// / never-originating-school invariants hold here by construction.

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { getSupabaseAdmin } from '@/lib/supabase';
import { KIOSK_LEVELS } from '@/lib/kiosk-session';
import { normalizeTier } from '@/lib/practice-tiers';
import { dailyDraw, drawSeedKey, sgtDate } from '@/lib/kiosk-draw';
import { applyBand, bandKey, parseBand } from '@/lib/marks-band';
import { pickBySkill } from '@/lib/skill-pick';
import { loadSkillFiling, dropSkills } from '@/lib/skill-pick-store';
import { fetchWorksheetPool, SEED_LEVELS } from '@/lib/kiosk-pool';
import {
  clampCount, matchTopic, resolveLevelKey, validLevels,
  worksheetBlobPath, worksheetFilename, worksheetTitle, TtlCache,
} from '@/lib/bot-worksheet';
import { storeBankFile } from '@/lib/bank-pdf-store';
import { renderBotWorksheetPDF } from '@/lib/render-bot-worksheet';
import { worksheetAudienceFor } from '@/lib/worksheet-audience';

export const runtime = 'nodejs';
// Puppeteer cold start + KaTeX font fetch push past the 10s default.
export const maxDuration = 60;

// One topic list per (level, audience) per 10 minutes — see TtlCache.
const topicsCache = new TtlCache<string[]>(10 * 60_000);

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
  // Phase timings, echoed in the response and logged, so a slow sheet says
  // WHERE it was slow (draw vs Chromium vs Blob) instead of being guessed at.
  const t0 = Date.now();
  let tLast = t0;
  const timings: Record<string, number> = {};
  const lap = (k: string) => { const now = Date.now(); timings[k] = now - tLast; tLast = now; };
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

  // Sub-group AUDIENCE (2026-09-02): who is this sheet for? `isIp` if the bot
  // says so, else the student behind `studentId` (active portal account →
  // Airtable Subject Level), else the ordinary student — never admin, and every
  // lookup failure narrows to ordinary (lib/worksheet-audience.ts, unit-tested).
  // Resolved BEFORE the topic list: a topic exists for an audience only while it
  // has a visible sub-group, so an IP student's "Modulus Functions" must match
  // here or the request 400s before the pool is ever asked.
  const audience = await worksheetAudienceFor(supa, { isIp: body.isIp, studentId: body.studentId });
  lap('audience');

  // Topic must be one the level actually has — the 400 lists them so the bot can
  // show the student a menu instead of a dead end.
  const topicsCacheKey = `${cfg.topicsKey}|${audience.isIp ? 'ip' : 'std'}|${audience.admin ? 'admin' : 'student'}`;
  const cachedTopics = topicsCache.get(topicsCacheKey);
  let available: string[];
  if (cachedTopics) {
    available = cachedTopics;
  } else {
    const topicsRes = await supa.rpc('practice_topics', {
      p_level: cfg.topicsKey,
      p_is_ip: audience.isIp,
      p_admin: audience.admin,
    });
    if (topicsRes.error) return bad(500, { error: topicsRes.error.message });
    available = (topicsRes.data || []).map((r: { topic: string }) => r.topic);
    topicsCache.set(topicsCacheKey, available);
  }
  lap('topics');
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
    audience,
  });
  lap('pool');
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
      isIp: audience.isIp,
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
  // Marks band (SPEC-WORKSHEET-MENU): 'standard' | 'intermediate' | 'advanced'
  // | 'a/b/c'. Tertiles of total_marks over THIS pool (lib/marks-band), because
  // `difficulty` is ~98% "Standard" and bands nothing. Mixed = the plain draw.
  const band = parseBand(body.band);
  const bandLabel = bandKey(band);
  // Same seed as the kiosk: two students asking for the same sheet on the same
  // day get the same questions, and asking for more extends one shared order.
  // A banded request seeds on the band too, so it is its own stable draw.
  const seed = drawSeedKey(levelKey, topic, band ? `${tier ?? 'mixed'}|${bandLabel}` : tier);
  // Pick BY SKILL (docs/SKILL-PICK.md, 12 Sep 2026): one question per skill of
  // the topic in syllabus order, the plainest first, second rounds adding the
  // twist — the same rule kinds 2 and 4 use on the Mac. The daily seed is the
  // tie-break, so a day's sheet is still stable. The old daily draw (and the
  // marks bands, kept for API callers) is the fallback for a topic with no
  // skill filing.
  let picked = pool.items;
  let bandFallback = false;
  let skillsOut: { covered: { name: string; n: number }[]; empty: string[]; skipped: string[]; dropped: string[]; unfiled: number } | null = null;
  const filing = band ? null : await loadSkillFiling(supa, levelKey, topic, pool.items.map((q) => q.id));
  lap('skills');
  const { kept: skills, dropped } = filing ? dropSkills(filing.skills, body.skipSkills) : { kept: [], dropped: [] };
  const bySkill = filing && skills.length
    ? pickBySkill(pool.items.map((q) => ({ ...q, skills: filing.linksByQuestion[q.id] ?? [] })), skills, count, { seed })
    : null;
  if (bySkill && !bySkill.unfiled && bySkill.items.length) {
    picked = bySkill.items.map((i) => i.row);
    const nameOf = new Map(skills.map((s) => [s.id, s.name]));
    skillsOut = {
      covered: skills.filter((s) => bySkill.perSkill[s.id]).map((s) => ({ name: s.name, n: bySkill.perSkill[s.id] })),
      empty: bySkill.empty.map((id) => nameOf.get(id) ?? id),
      skipped: bySkill.skipped.map((id) => nameOf.get(id) ?? id),
      dropped,
      unfiled: bySkill.unfiledCount,
    };
  } else {
    ({ items: picked, bandFallback } = applyBand(pool.items, band, count, (items, n) => dailyDraw(items, seed, n)));
  }
  const title = worksheetTitle(cfg.label, topic);

  const pdf = await renderBotWorksheetPDF({
    title,
    levelLabel: cfg.label,
    topic,
    tier,
    dateLabel: dateLabel(date),
    questions: picked,
    answers,
  }, timings);
  lap('render');

  const questionIds = picked.map((q) => q.id);
  // Singapore Storage (lib/bank-pdf-store, same project as the bank) instead of
  // Vercel Blob in the US: the Blob upload of this 70 KB PDF was 1.1–1.9 s of a
  // 2.3–2.7 s warm build (route timings, 7 Sep 2026); the Storage upsert is ~0.4 s.
  // The path is deterministic and upserted, so re-asking for the same sheet the
  // same day lands on the SAME url instead of littering the store. Blob remains
  // the helper's fallback.
  const stored = await storeBankFile(
    `bot/${worksheetBlobPath({ date, levelKey, topic, tier, band: bandLabel, count: picked.length, answers, questionIds })}`,
    pdf,
    'application/pdf',
  );

  lap('blob');
  timings.total = Date.now() - t0;
  console.log('[bot-worksheet] timings', JSON.stringify(timings));

  return NextResponse.json({
    url: stored.url,
    store: stored.store,
    title,
    count: picked.length,
    questionIds,
    // Handy for Telegram sendDocument, which otherwise names the file after the
    // blob path's random-looking tail.
    filename: worksheetFilename(levelKey, topic, date),
    level: levelKey,
    topic,
    tier: tier ?? 'mixed',
    // Which skills the sheet covers (null = the plain daily draw was used)
    skills: skillsOut,
    pick: skillsOut ? 'skill' : 'draw',
    // The marks band asked for, and whether a thin band had to borrow from the
    // whole pool to fill the sheet — the bot tells Adrian when it did.
    band: bandLabel,
    bandFallback,
    answers,
    // Which audience the sheet was drawn for — the IP pool is a different pool,
    // so its same-day draw (and fingerprinted Blob path) differ from the
    // ordinary sheet's; echoing it lets the bot log what it actually sent.
    isIp: audience.isIp,
    // Milliseconds per phase (audience · topics · pool · browser · newPage ·
    // setContent · ready · pdf · render · blob · total) — for /ws speed work.
    timings,
  });
}
