// POST /api/photo-check — one row per browser photo-quality check (SPEC-PHOTO-QUALITY.md).
// Scores only, never the picture. Open (the check runs before sign-in on /chat too), so every
// field is whitelisted and numbers only; a bad body is dropped silently.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

const SOURCES = new Set(['web-chat', 'ask', 'practice', 'practice-photo', 'handin', 'add-pages']);
const ISSUES = new Set(['small', 'dark', 'bright', 'blurry']);
const SCORE_KEYS = ['mean', 'darkFrac', 'clipFrac', 'lapVar', 'edge', 'maxSide'];

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!SOURCES.has(b?.source) || typeof b.ok !== 'boolean') return NextResponse.json({ ok: false });
    const issues = Array.isArray(b.issues) ? b.issues.filter((i: unknown) => typeof i === 'string' && ISSUES.has(i)).slice(0, 4) : [];
    const scores: Record<string, number> = {};
    for (const k of SCORE_KEYS) if (typeof b.scores?.[k] === 'number' && Number.isFinite(b.scores[k])) scores[k] = b.scores[k];
    await createServiceClient().from('photo_quality_checks').insert({
      source: 'web:' + b.source,
      ok: b.ok,
      issues,
      scores,
      ms: Number.isFinite(b.ms) ? Math.min(60000, Math.round(b.ms)) : null,
      sent_anyway: b.sent_anyway === true,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
