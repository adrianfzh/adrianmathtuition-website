// POST /api/admin/worksheet-picker/file — file a picker worksheet straight onto
// the kiosk's Practice shelf (Adrian, 8 Oct 2026: "file the generated files
// straight to dropbox practice"). Multipart: `folder` (JC | AM | EM | S2 | S1),
// `name` (the file stem), `docx` and `pdf` (the two files the page built).
// Lands at /Practice/<folder>/<name>.docx + .pdf in the Dropbox app folder —
// the folder /admin/notes and the kiosk read (lib/notes-list dropboxFolderFor).
// Mode is add + autorename: a same-named sheet already on the shelf is never
// replaced (a handed-over sheet is Adrian's), the new one lands beside it.
//
// The .docx is ALSO sent to Adrian's Telegram chat (TELEGRAM_CHAT_ID), the way a
// /ws job delivers its sheet. Admin web UI actions are otherwise silent; this one
// send is the deliberate exception (Adrian, 9 Oct 2026: "can it also be saved in
// the same manner as for /ws?" — yes). `telegram` in the reply: true sent, false
// failed, absent = no .docx was filed.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { dropboxConfigured, uploadFile } from '@/lib/dropbox';
import { dropboxFolderFor } from '@/lib/notes-list';
import { PRACTICE_FOLDERS, fileStem, type PracticeFolder } from '@/lib/pick-worksheet';
import { sendTelegramDocument } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dropboxConfigured()) return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }); }

  const folder = String(form.get('folder') ?? '').toUpperCase() as PracticeFolder;
  if (!PRACTICE_FOLDERS.includes(folder)) return NextResponse.json({ error: `folder must be one of ${PRACTICE_FOLDERS.join(', ')}` }, { status: 400 });
  const dir = dropboxFolderFor('practice', folder.toLowerCase());
  if (!dir) return NextResponse.json({ error: 'unknown folder' }, { status: 400 });

  // The kiosk turns " - " into spaces for the title; keep the stem to safe characters.
  const name = fileStem(String(form.get('name') ?? '')).replace(/[:?*<>"|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const files: { ext: 'docx' | 'pdf'; type: string; buf: Buffer }[] = [];
  for (const [field, ext, type] of [['docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['pdf', 'pdf', 'application/pdf']] as const) {
    const f = form.get(field);
    if (!f || typeof f === 'string') continue;
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.length) continue;
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: `${ext} is over ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 });
    files.push({ ext, type, buf });
  }
  if (!files.length) return NextResponse.json({ error: 'send at least one of docx, pdf' }, { status: 400 });

  const filed: { ext: string; path: string; name: string; bytes: number }[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      const out = await uploadFile(`/${dir}/${name}.${f.ext}`, f.buf, f.type, 'add');
      filed.push({ ext: f.ext, path: out.path, name: out.name, bytes: f.buf.length });
    } catch (e) {
      errors.push(`${f.ext}: ${(e as Error).message}`);
    }
  }
  if (!filed.length) return NextResponse.json({ error: errors.join('; ') || 'upload failed' }, { status: 502 });
  let telegram: boolean | undefined;
  const docx = files.find((f) => f.ext === 'docx');
  const docxFiled = filed.find((f) => f.ext === 'docx');
  if (docx && docxFiled) {
    const chat = String(process.env.TELEGRAM_CHAT_ID || '').trim() || null;
    telegram = await sendTelegramDocument({ bytes: docx.buf, filename: docxFiled.name, contentType: docx.type }, `📄 ${name} — filed to Practice/${folder}`, undefined, chat);
  }
  return NextResponse.json({ ok: true, folder: dir, filed, errors, telegram });
}
