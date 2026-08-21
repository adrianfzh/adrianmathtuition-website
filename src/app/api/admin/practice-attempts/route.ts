// /api/admin/practice-attempts — the spot-check view behind /admin/practice-checks.
//
// GET  → recent portal practice attempts, newest first, each carrying the full
//        stored grade (marking_json) so the page can replay exactly what the
//        student saw. `?export=golden` instead returns every DISAGREEMENT as a
//        draft golden-set item ready to paste into scripts/marking-golden-set.json.
// POST → { attemptId, agree: true }                      — "grade looks right"
//        { attemptId, agree: false, adrianScore,
//          reasoning, mustMention? }                     — Adrian's correction
//        { attemptIds: [...], agree: true }              — bulk agree sweep
//
// Reads Supabase directly (same reasoning as /api/admin/papers: the website
// already holds service-role access; no bot involved). Student names appear in
// the ADMIN UI only — the golden-set export is anonymous by construction
// (slug = topic + attempt id, never a name; PRIVACY rule for calibration data).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const DEFAULT_DAYS = 90;
const MAX_DAYS = 3650;
const DEFAULT_LIMIT = 100;

type SpotCheck = {
  agree: boolean;
  adrianScore?: number;
  reasoning?: string;
  mustMention?: string[];
  at: string;
};

/** The bank stores multi-part questions with an empty question_text and the
 *  real text inside parts[] (possibly nested subparts). Compose the full
 *  question the way the student saw it — stem + labelled parts with marks,
 *  never answers/solutions (the golden set's question field is question-only). */
function composeQuestionText(q: { question_text?: string | null; parts?: unknown } | undefined): string {
  if (!q) return '';
  const out: string[] = [];
  if (q.question_text) out.push(q.question_text);
  const walk = (parts: unknown, prefix = '') => {
    if (!Array.isArray(parts)) return;
    for (const p of parts as Record<string, unknown>[]) {
      const label = `${prefix}${p.label ?? ''}`;
      out.push(`${label ? `(${label}) ` : ''}${p.text ?? ''}${p.marks ? `  [${p.marks}]` : ''}`.trim());
      if (Array.isArray(p.subparts)) walk(p.subparts, `${label}.`);
    }
  };
  walk(q.parts);
  return out.filter(Boolean).join('\n\n');
}

/** questions.level → the golden set's student_level wording. */
function studentLevel(level: string | null | undefined): string {
  switch (level) {
    case 'S1': return 'Sec 1';
    case 'S2': return 'Sec 2';
    case 'S3_AM': case 'S3_EM': return 'Sec 3';
    case 'JC1': case 'JC2': case 'JC': return 'JC1';
    default: return 'Sec 4'; // AM / EM / EM_NA
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const days = Math.min(Number(q.get('days')) || DEFAULT_DAYS, MAX_DAYS);
  const limit = Math.min(Number(q.get('limit')) || DEFAULT_LIMIT, 300);
  const exportGolden = q.get('export') === 'golden';

  const supa = createServiceClient();
  let query = supa
    .from('student_attempts')
    .select('id, user_id, airtable_student_id, question_id, attempted_at, marking_verdict, marking_json, spot_checked_at, spot_check')
    .eq('attempted_via', 'portal')
    .gte('attempted_at', new Date(Date.now() - days * 86400_000).toISOString())
    .order('attempted_at', { ascending: false })
    .limit(limit);
  if (exportGolden) query = query.not('spot_check', 'is', null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];

  // No declared FKs between these tables — join by hand in two batched reads.
  const qIds = [...new Set(rows.map(r => r.question_id).filter(Boolean))];
  const uIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const [{ data: qs }, { data: accounts }] = await Promise.all([
    qIds.length
      ? supa.from('questions').select('id, question_text, parts, total_marks, level, topics').in('id', qIds)
      : Promise.resolve({ data: [] as { id: string; question_text: string; parts: unknown; total_marks: number | null; level: string | null; topics: string[] | null }[] }),
    uIds.length
      ? supa.from('portal_accounts').select('id, display_name, email').in('id', uIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; email: string | null }[] }),
  ]);
  const qById = new Map((qs ?? []).map(x => [x.id, x]));
  const accById = new Map((accounts ?? []).map(x => [x.id, x]));

  if (exportGolden) {
    // Draft golden-set items for every disagreement, in the exact shape of
    // scripts/marking-golden-set.json items. margin_note "-n" means "Adrian's
    // score = max − n" (how practice-grade-eval.mjs reads it back). Nothing
    // identifying the student is included — slug is topic + attempt id.
    const items = rows
      .filter(r => r.spot_check && (r.spot_check as SpotCheck).agree === false)
      .map(r => {
        const sc = r.spot_check as SpotCheck;
        const question = qById.get(r.question_id);
        const mj = (r.marking_json ?? {}) as { outOf?: number; lines?: string[]; topics?: string[] };
        const maxMarks = question?.total_marks ?? mj.outOf ?? 0;
        const adrianScore = Math.max(0, Math.min(sc.adrianScore ?? 0, maxMarks));
        const topicSlug = (question?.topics?.[0] || mj.topics?.[0] || 'topic')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return {
          id: `spotcheck-${topicSlug}-${r.id}`,
          source: `portal practice spot-check ${String(r.attempted_at).slice(0, 10)}`,
          question_level: 'SECONDARY',
          student_level: studentLevel(question?.level),
          max_marks: maxMarks,
          question: composeQuestionText(question),
          working_lines: Array.isArray(mj.lines) ? mj.lines : [],
          expected: {
            margin_note: adrianScore >= maxMarks ? '' : `-${maxMarks - adrianScore}`,
            line_verdicts: null,
            must_mention: sc.mustMention ?? [],
          },
          note: sc.reasoning || '',
        };
      });
    return NextResponse.json({ items });
  }

  const attempts = rows.map(r => {
    const question = qById.get(r.question_id);
    const acc = accById.get(r.user_id);
    const mj = (r.marking_json ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      attemptedAt: r.attempted_at,
      studentName: acc?.display_name || acc?.email || 'Unknown',
      airtableStudentId: r.airtable_student_id,
      questionId: r.question_id,
      questionText: composeQuestionText(question) || '(question no longer in bank)',
      questionLevel: question?.level || null,
      topics: question?.topics || (mj.topics as string[] | undefined) || [],
      verdict: r.marking_verdict,
      score: typeof mj.score === 'number' ? mj.score : null,
      outOf: typeof mj.outOf === 'number' ? mj.outOf : question?.total_marks ?? null,
      source: (mj.source as string) || 'typed',
      // The model needed a JSON retry → lower-confidence grade, flag it.
      parseRetried: mj.parseRetried === true,
      marking: mj, // full stored grade: lines, lineComments, partBreakdown, strengths, nextSteps
      spotCheckedAt: r.spot_checked_at,
      spotCheck: (r.spot_check as SpotCheck | null) ?? null,
    };
  });

  return NextResponse.json({
    days,
    attempts,
    stats: {
      total: attempts.length,
      unchecked: attempts.filter(a => !a.spotCheckedAt).length,
      flagged: attempts.filter(a => a.parseRetried).length,
      disagreed: attempts.filter(a => a.spotCheck && a.spotCheck.agree === false).length,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    attemptId?: number; attemptIds?: unknown; agree?: boolean; uncheck?: boolean;
    adrianScore?: number; reasoning?: string; mustMention?: unknown;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const supa = createServiceClient();
  const now = new Date().toISOString();

  // Bulk agree — "these all look right" sweep, same stamp as the single case.
  if (Array.isArray(body.attemptIds) && body.agree === true) {
    const ids = body.attemptIds.filter((x): x is number => typeof x === 'number').slice(0, 300);
    if (!ids.length) return NextResponse.json({ error: 'attemptIds is empty' }, { status: 400 });
    const { error } = await supa
      .from('student_attempts')
      .update({ spot_checked_at: now, spot_check: { agree: true, at: now } })
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  const { attemptId } = body;
  if (typeof attemptId !== 'number') return NextResponse.json({ error: 'attemptId is required' }, { status: 400 });

  // Undo — clear the review so the attempt returns to the unchecked pile.
  if (body.uncheck === true) {
    const { error } = await supa
      .from('student_attempts')
      .update({ spot_checked_at: null, spot_check: null })
      .eq('id', attemptId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, attemptId, unchecked: true });
  }

  if (typeof body.agree !== 'boolean') return NextResponse.json({ error: 'agree is required' }, { status: 400 });

  let spotCheck: SpotCheck;
  if (body.agree) {
    spotCheck = { agree: true, at: now };
  } else {
    // Disagreement — Adrian's score, clamped to the attempt's real outOf.
    const { data: row, error: fetchErr } = await supa
      .from('student_attempts').select('marking_json').eq('id', attemptId).maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'attempt not found' }, { status: 404 });
    const outOf = ((row.marking_json ?? {}) as { outOf?: number }).outOf ?? 0;

    const score = Number(body.adrianScore);
    if (!Number.isFinite(score) || score < 0 || (outOf > 0 && score > outOf)) {
      return NextResponse.json({ error: `adrianScore must be between 0 and ${outOf}` }, { status: 400 });
    }
    const reasoning = String(body.reasoning || '').trim().slice(0, 2000);
    if (!reasoning) return NextResponse.json({ error: 'reasoning is required on a disagreement' }, { status: 400 });
    const mustMention = Array.isArray(body.mustMention)
      ? (body.mustMention as unknown[]).map(String).map(s => s.trim()).filter(Boolean).slice(0, 10)
      : [];
    spotCheck = { agree: false, adrianScore: score, reasoning, mustMention, at: now };
  }

  const { error } = await supa
    .from('student_attempts')
    .update({ spot_checked_at: now, spot_check: spotCheck })
    .eq('id', attemptId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, attemptId, spotCheck });
}
