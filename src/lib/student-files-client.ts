// Browser side of lib/student-files.ts: PUT a file straight into the private
// bucket through a signed upload URL the server minted for a key it chose.
// Replaces `put(pathname, file, { token })` from @vercel/blob/client — same
// shape of flow (ask the site for a token, upload directly, hand the site the
// resulting URL), so the 4.5MB Vercel body cap never sees the bytes.
//
// `tokenUrl` is one of the token routes (they all answer {uploadUrl, key, url}):
//   /api/portal/submit-token?filename=…                       (portal session)
//   /api/admin/mark-paper-annotated-token?type=…&runId=…      (admin)
//   /api/admin/assignments/upload-token?studentId=…           (admin)

export interface UploadedFile { key: string; url: string }

export async function uploadStudentFile(
  tokenUrl: string,
  file: Blob,
  opts: { contentType?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<UploadedFile> {
  const t = await fetch(tokenUrl, { headers: opts.headers, signal: opts.signal });
  const tok = await t.json().catch(() => ({})) as { uploadUrl?: string; key?: string; url?: string; error?: string };
  if (!t.ok || !tok.uploadUrl || !tok.key || !tok.url) throw new Error(tok.error || `upload token failed (${t.status})`);
  await putToSignedUrl(tok.uploadUrl, file, opts.contentType || file.type, opts.signal);
  return { key: tok.key, url: tok.url };
}

/** The raw PUT Supabase Storage expects on a signed upload URL. */
export async function putToSignedUrl(uploadUrl: string, file: Blob, contentType?: string, signal?: AbortSignal): Promise<void> {
  const r = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType || file.type || 'application/octet-stream', 'x-upsert': 'false' },
    signal,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`upload failed (${r.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}
