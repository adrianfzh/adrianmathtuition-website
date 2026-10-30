'use client';

// 📤 Admin files → the share sheet in the installed app (29 Oct 2026, Adrian: "when i go
// into images on phone, there are no options for me to go back or to download/save").
// Inside the home-screen admin app a file link opens full-screen with no toolbar — no
// back, no save. One listener here catches every such link on every admin page and hands
// the file to the phone's share sheet (Save to Files, Print, WhatsApp…) instead, the way
// the student app's OpenInApp does. On a normal browser nothing changes.
//
// 30 Oct 2026 (Adrian, again: "On phone, there is no avenue for me to go back or to
// save"): a 28-page marked PDF takes seconds to download, and by then iOS no longer
// counts the share as following a tap — it refuses (NotAllowedError), and the old
// fallback opened the very full-screen viewer this was meant to avoid. Now the share is
// tried at once; if the phone refuses it, a bar appears with ONE more button (a fresh
// tap the phone accepts) — and the installed app never falls back to the dead-end viewer.

import { useEffect, useState } from 'react';
import { isInstalledApp } from '@/app/app/marking/OpenInApp';
import { isFileDoor, isShareableType, shareFileName } from '@/lib/admin-file-doors';

type Bar = { kind: 'loading'; name: string } | { kind: 'ready'; file: File } | { kind: 'failed'; name: string };

async function shareFile(file: File): Promise<void> {
  try { await navigator.share({ files: [file], title: file.name }); }
  catch (err) { if (!(err instanceof Error && err.name === 'AbortError')) throw err; }
}

export default function AdminFileDoors() {
  const [bar, setBar] = useState<Bar | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || !isInstalledApp()) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;
      const origin = window.location.origin;
      if (!isFileDoor(href, origin, { newTab: a.target === '_blank', download: a.hasAttribute('download') })) return;
      if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return;
      e.preventDefault();
      const guess = shareFileName(href, origin, '');
      setBar({ kind: 'loading', name: guess });
      void (async () => {
        let file: File;
        try {
          const res = await fetch(href);
          const type = res.headers.get('content-type') || '';
          if (!res.ok || !isShareableType(type)) throw new Error(`fetch ${res.status}`);
          const blob = await res.blob();
          file = new File([blob], shareFileName(href, origin, type), { type: blob.type || type });
          if (!navigator.canShare({ files: [file] })) throw new Error('cannot share');
        } catch {
          setBar({ kind: 'failed', name: guess });
          return;
        }
        try { await shareFile(file); setBar(null); }
        catch { setBar({ kind: 'ready', file }); }   // the phone wants a fresh tap
      })();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!bar) return null;
  const name = bar.kind === 'ready' ? bar.file.name : bar.name;
  const btn: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
  return (
    <div role="dialog" aria-label="File" style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 1000,
      background: '#111827', color: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.25)',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bar.kind === 'loading' ? `Getting ${name}…` : bar.kind === 'failed' ? `Could not get ${name}` : name}
      </span>
      {bar.kind === 'ready' && (
        <button type="button" style={{ ...btn, background: '#2563eb', color: '#fff' }}
          onClick={() => { const f = bar.file; shareFile(f).then(() => setBar(null), () => setBar({ kind: 'ready', file: f })); }}>
          📤 Save / Send
        </button>
      )}
      <button type="button" aria-label="Close" style={{ ...btn, background: '#374151', color: '#fff' }} onClick={() => setBar(null)}>✕</button>
    </div>
  );
}
