'use client';

// 📤 Admin files → the share sheet in the installed app (29 Oct 2026, Adrian: "when i go
// into images on phone, there are no options for me to go back or to download/save").
// Inside the home-screen admin app a file link opens full-screen with no toolbar — no
// back, no save. One listener here catches every such link on every admin page and hands
// the file to the phone's share sheet (Save to Files, Print, WhatsApp…) instead, the way
// the student app's OpenInApp does. On a normal browser nothing changes.

import { useEffect } from 'react';
import { isInstalledApp } from '@/app/app/marking/OpenInApp';
import { isFileDoor, isShareableType, shareFileName } from '@/lib/admin-file-doors';

export default function AdminFileDoors() {
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
      void (async () => {
        try {
          const res = await fetch(href);
          const type = res.headers.get('content-type') || '';
          if (res.ok && isShareableType(type)) {
            const blob = await res.blob();
            const file = new File([blob], shareFileName(href, origin, type), { type: blob.type || type });
            if (navigator.canShare({ files: [file] })) {
              try { await navigator.share({ files: [file], title: file.name }); }
              catch (err) { if (!(err instanceof Error && err.name === 'AbortError')) throw err; }
              return;
            }
          }
        } catch { /* fall through to the old way */ }
        window.open(href, '_blank', 'noopener');
      })();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
