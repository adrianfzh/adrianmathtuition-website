// GET /api/portal/reference?subject=AM|EM
// Student-facing math reference: method templates + formula list (given/memorise).
// Auth: portal student session (subject-scoped) OR admin (any subject).
// Only AM/EM have data; other subjects return empty arrays (not an error).
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth, qbLevelsFor } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// The reference tables only carry AM/EM rows.
const REF_SUBJECTS = ['AM', 'EM'];

export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Which subjects this caller may see. Admin → any; student → their QB levels ∩ AM/EM.
  let allowed: string[];
  if (caller.kind === 'student') {
    const keys = new Set(qbLevelsFor(caller.account.level).map((l) => l.key));
    // A student with AM/EM (or Sec-3/4 variants) in their QB scope sees those.
    allowed = REF_SUBJECTS.filter((s) => keys.has(s) || keys.has(`S3_${s}`));
    if (allowed.length === 0) allowed = []; // no math-reference subject in scope
  } else {
    allowed = REF_SUBJECTS;
  }

  const requested = (new URL(req.url).searchParams.get('subject') || '').toUpperCase();
  const subjects = requested && allowed.includes(requested) ? [requested] : allowed;
  if (subjects.length === 0) {
    return NextResponse.json({ subjects: [], methods: [], formulae: [] });
  }

  const supa = getSupabaseAdmin();
  const [mRes, fRes] = await Promise.all([
    supa.from('method_templates')
      .select('subject, topic, question_type, method, watch_out, order_index')
      .in('subject', subjects).order('subject').order('order_index'),
    supa.from('formula_ref')
      .select('subject, area, result, statement, given_status, order_index')
      .in('subject', subjects).order('subject').order('order_index'),
  ]);

  return NextResponse.json({
    subjects,
    methods: (mRes.data || []).map((m) => ({
      subject: m.subject, topic: m.topic ?? null,
      questionType: m.question_type, method: m.method, watchOut: m.watch_out ?? null,
    })),
    formulae: (fRes.data || []).map((f) => ({
      subject: f.subject, area: f.area ?? 'General', result: f.result,
      statement: f.statement ?? '', givenStatus: f.given_status ?? null,
    })),
  });
}
