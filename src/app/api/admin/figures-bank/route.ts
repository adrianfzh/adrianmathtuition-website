// /api/admin/figures-bank — data plane for the bank-figure review grid
// (/admin/figures-bank). Distinct from /api/admin/figures, which reviews
// learning-unit SVGs for Fable regeneration (figure_regen_flags).
// Adrian eyeballs every bank figure and flags the ones needing rectification;
// flags land in Supabase `figure_flags` (path pk, status open|fixed) and form
// the work queue for targeted fixes (♻️ replace-figure, cleans, redraws).
// Since 2026-09-03 the same table also holds kind='solution' rows (watermarked
// SOLUTION images, served through lib/solution-image-gate.ts) — every read
// here filters kind='question' so a redraw session never receives one.
//
//   GET  ?page=0&pageSize=60&level=AM        → page of questions-with-figures,
//        each with its stem figures, thumb URLs and flag state
//   GET  ?flagged=1                          → every open flag, with the figure
//        AS FLAGGED and the question's figure AS IT IS NOW
//   GET  ?kind=solution&scope=sec|jc|all     → the SOLUTION VET LANE (below);
//        scope defaults to 'sec' — see the scope note in solutionLaneGet
//   GET  ?kind=fitness                       → the FITNESS LANE (below)
//   POST { path, questionId, flag: boolean } → set/clear a flag
//   POST { path, resolve: true }             → mark 'fixed' (releases the question)
//   POST { kind:'solution', action, … }      → the vet lane's five actions
//   POST { kind:'fitness', action, … }       → the fitness lane's three actions
//
// A flag records the bucket path at the moment it was raised. Cleaning a figure
// writes a NEW bucket object and repoints the question, so that path goes stale
// — which is useful, not a bug: it is the BEFORE. The serving gate keys on
// question_id, so a stale path never breaks the exclusion.
//
// ADMIN ONLY. Thumbs live at question_images/thumbs/<basename>.jpg (pre-built
// batch job); the client falls back to the full image if a thumb 404s.
//
// ── The solution vet lane (2026-09-03) ────────────────────────────────────────
// 152 solution images sit switched off as figure_flags kind='solution'
// status='held' (never 'open' — an open row of ANY kind drops the whole question
// out of the serving pools; 'held' blocks only in the render gate). Adrian:
// "i do want to see them and if approve, or amended, put them back into
// solutions." This lane is that surface. Putting an image back follows the
// binding write contract mirrored in lib/solution-image-apply.ts — new object,
// GUARDED recursive ref swap (fresh read per attempt + repair pairs for an
// earlier clobbered apply on the same question), absence proof against every
// pair, clean-log row, THEN the flag flip.
//
// ── The fitness lane (2026-09-03) ─────────────────────────────────────────────
// A fitness-verification pass (claimed_by 'figfit-2026-09-03' and a peer
// session's cropsweep) writes figure_flags rows with kind='question',
// status='held' whenever a question figure may be the wrong figure, cropped
// short, illegible, or carrying foreign content. 'held' (not 'open') on
// purpose: an open QUESTION flag withdraws the whole question from serving
// immediately, and most fitness failures are cosmetic — Adrian needs to look
// before anything is pulled. This lane is where he looks. Three actions, none
// of them touching the bucket or the question row — only figure_flags status
// and note: 🙈 Hide (status→'open', pulls the question until repaired),
// ✓ Figure is fine (status→'fixed', keeps serving), 🛠 Send to repair (status
// stays 'held' — stays in the queue without un-serving). Every action PREFIXES
// Adrian's verdict onto the fitness pass's own note rather than replacing it,
// so the original verdict/reason survives alongside his decision.
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isCorrectnessHold, parseFitnessNote, releaseNote } from '@/lib/figure-flag-release';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { imgSrc, isPlausibleImagePath } from '@/lib/kiosk-worksheet-images';
import { inspectFigure } from '@/lib/figure-checks';
import {
  replaceSolutionImageRefsMany, repairPairsFor, verifyRefPairs,
  containsImageRef, partLabelFor, cleanedObjectKey, imageKey, type RefPair,
} from '@/lib/solution-image-apply';
import { partImagePaths, inlineImagePaths } from '@/lib/bank-question-markdown';

export const runtime = 'nodejs';

type Row = Record<string, unknown>;

function stemPaths(row: Row): string[] {
  const out: string[] = [];
  if (typeof row.figure_url === 'string' && row.figure_url && !/^https?:/i.test(row.figure_url)) out.push(row.figure_url);
  if (typeof row.image_url === 'string' && row.image_url) {
    try {
      const arr = JSON.parse(row.image_url);
      if (Array.isArray(arr)) {
        for (const e of arr) {
          const p = e && typeof e === 'object' ? (e as { url?: unknown }).url : e;
          if (isPlausibleImagePath(p) && !/^https?:/i.test(p)) out.push(p);
        }
      }
    } catch { /* unparseable */ }
  }
  // Part-level slots and inline {{IMG:…}} markers (3 Sep 2026): 14 rows carried
  // their only figure in parts[].image_url / image_url_after, and 31 figures live
  // as inline markers in text — none reachable by a row-column walk, so no
  // sweep, gate or lane could ever flag, clean or hide them.
  const walkParts = (parts: unknown) => {
    for (const p of (Array.isArray(parts) ? parts : []) as Record<string, unknown>[]) {
      if (!p || typeof p !== 'object') continue;
      for (const slot of ['image_url', 'image_url_after']) for (const q of partImagePaths(p[slot])) if (!/^https?:/i.test(q)) out.push(q);
      for (const q of inlineImagePaths(p.text)) if (!/^https?:/i.test(q)) out.push(q);
      if (Array.isArray(p.subparts)) walkParts(p.subparts);
    }
  };
  walkParts(row.parts);
  for (const q of inlineImagePaths(row.question_text)) if (!/^https?:/i.test(q)) out.push(q);
  return [...new Set(out.map((p) => p.replace(/^question_images\//, '')))];
}

function thumbUrl(path: string): string {
  return imgSrc(`question_images/thumbs/${path.replace(/\.[a-z]+$/i, '')}.jpg`);
}

/* ── solution vet lane ──────────────────────────────────────────────────────── */

const BUCKET = 'question_images';
const VET_BATCH = 'admin-vet-lane';
/** Vercel hard-caps the request body at 4.5MB; leave room for the JSON envelope. */
const MAX_AMEND_BYTES = 3.5 * 1024 * 1024;

type Candidate = {
  url: string;
  /** From the sidecar written by the cleaning session. 'unknown' = no sidecar. */
  verdict: string;
  route: string | null;
  note: string | null;
  /** 'residue' | 'unverified' — EXPLICIT only. Never inferred from prose: a
   *  guessed hold_kind once labelled an uninspected image as inspected. */
  holdKind: string | null;
  holdReason: string | null;
  /** Set when the clean is an ESTIMATE (pixels under the stamp reconstructed) rather than an exact removal. */
  methodNote: string | null;
};

const step = (name: string, message: string) =>
  NextResponse.json({ error: message, step: name }, { status: 500 });

/** Every candidate object name under candidates/, including the sub-prefixes a
 *  handful of flag paths carry (`solutions/<uuid>-1.png`). One list per prefix. */
async function listCandidateNames(supa: SupabaseClient, paths: string[]): Promise<Set<string>> {
  const prefixes = new Set<string>(['']);
  for (const p of paths) { const i = p.lastIndexOf('/'); if (i > 0) prefixes.add(p.slice(0, i)); }
  const names = new Set<string>();
  for (const pre of prefixes) {
    const { data } = await supa.storage.from(BUCKET).list(pre ? `candidates/${pre}` : 'candidates', { limit: 1000 });
    for (const o of data ?? []) if (o?.name) names.add(pre ? `${pre}/${o.name}` : o.name);
  }
  return names;
}

async function readSidecar(supa: SupabaseClient, path: string): Promise<Record<string, unknown>> {
  try {
    const dl = await supa.storage.from(BUCKET).download(`candidates/${path}.json`);
    if (!dl.data) return {};
    const parsed = JSON.parse(await dl.data.text());
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch { return {}; }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** JC levels, for the lane's scope split. Everything else — including a row
 *  whose question carries no level at all — counts as Sec, so a filter can
 *  never make a row invisible in the default view. */
const JC_LEVELS = new Set(['JC1', 'JC2', 'JC2_H1']);
const isJcLevel = (level: unknown) =>
  typeof level === 'string' && JC_LEVELS.has(level.trim().toUpperCase());

async function solutionLaneGet(supa: SupabaseClient, sp: URLSearchParams) {
  const { data: flags, error } = await supa
    .from('figure_flags').select('path, question_id, note, claimed_by, created_at')
    .eq('kind', 'solution').eq('status', 'held')
    .order('created_at', { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const everything = flags ?? [];

  // SCOPE (4 Sep 2026). The JC judge pass holds 200 images and the Sec pass 112,
  // in ONE list ordered by created_at — which put every Sec decision on page 11
  // of 16, behind 202 JC rows Adrian has explicitly paused ("Sec must complete
  // before JC images gets to start"). The queue this whole pass waits on was
  // unreachable without ten taps. Split by the QUESTION's level, not by
  // claimed_by: two NJC images found by the Sec pass's markdown-channel sweep
  // are JC work, and belong in the JC lane whoever flagged them.
  const levelOf = new Map<string, unknown>();
  const allQids = [...new Set(everything.map((f) => f.question_id as string))];
  for (let i = 0; i < allQids.length; i += 200) {
    const { data: ls } = await supa.from('questions')
      .select('id, level').in('id', allQids.slice(i, i + 200));
    for (const q of ls ?? []) levelOf.set(q.id as string, q.level);
  }
  const jc = everything.filter((f) => isJcLevel(levelOf.get(f.question_id as string)));
  const sec = everything.filter((f) => !isJcLevel(levelOf.get(f.question_id as string)));
  const scope = sp.get('scope') === 'jc' ? 'jc' : sp.get('scope') === 'all' ? 'all' : 'sec';
  const all = scope === 'jc' ? jc : scope === 'all' ? everything : sec;

  // One prefix listing per request — not one existence probe per card.
  const names = await listCandidateNames(supa, all.map((f) => f.path as string));
  const withCandidate = all.filter((f) => names.has(f.path as string)).length;

  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0);
  const pageSize = Math.min(60, Math.max(1, Number(sp.get('pageSize') ?? 20) || 20));
  const slice = all.slice(page * pageSize, page * pageSize + pageSize);

  const qids = [...new Set(slice.map((f) => f.question_id as string))];
  const meta: Record<string, Row> = {};
  if (qids.length) {
    const { data: qs } = await supa.from('questions')
      .select('id, level, school, year, paper, question_number, parts, solution_images, solution')
      .in('id', qids);
    for (const q of qs ?? []) meta[q.id as string] = q as Row;
  }

  const items = await Promise.all(slice.map(async (f) => {
    const path = f.path as string;
    const q = meta[f.question_id as string];
    let candidate: Candidate | null = null;
    if (names.has(path)) {
      const side = names.has(`${path}.json`) ? await readSidecar(supa, path) : {};
      candidate = {
        url: imgSrc(`${BUCKET}/candidates/${path}`),
        verdict: str(side.verdict) ?? 'unknown',
        route: str(side.route),
        note: str(side.note),
        holdKind: str(side.hold_kind),
        holdReason: str(side.hold_reason),
        methodNote: str(side.method_note),
      };
    }
    return {
      path, qid: f.question_id,
      level: q?.level ?? null, school: q?.school ?? null, year: q?.year ?? null,
      paper: q?.paper ?? null, qnum: q?.question_number ?? null,
      partLabel: q ? partLabelFor(q, path) : null,
      note: (f.note as string | null) ?? null,
      claimedBy: (f.claimed_by as string | null) ?? null,
      liveUrl: imgSrc(`${BUCKET}/${path}`),
      candidateUrl: candidate?.url ?? null,
      candidate,
    };
  }));

  return NextResponse.json({
    items, page, pageSize, scope,
    // `held` is the IN-SCOPE count (the client pages off it); sec/jc/allHeld
    // keep every number on screen, so a scope never hides work silently.
    totals: {
      held: all.length, withCandidate,
      sec: sec.length, jc: jc.length, allHeld: everything.length,
    },
  });
}

/**
 * The binding write contract (lib/solution-image-apply.ts): NEW object → GUARDED
 * recursive ref swap → absence proof on the whole re-read row against every pair
 * → clean-log → flag flip. Every failure past the upload reverts the row, so
 * nothing is ever half-applied; the uploaded object is left behind (inert —
 * originals are never deleted either).
 *
 * GUARDED since 4 Sep 2026 (unit 14 of the solution-image pass). This lane used
 * to read `parts`, mutate it and PATCH it back, and verify only its OWN old path
 * — the exact shape that clobbered clean-log #4013 (cand #59, Anglican High 2023
 * AM P1 Q15) on 3 Sep and put a stamped image back in front of students under a
 * 'fixed' flag. apply.py was fixed then; this lane was not, and Adrian taps it by
 * hand: `d3965821…` (Xinmin 2025 AM P2 Q10) has both of its held cards side by
 * side in the Sec queue, so two quick approvals reproduced it in the UI. Now the
 * write recomputes from a fresh read on every attempt, carries a repair pair for
 * any earlier apply on this question that has been clobbered, proves the re-read
 * row against ALL of them, retries a lost race and reverts if it cannot win.
 */
const WRITE_TRIES = 3;

async function applyCleanedSolutionImage(
  supa: SupabaseClient,
  o: { path: string; questionId: string; bytes: Buffer; contentType: string; note: string },
) {
  const readCols = async () => {
    const { data, error } = await supa.from('questions')
      .select('id, parts, solution_images, solution').eq('id', o.questionId).limit(1);
    return { row: (data?.[0] ?? null) as Row | null, error };
  };
  const readWhole = async () => {
    const { data, error } = await supa.from('questions')
      .select('*').eq('id', o.questionId).limit(1);
    return { row: (data?.[0] ?? null) as Row | null, error };
  };

  const first = await readCols();
  if (first.error || !first.row) return step('read', first.error?.message ?? 'question row not found');
  const row = first.row;
  const before = {
    parts: row.parts ?? null,
    solution_images: row.solution_images ?? null,
    solution: row.solution ?? null,
  };
  if (!containsImageRef(row, o.path)) {
    return step('locate', 'the old key is not in parts/solution_images/solution — nothing to replace');
  }

  const partLabel = partLabelFor(row, o.path);
  const sha8 = createHash('sha256').update(o.bytes).digest('hex').slice(0, 8);
  const ext = /jpe?g/i.test(o.contentType) ? 'jpg' : 'png';
  const dest = cleanedObjectKey(o.questionId, partLabel, sha8, ext);

  const up = await supa.storage.from(BUCKET).upload(dest, o.bytes, {
    contentType: o.contentType, upsert: false, cacheControl: '3600',
  });
  if (up.error) return step('upload', up.error.message);
  const newUrl = imgSrc(`${BUCKET}/${dest}`);

  // Every earlier apply on THIS question, so a clobbered one rides along and is
  // repaired by the same PATCH. A log we cannot read is a refusal, not a shrug:
  // without it we cannot tell a clobber from an untouched row (apply.py does the
  // same — `repair_pairs` returning None aborts the apply).
  const priorLog = await supa.from('figure_clean_log')
    .select('id, old_path, new_path, applied_at')
    .eq('question_id', o.questionId).order('applied_at', { ascending: true });
  if (priorLog.error) return step('repair', `could not read figure_clean_log: ${priorLog.error.message}`);
  const toUrl = (k: string) => imgSrc(`${BUCKET}/${k}`);
  const repair = repairPairsFor(row, priorLog.data ?? [], toUrl, o.path);
  // Keyed by old path so a rescan never queues the same repair twice, and never
  // drops one that has already been put right: the union is what gets verified.
  const pairs = new Map<string, RefPair>([[imageKey(o.path), { oldPath: o.path, newUrl }]]);
  for (const p of repair.pairs) pairs.set(imageKey(p.oldPath), p);
  const pairList = () => [...pairs.values()];

  let swap = replaceSolutionImageRefsMany(row, pairList());
  if (!swap.pairs[0].replaced) return step('replace', 'no reference matched the old key');
  // Where OUR image lived, read once: a later attempt starts from a row that may
  // already carry the swap, and an empty field list there would mislabel the log.
  const own = swap.pairs[0].fields;

  /** Any clobber this row has picked up that we are not already repairing. */
  const absorbRepairs = (fresh: Row, attempt: number): string[] => {
    const late = repairPairsFor(fresh, priorLog.data ?? [], toUrl, o.path).pairs
      .filter((p) => !pairs.has(imageKey(p.oldPath)));
    for (const p of late) {
      pairs.set(imageKey(p.oldPath), p);
      repair.notes.push(`${p.oldPath} was clobbered mid-flight `
        + `— repairing on attempt ${attempt + 1}`);
    }
    return late.map((p) => `an earlier apply was clobbered: ${imageKey(p.oldPath)}`);
  };

  let problems: string[] = [];
  let attempts = 0;
  for (; attempts < WRITE_TRIES; attempts++) {
    if (attempts) {
      // A concurrent writer beat us: recompute from what is in the row NOW,
      // repairs included (apply.py fixes its pairs once; here a rescan is free).
      const again = await readCols();
      if (again.error || !again.row) return step('patch', 'could not re-read the question row');
      absorbRepairs(again.row, attempts);
      swap = replaceSolutionImageRefsMany(again.row, pairList());
    }
    const patch = await supa.from('questions').update(swap.row).eq('id', o.questionId);
    if (patch.error) return step('patch', patch.error.message);

    const fresh = await readWhole();
    if (fresh.error || !fresh.row) { problems = ['could not re-read the row']; continue; }
    problems = verifyRefPairs(fresh.row, pairList());
    // Our pairs can all hold while an EARLIER apply on this question has just
    // been clobbered — invisible to a pair check, because that pair is not ours,
    // and it means a stamped image is live again under a 'fixed' flag. Treat it
    // as a failed attempt so the next one carries the repair.
    if (!problems.length) problems = absorbRepairs(fresh.row, attempts + 1);
    if (!problems.length) break;
  }
  if (problems.length) {
    await supa.from('questions').update(before).eq('id', o.questionId);
    return step('verify', `the row did not verify after ${WRITE_TRIES} attempts `
      + `— the write was reverted: ${problems.join('; ')}`);
  }

  // Undo OUR pair after a verified write, keeping any repair it made: a repair
  // ends a live leak (an earlier apply was clobbered, so a stamped image is being
  // served under a 'fixed' flag), and rolling that back for a bookkeeping failure
  // that has nothing to do with it would put the watermark back in front of
  // students. Our own old path stays 'held' until the flag flip below, so the
  // gate keeps hiding it either way.
  const undoOwnWrite = async () => {
    const repairs = pairList().slice(1);
    const restored = repairs.length
      ? { ...before, ...replaceSolutionImageRefsMany(before, repairs).row }
      : before;
    await supa.from('questions').update(restored).eq('id', o.questionId);
  };

  const field = own.some((f) => f.startsWith('parts')) ? 'part'
    : own.some((f) => f.startsWith('solution_images')) ? 'solution_images' : 'solution';
  const log = await supa.from('figure_clean_log')
    .insert({ question_id: o.questionId, field, old_path: o.path, new_path: `${BUCKET}/${dest}`, batch: VET_BATCH })
    .select('id').single();
  if (log.error) {
    await undoOwnWrite();
    return step('clean_log', log.error.message);
  }

  const flag = await supa.from('figure_flags')
    .update({ status: 'fixed', note: o.note.slice(0, 500) })
    .eq('path', o.path).eq('kind', 'solution');
  if (flag.error) {
    await undoOwnWrite();
    if (log.data?.id) await supa.from('figure_clean_log').delete().eq('id', log.data.id);
    return step('flag', flag.error.message);
  }

  // The flag above still names the STAMPED path; the cleaned object we just repointed
  // to has no row at all. Invisible under today's deny-list — but this gate serves an
  // UNJUDGED level (and the whole bank under SOLUTION_IMAGES_REQUIRE_CLEAN) from `fixed`
  // rows ONLY, so without this record Adrian approving a candidate would hide the very
  // image he approved. Additive, its own claim, so the classification pass's ledger
  // (claimed_by='solimg-…') keeps its counts. Never overwrites an existing verdict, and
  // never fails the apply: the image is live and correct either way.
  const allowRow = await supa.from('figure_flags')
    .upsert({
      path: `${BUCKET}/${dest}`, question_id: o.questionId, kind: 'solution', status: 'fixed',
      claimed_by: VET_BATCH, claimed_at: new Date().toISOString(),
      note: `ALLOW-LIST RECORD for the CLEANED object — the stamped original is ${o.path}, `
        + `whose own flag carries the verdict. ${o.note}`.slice(0, 500),
    }, { onConflict: 'path', ignoreDuplicates: true });
  if (allowRow.error) console.warn('[figures-bank] cleaned-path allow-list row failed:', allowRow.error.message);

  return NextResponse.json({
    ok: true, status: 'fixed', partLabel, allowListed: !allowRow.error,
    newPath: `${BUCKET}/${dest}`, newUrl,
    replaced: swap.pairs[0].replaced, fields: own,
    attempts: attempts + 1,
    // Empty on the normal path. Non-empty means this apply also put right an
    // earlier one on the same question — worth seeing in the response.
    repaired: repair.notes,
  });
}

async function noteOnly(supa: SupabaseClient, path: string, note: string, status?: 'fixed') {
  const patch: Record<string, unknown> = { note: note.slice(0, 500) };
  if (status) patch.status = status;
  const { error } = await supa.from('figure_flags').update(patch)
    .eq('path', path).eq('kind', 'solution');
  if (error) return step('flag', error.message);
  return NextResponse.json({ ok: true, status: status ?? 'held', note });
}

async function solutionLanePost(
  supa: SupabaseClient, body: Record<string, unknown>, path: string, questionId: string,
) {
  const action = typeof body.action === 'string' ? body.action : '';
  const extra = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
  const suffix = extra ? ` · ${extra}` : '';

  if (action === 'approve-as-is') {
    // The render gate serves 'fixed' — including at unjudged levels, where only
    // 'fixed' paths render at all. Nothing else to do: the image is fine as it is.
    return noteOnly(supa, path, `Adrian approved as-is${suffix}`, 'fixed');
  }
  if (action === 'keep-hidden') return noteOnly(supa, path, `kept hidden${suffix}`);
  if (action === 'redraw') return noteOnly(supa, path, 'redraw requested');

  if (action === 'approve-candidate') {
    const dl = await supa.storage.from(BUCKET).download(`candidates/${path}`);
    if (dl.error || !dl.data) return step('candidate', dl.error?.message ?? 'no cleaned candidate stored');
    const bytes = Buffer.from(await dl.data.arrayBuffer());
    if (!bytes.length) return step('candidate', 'the stored candidate is empty');
    const contentType = /jpe?g/i.test(dl.data.type ?? '') ? 'image/jpeg' : 'image/png';
    return applyCleanedSolutionImage(supa, {
      path, questionId, bytes, contentType, note: 'Adrian approved cleaned candidate',
    });
  }

  if (action === 'amend') {
    const b64 = typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^,]+,/, '') : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType : '';
    if (!b64) return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 });
    if (!/^image\/(png|jpe?g)$/i.test(contentType)) {
      return NextResponse.json({ error: 'contentType must be image/png or image/jpeg' }, { status: 400 });
    }
    const bytes = Buffer.from(b64, 'base64');
    if (!bytes.length) return NextResponse.json({ error: 'imageBase64 did not decode' }, { status: 400 });
    if (bytes.length > MAX_AMEND_BYTES) {
      return NextResponse.json({ error: 'image too large — 3.5MB max', bytes: bytes.length }, { status: 413 });
    }
    return applyCleanedSolutionImage(supa, {
      path, questionId, bytes, contentType: contentType.toLowerCase(), note: 'Adrian amended',
    });
  }

  return NextResponse.json({ error: `unknown solution action: ${action || '(none)'}` }, { status: 400 });
}

/* ── fitness lane ────────────────────────────────────────────────────────────
 * Held kind='question' flags from the fitness writers — the figfit pass, the
 * extraction law's ingestion gate and the nightly figure-fitness task. All
 * three write the same note grammar, SEVERITY FIRST:
 *
 *   <writer> <date> · <severity> · <verdict> · <reason>
 *   e.g. "figfit scope2 3 Sep 2026 · cosmetic · incomplete · zero right margin"
 *
 * parseFitnessNote (lib/figure-flag-release.ts, tested) reads severity from
 * anywhere in the text and the verdict by vocabulary, never by position — the
 * segment after the first '·' is the severity, and reading it as the verdict
 * showed 'cosmetic' / 'blocks-answering' twice on every held row (3 Sep 2026). */

async function fitnessLaneGet(supa: SupabaseClient, sp: URLSearchParams) {
  const { data: flags, error } = await supa
    .from('figure_flags').select('path, question_id, note, claimed_by, created_at')
    .eq('kind', 'question').eq('status', 'held')
    .order('created_at', { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const held = flags ?? [];

  // A decided row stays `held` on purpose — the render gate must keep blocking
  // it — but it leaves the lane Adrian is working. Counted, never silently
  // dropped: `?view=repair` / `?view=table` list them (`?sent=1` is the old
  // spelling of `view=repair` and still works).
  const viewParam = sp.get('view');
  const view = viewParam && DECIDED[viewParam] ? viewParam
    : (sp.get('sent') === '1' ? 'repair' : null);
  const all = held.filter((f) => decidedKind(f.note as string | null) === view);
  const decidedCounts: Record<string, number> = {};
  for (const k of Object.keys(DECIDED)) decidedCounts[k] = 0;
  for (const f of held) {
    const k = decidedKind(f.note as string | null);
    if (k) decidedCounts[k] += 1;
  }

  let blocking = 0;
  let cosmetic = 0;
  for (const f of all) {
    const { severity } = parseFitnessNote((f.note as string | null) ?? null);
    if (severity === 'blocks-answering') blocking++;
    else if (severity === 'cosmetic') cosmetic++;
  }

  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0);
  const pageSize = Math.min(60, Math.max(1, Number(sp.get('pageSize') ?? 20) || 20));
  const slice = all.slice(page * pageSize, page * pageSize + pageSize);

  const qids = [...new Set(slice.map((f) => f.question_id as string))];
  const meta: Record<string, Row> = {};
  if (qids.length) {
    const { data: qs } = await supa.from('questions')
      .select('id, level, school, year, paper, question_number, question_text, image_url, figure_url')
      .in('id', qids);
    for (const q of qs ?? []) meta[q.id as string] = q as Row;
  }

  const items = slice.map((f) => {
    const path = f.path as string;
    const q = meta[f.question_id as string];
    const note = (f.note as string | null) ?? null;
    const { severity, verdict } = parseFitnessNote(note);
    const stem = ((q?.question_text as string) ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return {
      path, qid: f.question_id,
      level: q?.level ?? null, school: q?.school ?? null, year: q?.year ?? null,
      paper: q?.paper ?? null, qnum: q?.question_number ?? null,
      stem,
      figureUrl: imgSrc(`${BUCKET}/${path}`),
      severity, verdict, note,
      claimedBy: (f.claimed_by as string | null) ?? null,
    };
  });

  return NextResponse.json({
    items, page, pageSize,
    totals: {
      held: all.length, blocking, cosmetic,
      sentToRepair: decidedCounts.repair, tables: decidedCounts.table,
    },
  });
}

const FITNESS_PREFIXES: Record<string, string> = {
  hide: 'Adrian: hide · ',
  accept: 'Adrian: figure is fine · ',
  repair: 'Adrian: repair · ',
  table: 'Adrian: table · ',
};

/** The verdicts that DECIDE a row without changing its status. Both leave the
 *  working queue and wait on their own list.
 *
 *  `table` exists because some of these "figures" are not figures — they are a
 *  printed TABLE that belongs in `question_text` as text, so it reflows on a
 *  phone, is searchable, and needs no image at all. Adrian, 5 Sep 2026, on
 *  Broadrick 2023 P1 Q15 (a pattern table stored as a PNG): "this image is of a
 *  table, we should just extract the table and put it in the question itself,
 *  instead of an image — but i have no way to say that in the page". */
const DECIDED: Record<string, string> = {
  repair: FITNESS_PREFIXES.repair,
  table: FITNESS_PREFIXES.table,
};
const decidedKind = (note: string | null | undefined) =>
  Object.keys(DECIDED).find((k) => (note ?? '').startsWith(DECIDED[k])) ?? null;

/** Has this row already been sent to repair? The lane hides these (below), and
 *  the POST refuses to prefix a second time. `hide`/`accept` change `status`, so
 *  they leave the lane on their own; `repair` deliberately does not, and without
 *  this marker the row reappeared on every refresh (Adrian, 5 Sep 2026:
 *  "i thought i had already hit send this for repair, it is still showing up").
 *  74 of the 221 held rows were in that state — a third of the lane was work he
 *  had already done. */
export const SENT_TO_REPAIR = FITNESS_PREFIXES.repair;
const sentToRepair = (note: string | null | undefined) => (note ?? '').startsWith(SENT_TO_REPAIR);

async function fitnessLanePost(
  supa: SupabaseClient, body: Record<string, unknown>, path: string, questionId: string,
) {
  const action = typeof body.action === 'string' ? body.action : '';
  const prefix = FITNESS_PREFIXES[action];
  if (!prefix) return NextResponse.json({ error: `unknown fitness action: ${action || '(none)'}` }, { status: 400 });

  const { data: rows, error: readErr } = await supa.from('figure_flags')
    .select('note, question_id').eq('path', path).eq('kind', 'question').eq('status', 'held').limit(1);
  if (readErr) return step('read', readErr.message);
  if (!rows?.length) return step('read', 'no held question flag at that path');
  if (rows[0].question_id !== questionId) return step('read', 'questionId does not match the flag');

  // Idempotent, and the reason is never trimmed. The old `.slice(0, 500)` was a
  // code-only cap (the column is text — the longest note in the table is 1103),
  // and because the prefix goes on the FRONT, every tap pushed the fitness
  // pass's own evidence off the END: Anglican High 2023 AM P1 Q15 lost its
  // source citation mid-word ("… page 97 (PD"). A second tap would eat 17 more
  // characters, so the un-actionable UI was quietly destroying the reason.
  const prior = (rows[0].note as string | null) ?? '';
  if (DECIDED[action] && prior.startsWith(DECIDED[action])) {
    return NextResponse.json({ ok: true, status: 'held', note: prior, alreadySent: true });
  }
  const note = prior.startsWith(prefix) ? prior : `${prefix}${prior}`;
  const patch: Record<string, unknown> = { note };
  if (action === 'hide') patch.status = 'open';
  if (action === 'accept') patch.status = 'fixed';
  // 'repair': status stays 'held' — the row remains in the repair queue
  // without withdrawing the question from serving.

  const { error } = await supa.from('figure_flags').update(patch)
    .eq('path', path).eq('kind', 'question');
  if (error) return step('flag', error.message);
  return NextResponse.json({ ok: true, status: (patch.status as string | undefined) ?? 'held', note });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  const sp = req.nextUrl.searchParams;

  if (sp.get('kind') === 'solution') return solutionLaneGet(supa, sp);
  if (sp.get('kind') === 'fitness') return fitnessLaneGet(supa, sp);

  if (sp.get('flagged') === '1') {
    const { data: allFlags, error } = await supa
      .from('figure_flags').select('path, question_id, status, created_at, note')
      .eq('status', 'open').eq('kind', 'question').order('created_at', { ascending: true }).limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Paginated, because every item is MEASURED — the checks below need the
    // pixels, and 493 image fetches in one request is not a page load.
    const fPage = Math.max(0, Number(sp.get('page') ?? 0) || 0);
    const fSize = Math.min(40, Math.max(6, Number(sp.get('pageSize') ?? 20) || 20));
    const total = (allFlags ?? []).length;
    const flags = (allFlags ?? []).slice(fPage * fSize, fPage * fSize + fSize);
    const qids = [...new Set(flags.map((f) => f.question_id))];
    const meta: Record<string, Row> = {};
    if (qids.length) {
      for (let i = 0; i < qids.length; i += 200) {
        const { data: qs } = await supa
          .from('questions')
          .select('id, level, school, year, question_number, image_url, figure_url, question_text, parts, has_image, image_watermark_status')
          .in('id', qids.slice(i, i + 200));
        for (const q of qs ?? []) meta[q.id as string] = q;
      }
    }

    const items = await Promise.all(flags.map(async (f) => {
      const q = meta[f.question_id as string];
      // What the question shows TODAY. Differs from f.path wherever the figure
      // has been cleaned or replaced since it was flagged.
      const now = q ? stemPaths(q as Row)[0] ?? null : null;
      let checks: Awaited<ReturnType<typeof inspectFigure>> | null = null;
      if (now) {
        try {
          const dl = await supa.storage.from('question_images').download(now.replace(/^question_images\//, ''));
          if (dl.data) checks = await inspectFigure(Buffer.from(await dl.data.arrayBuffer()));
        } catch { /* a measurement is evidence, not a precondition */ }
      }
      const stem = ((q?.question_text as string) ?? '').replace(/\s+/g, ' ').trim();
      return {
        path: f.path, qid: f.question_id, flagged: true, note: (f.note as string | null) ?? null,
        url: imgSrc(`question_images/${f.path}`), thumb: thumbUrl(f.path),
        currentUrl: now ? imgSrc(`question_images/${now}`) : null,
        changed: !!now && now !== f.path,
        level: q?.level ?? null, school: q?.school ?? null,
        year: q?.year ?? null, qnum: q?.question_number ?? null,
        stem: stem.slice(0, 700), stemEmpty: !stem,
        figureMissing: q?.has_image === true && !now,
        watermark: (q?.image_watermark_status as string | null) ?? null,
        checks,
      };
    }));

    return NextResponse.json({ items, total, page: fPage, pageSize: fSize, withheld: total });
  }

  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0);
  const pageSize = Math.min(120, Math.max(12, Number(sp.get('pageSize') ?? 60) || 60));
  const level = sp.get('level') || null;

  let cq = supa.from('questions')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .not('image_url', 'is', null).neq('image_url', '[]');
  if (level) cq = cq.eq('level', level);
  const { count } = await cq;

  let q = supa.from('questions')
    .select('id, level, school, year, question_number, image_url, figure_url')
    .is('deleted_at', null)
    .not('image_url', 'is', null).neq('image_url', '[]')
    .order('id')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (level) q = q.eq('level', level);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []).flatMap((row) =>
    stemPaths(row as Row).map((path) => ({
      path, qid: row.id, level: row.level, school: row.school, year: row.year, qnum: row.question_number,
      url: imgSrc(`question_images/${path}`), thumb: thumbUrl(path), flagged: false,
    })));
  const paths = items.map((i) => i.path);
  if (paths.length) {
    const { data: flags } = await supa.from('figure_flags').select('path').in('path', paths).eq('status', 'open').eq('kind', 'question');
    const flaggedSet = new Set((flags ?? []).map((f) => f.path));
    for (const it of items) it.flagged = flaggedSet.has(it.path);
  }
  const { count: flaggedCount } = await supa
    .from('figure_flags').select('path', { count: 'exact', head: true }).eq('status', 'open').eq('kind', 'question');
  return NextResponse.json({ items, page, pageSize, totalQuestions: count ?? 0, flaggedCount: flaggedCount ?? 0 });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const path = typeof body.path === 'string' ? body.path.replace(/^question_images\//, '') : '';
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  if (!path || !questionId) return NextResponse.json({ error: 'path and questionId required' }, { status: 400 });
  // The solution vet lane and the fitness lane are separate verb sets on the
  // same table; every question-figure behaviour below is untouched.
  if (body.kind === 'solution') return solutionLanePost(supa, body, path, questionId);
  if (body.kind === 'fitness') return fitnessLanePost(supa, body, path, questionId);
  // Resolve, don't delete: 'fixed' releases the question to every serving pool
  // (the gate excludes only status='open') AND keeps the record that it was
  // once looked at — which is how the 76 from 28 Aug are recorded.
  if (body.resolve === true) {
    // Read before writing: a release must keep the reason the row was flagged
    // (3 Sep 2026 — this branch used to overwrite the note with null, and a
    // tap cleared a leaked answer and two wrong figures with nothing left on
    // the row to say so). A correctness hold — wrong figure, leaked answer, a
    // re-opened row — cannot be cleared blind: the page shows the reason and
    // sends `force: true` only after Adrian confirms.
    const { data: existing, error: readErr } = await supa.from('figure_flags')
      .select('note, status').eq('path', path).limit(1);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    const prevNote = (existing?.[0]?.note as string | null | undefined) ?? null;
    const force = body.force === true;
    if (isCorrectnessHold(prevNote) && !force) {
      return NextResponse.json({
        error: 'correctness hold — this figure was flagged as not being this question\'s answer-free figure; releasing it needs an explicit override',
        hold: true, reason: prevNote,
      }, { status: 409 });
    }
    const extra = typeof body.note === 'string' ? body.note.slice(0, 200) : '';
    const { error } = await supa.from('figure_flags')
      .update({ status: 'fixed', note: releaseNote(prevNote, { force, extra }) })
      .eq('path', path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'fixed', forced: force });
  }
  if (body.flag === true) {
    const { error } = await supa.from('figure_flags')
      .upsert({ path, question_id: questionId, status: 'open' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supa.from('figure_flags').delete().eq('path', path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
