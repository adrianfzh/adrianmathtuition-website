import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// GET /api/revision?slug=em/algebra/subject-of-formula
// Returns published lesson for public use
// GET /api/revision?slug=...&admin=1&password=... returns draft too
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const isAdmin = searchParams.get('admin') === '1';
  const password = searchParams.get('password');

  if (!slug) {
    return NextResponse.json({ lessonData: null }, { headers: CORS });
  }

  // Admin access: verify password
  if (isAdmin) {
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    }
    const { data, error } = await supabaseAdmin
      .from('lesson_content')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      return NextResponse.json({ lessonData: null }, { headers: CORS });
    }

    return NextResponse.json({
      lessonData: data.lesson_data,
      topic: data.topic,
      subtopic: data.subtopic,
      level: data.level,
      title: data.title,
      status: data.status,
    }, { headers: CORS });
  }

  // Public access: only published
  const { data, error } = await supabase
    .from('lesson_content')
    .select('lesson_data, topic, subtopic, level, title')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !data) {
    return NextResponse.json({ lessonData: null }, {
      headers: { ...CORS, 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  }

  return NextResponse.json(
    {
      lessonData: data.lesson_data,
      topic: data.topic,
      subtopic: data.subtopic,
      level: data.level,
      title: data.title,
    },
    { headers: { ...CORS, 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' } }
  );
}

// POST /api/revision — upsert lesson (admin only)
// Body: { slug, level, topic, subtopic, title, lesson_data, status, password }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, level, topic, subtopic, title, lesson_data, status, password } = body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  if (!slug || !level || !topic || !subtopic || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabaseAdmin
    .from('lesson_content')
    .upsert(
      { slug, level, topic, subtopic, title, lesson_data, status: status || 'draft' },
      { onConflict: 'slug' }
    )
    .select()
    .single();

  if (error) {
    console.error('[revision] Supabase upsert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ success: true, id: data.id }, { headers: CORS });
}
