// Minimal Dropbox client for the /admin/notes print flow. Uses a stored refresh
// token (DROPBOX_REFRESH_TOKEN) to mint short-lived access tokens on demand, so
// the app never holds an expiring token. App-folder scoped: all paths are
// relative to Dropbox/Apps/AdrianMathNotes/.

const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';

// Cache the access token in-process (they last ~4h; we refresh at 3.5h).
let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null; // dedupe concurrent refreshes

export function dropboxConfigured(): boolean {
  return !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN);
}

// ---- upload retry (10 Sep 2026) ---------------------------------------------
/** How many EXTRA attempts an upload gets after the first. Three tries: on the
 *  default backoff that is ~6s of waiting, inside the 60s the calling routes get.
 *  A Dropbox Retry-After is obeyed instead and can be longer (capped at 30s each)
 *  — if that runs a route out of time, the 15-minute catch-up files the paper
 *  later (lib/file-catchup.ts), which is the point of having both layers. */
export const UPLOAD_RETRIES = 2;
/** Statuses worth trying again: the write rate limit and anything server-side. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}
/** Dropbox's own Retry-After when it sends one (seconds), else 2s, 4s. Capped. */
export function retryDelayMs(retryAfter: string | null | undefined, attempt: number): number {
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs, 30) * 1000;
  return Math.min(2000 * Math.pow(2, attempt), 8000);
}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  // If a refresh is already running (e.g. 5 listFolder calls fired at once),
  // await it instead of kicking off five parallel token refreshes.
  if (inflight) return inflight;
  inflight = refreshToken().finally(() => { inflight = null; });
  return inflight;
}

async function refreshToken(): Promise<string> {
  const key = process.env.DROPBOX_APP_KEY || '';
  const secret = process.env.DROPBOX_APP_SECRET || '';
  const refresh = process.env.DROPBOX_REFRESH_TOKEN || '';
  if (!key || !secret || !refresh) throw new Error('Dropbox not configured');

  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in?: number };
  cached = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 14400) - 300) * 1000 };
  return cached.token;
}

async function rpc<T>(endpoint: string, arg: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error(`Dropbox ${endpoint} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface DbxEntry {
  tag: 'file' | 'folder';
  name: string;
  path: string;          // path_lower, usable in later calls
  modified?: string;     // ISO, files only
  size?: number;
}

/** Move a file or folder (files/move_v2). autorename keeps a name clash from failing — the caller sees the final path. */
export async function movePath(fromPath: string, toPath: string, opts: { autorename?: boolean } = {}): Promise<{ path: string; name: string }> {
  const r = await rpc<{ metadata: { path_lower: string; name: string } }>('/files/move_v2', {
    from_path: fromPath, to_path: toPath, autorename: opts.autorename !== false, allow_ownership_transfer: false,
  });
  return { path: r.metadata.path_lower, name: r.metadata.name };
}

/** Delete a file or folder (files/delete_v2). Dropbox keeps it recoverable for the account's history window. */
export async function deletePath(path: string): Promise<void> {
  await rpc<unknown>('/files/delete_v2', { path });
}

/** Create a folder (files/create_folder_v2); an existing one is fine. */
export async function ensureFolder(path: string): Promise<void> {
  try { await rpc<unknown>('/files/create_folder_v2', { path, autorename: false }); }
  catch (e) { if (!/conflict/.test((e as Error).message)) throw e; }
}

/** List a folder (path '' = app-folder root). Handles pagination. */
export async function listFolder(path: string): Promise<DbxEntry[]> {
  const out: DbxEntry[] = [];
  let resp = await rpc<{ entries: any[]; cursor: string; has_more: boolean }>('/files/list_folder', {
    path: path === '' ? '' : path,
    recursive: false,
    include_non_downloadable_files: false,
  });
  const push = (entries: any[]) => {
    for (const e of entries) {
      out.push({
        tag: e['.tag'], name: e.name, path: e.path_lower,
        modified: e.server_modified, size: e.size,
      });
    }
  };
  push(resp.entries);
  while (resp.has_more) {
    resp = await rpc('/files/list_folder/continue', { cursor: resp.cursor });
    push(resp.entries);
  }
  return out;
}

/**
 * One file's metadata (files/get_metadata). `client_modified` is the mtime the
 * writing client reported — Word on Adrian's Mac stamps it when he saves, so a
 * client_modified later than the sheet job's completed_at means he edited the
 * sheet (the "reuse before you write" check, 9 Sep 2026). Throws when the path
 * does not exist.
 */
export async function getMetadata(path: string): Promise<{ name: string; path: string; size: number; client_modified: string; server_modified: string; rev: string }> {
  const e = await rpc<{ '.tag': string; name: string; path_lower: string; size: number; client_modified: string; server_modified: string; rev: string }>('/files/get_metadata', { path });
  if (e['.tag'] !== 'file') throw new Error(`Dropbox get_metadata: ${path} is a ${e['.tag']}, not a file`);
  return { name: e.name, path: e.path_lower, size: e.size, client_modified: e.client_modified, server_modified: e.server_modified, rev: e.rev };
}

/** Short-lived (~4h) direct download link for a file, for opening/printing in the browser. */
export async function getTemporaryLink(path: string): Promise<string> {
  const data = await rpc<{ link: string }>('/files/get_temporary_link', { path });
  return data.link;
}

/** The file's bytes, via a temporary link — read scope only, no sharing scope needed
 *  (the app has none: sharing/* endpoints 400 "not permitted", 3 Sep 2026). */
export async function downloadFile(path: string): Promise<Buffer> {
  const link = await getTemporaryLink(path);
  const res = await fetch(link);
  if (!res.ok) throw new Error(`Dropbox download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Escape every non-ASCII code unit as \uXXXX. Dropbox-API-Arg is an HTTP header,
// so anything above 0x7e (a curly apostrophe pasted from Notes, an accented name)
// throws "Invalid character in header content" before the request leaves Node.
// Dropbox parses the JSON after unescaping, so the path arrives intact.
function asciiHeader(json: string): string {
  return json.replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/**
 * Upload bytes to the app folder. Added 6 Aug 2026 so queue-marked papers land in
 * Dropbox by themselves — Adrian opens the Files app on the iPad instead of the site.
 *
 * ⚠ This is the FIRST write this app does. The Dropbox app previously only needed
 * `files.content.read`; if `files.content.write` was never granted, every call here
 * 401s with `missing_scope` and the refresh token has to be re-minted with the
 * wider scope. The caller must treat a failure as cosmetic, never fatal.
 *
 * `autorename` is on deliberately: re-marking the same paper should sit beside the
 * first copy (" (1)"), not silently replace a version Adrian may already have
 * annotated and handed back.
 */
export async function uploadFile(path: string, body: Buffer | Uint8Array, contentType = 'application/octet-stream', mode: 'add' | 'overwrite' = 'add'): Promise<{ path: string; name: string; display?: string }> {
  const token = await getAccessToken();
  // overwrite = replace THAT file (no autorename): the caller is re-filing the same
  // run's copy — e.g. the ✍️ annotated version superseding the auto-filed one.
  const arg = { path, mode, autorename: mode === 'add', mute: false, strict_conflict: false };
  // Dropbox rate-limits WRITES per account, and answers a burst of them with 429
  // + Retry-After — its own docs say the call must be retried, not treated as a
  // failure. Nothing here did, and the callers are all fail-soft, so one 429 in a
  // delivery burst lost a student's marked paper from the tray in silence (Kiara,
  // 9 Sep 2026 — released at 06:57, never filed, discovered by Adrian opening the
  // folder). 5xx and a dropped connection get the same treatment; a 4xx that is
  // not a rate limit (bad path, missing scope) is a real answer and throws at once.
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Dropbox-API-Arg is an HTTP header, so it must be pure ASCII — a student
          // name with an accent or a curly apostrophe in the filename would otherwise
          // throw "Invalid character in header content" before the request even leaves.
          'Dropbox-API-Arg': asciiHeader(JSON.stringify(arg)),
          'Content-Type': 'application/octet-stream',
          'X-Upload-Content-Type': contentType,
        },
        body: body as unknown as BodyInit,
      });
    } catch (e) {
      if (attempt >= UPLOAD_RETRIES) throw e;
      await sleep(retryDelayMs(null, attempt));
      continue;
    }
    if (res.ok || attempt >= UPLOAD_RETRIES || !isRetryableStatus(res.status)) break;
    const wait = retryDelayMs(res.headers.get('retry-after'), attempt);
    console.warn(`[dropbox] upload ${res.status} on ${path} — retrying in ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
  if (!res || !res.ok) throw new Error(`Dropbox upload failed: ${res ? `${res.status} ${await res.text()}` : 'no response'}`);
  const data = await res.json() as { path_lower: string; path_display?: string; name: string };
  // `path` is path_lower (what later API calls want); `display` keeps the case
  // the folder was created with — for messages a human reads.
  return { path: data.path_lower, name: data.name, display: data.path_display };
}

