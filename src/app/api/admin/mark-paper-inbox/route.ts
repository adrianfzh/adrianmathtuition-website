import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

// The iPad share-sheet inbox. A Shortcut on Adrian's iPad ("✍️ Mark paper", in the
// WhatsApp/Files share sheet) POSTs the shared PDF or photos here; the mark-paper page
// lists what's waiting and attaches files as working / question paper with one tap —
// the whole reason this exists is that iPadOS won't let a website into the share sheet
// and WhatsApp's iPad app can't drag documents out.
//
// Auth: the Shortcut carries MARK_INBOX_TOKEN — a dedicated token minted 2026-07-31,
// scoped to THIS inbox only, so the share-sheet automation never holds the admin
// password. The page's own calls ride the normal admin session. Body size needs the
// vercel.json memory bump (Notability-grade scans run past the 4.5MB default cap).
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const PREFIX = 'mark-paper/inbox/';
const MAX_BYTES = 50 * 1024 * 1024;
const OK_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;

function inboxAuthed(req: NextRequest): boolean {
  const tok = process.env.MARK_INBOX_TOKEN;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (tok && bearer && bearer === tok) return true;
  return verifyAdminAuth(req);
}

// Raw-body uploads carry no filename — name them from the Content-Type.
const TYPE_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};

// POST — the Shortcut drops files in. Accepts BOTH multipart form-data (field 'file',
// the documented recipe) AND a raw file body — which is what Shortcuts sends when
// "Request Body" is set to File rather than Form. Adrian's first setup used File
// (31 Jul 2026): formData() threw, the route 400'd, and his shortcut's unconditional
// "Sent to marking ✓" notification reported success while nothing ever arrived. Both
// shapes are honest configurations of the same action, so both must work.
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const contentType = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const stored: { name: string; size: number }[] = [];

  if (contentType.startsWith('multipart/form-data')) {
    let form: FormData;
    try { form = await req.formData(); } catch { return NextResponse.json({ error: 'unreadable form-data' }, { status: 400 }); }
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'no "file" field in the form' }, { status: 400 });
    for (const f of files) {
      const name = (f.name || 'shared.pdf').replace(/[^\w.\- ()]/g, '').slice(0, 120) || 'shared.pdf';
      if (!OK_EXT.test(name)) return NextResponse.json({ error: `${name}: only PDF and photo files` }, { status: 415 });
      if (f.size > MAX_BYTES) return NextResponse.json({ error: `${name}: over 50MB` }, { status: 413 });
      const buf = Buffer.from(await f.arrayBuffer());
      await put(`${PREFIX}${Date.now()}-${name}`, buf, {
        access: 'public',
        contentType: f.type || (/\.pdf$/i.test(name) ? 'application/pdf' : 'application/octet-stream'),
      });
      stored.push({ name, size: f.size });
    }
  } else {
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) return NextResponse.json({ error: 'empty body' }, { status: 400 });
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'over 50MB' }, { status: 413 });
    // Trust the header when it's a known type; otherwise sniff magic bytes — Shortcuts'
    // Content-Type varies by source app, and a silent 415 here reads as "Sent ✓" on the
    // iPad (the shortcut's notification is unconditional).
    let ext = TYPE_TO_EXT[contentType];
    if (!ext) {
      if (buf.subarray(0, 5).toString('latin1') === '%PDF-') ext = 'pdf';
      else if (buf[0] === 0xff && buf[1] === 0xd8) ext = 'jpg';
      else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ext = 'png';
      else if (buf.subarray(4, 8).toString('latin1') === 'ftyp') ext = 'heic';
    }
    if (!ext) return NextResponse.json({ error: `unrecognised file (Content-Type "${contentType}") — send a PDF or photo` }, { status: 415 });
    const name = `shared.${ext}`;
    const putType = TYPE_TO_EXT[contentType] ? contentType
      : (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg');
    await put(`${PREFIX}${Date.now()}-${name}`, buf, { access: 'public', contentType: putType });
    stored.push({ name, size: buf.length });
  }
  return NextResponse.json({ ok: true, stored: stored.length, files: stored });
}

// GET — what's waiting, newest first. ?setup=1 additionally returns the token so the
// page can render the one-time Shortcut recipe (admin session required either way).
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  const files = blobs
    .map(b => ({
      pathname: b.pathname,
      url: b.url,
      // Strip the timestamp we prepended so the row reads as the shared filename.
      name: b.pathname.slice(PREFIX.length).replace(/^\d+-/, ''),
      size: b.size,
      uploadedAt: b.uploadedAt,
    }))
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  const body: Record<string, unknown> = { files };
  if (req.nextUrl.searchParams.get('setup') === '1') {
    body.token = process.env.MARK_INBOX_TOKEN || null;
    body.configured = !!process.env.MARK_INBOX_TOKEN;
  }
  return NextResponse.json(body);
}

// DELETE — consume a file after it's been attached (or dismissed).
export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { pathname?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const p = body.pathname || '';
  if (!p.startsWith(PREFIX)) return NextResponse.json({ error: 'not an inbox file' }, { status: 400 });
  await del(p);
  return NextResponse.json({ ok: true });
}
