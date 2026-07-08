// Minimal Dropbox client for the /admin/notes print flow. Uses a stored refresh
// token (DROPBOX_REFRESH_TOKEN) to mint short-lived access tokens on demand, so
// the app never holds an expiring token. App-folder scoped: all paths are
// relative to Dropbox/Apps/AdrianMathNotes/.

const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';

// Cache the access token in-process (they last ~4h; we refresh at 3.5h).
let cached: { token: string; expiresAt: number } | null = null;

export function dropboxConfigured(): boolean {
  return !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN);
}

async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
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

/** Short-lived (~4h) direct download link for a file, for opening/printing in the browser. */
export async function getTemporaryLink(path: string): Promise<string> {
  const data = await rpc<{ link: string }>('/files/get_temporary_link', { path });
  return data.link;
}
