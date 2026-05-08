import { NextRequest, NextResponse } from 'next/server';

function checkAuth(req: NextRequest) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'bot not configured' }, { status: 503 });
  const subpath = pathSegments.join('/');
  const search = req.nextUrl.search || '';
  const url = `${botBase}/api/cockpit/${subpath}${search}`;
  const init: RequestInit = {
    method: req.method,
    headers: { 'Authorization': `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
  };
  if (req.method === 'POST') init.body = await req.text();
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
