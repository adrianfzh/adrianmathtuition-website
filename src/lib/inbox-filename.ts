// Filename for a RAW-BODY share-sheet upload (mark-paper inbox). Shortcuts' raw File
// body carries no filename, so the recipe's optional `x-file-name` header is the only
// way the WhatsApp document's real name ("2025 TKGS EM P1 (Solns).pdf") survives —
// without it every file lands as shared.<ext> and the paper-name prefill has nothing
// to work with (Adrian, 2 Aug 2026).
//
// The header value is untrusted input bound for a Blob pathname: sanitize with the
// same charset the multipart branch applies to File.name, and force the extension to
// agree with what the byte-sniffer actually saw (the name may arrive without one —
// Shortcuts' "Name" token sometimes strips it — or with a lie).

const OK_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;

export function resolveInboxFileName(headerName: string | null | undefined, sniffedExt: string): string {
  const cleaned = (headerName || '')
    .replace(/[^\w.\- ()]/g, '')
    .trim()
    .slice(0, 120)
    .replace(/^\.+|\.+$/g, '');   // never dot-files, never trailing dots
  if (!cleaned) return `shared.${sniffedExt}`;
  if (OK_EXT.test(cleaned)) return cleaned;
  // Strip a wrong/unknown extension rather than stacking ours after it.
  const base = cleaned.replace(/\.(pdf|jpe?g|png|webp|heic|heif|\w{1,5})$/i, '').replace(/\.+$/, '');
  return `${base || 'shared'}.${sniffedExt}`;
}

// A share can be TAGGED at share time (the Shortcut's Choose-from-Menu step,
// 3 Aug 2026): `x-file-kind: working|paper` becomes a path segment —
// `inbox/working/<ts>-name` — so the banner can lead with the right attach button.
// Untagged files sit at the inbox root exactly as before.
export type InboxKind = 'working' | 'paper';

export function inboxKindFrom(raw: string | null | undefined): InboxKind | null {
  const k = String(raw || '').toLowerCase().trim();
  return k === 'working' || k === 'paper' ? k : null;
}

/** pathname AFTER the inbox prefix → its kind tag + display name. */
export function parseInboxPath(rest: string): { kind: InboxKind | null; name: string } {
  const m = rest.match(/^(working|paper)\//);
  const kind = (m ? m[1] : null) as InboxKind | null;
  const name = rest.replace(/^(working|paper)\//, '').replace(/^\d+-/, '');
  return { kind, name };
}
