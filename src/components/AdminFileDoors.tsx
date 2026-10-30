'use client';

// 📤 Admin files in the installed app (29 Oct 2026, Adrian: "when i go into images on
// phone, there are no options for me to go back or to download/save"). Inside the
// home-screen admin app a file link opens full-screen with no toolbar — no back, no save.
// One listener here catches every such link on every admin page.
//
// 30 Oct 2026 (Adrian: "I want to be able to go into images and see the pdf, and from
// that pdf page be able to go back (a back button) and be able to save"): the tap now
// opens the file in the admin app's own viewer, /admin/file — the pages, ← Back and
// 📤 Save / Send. (The first try handed the file straight to the share sheet; a big PDF
// took so long to download that iOS refused the share, and he never saw the paper.)
// On a normal browser nothing changes.

import { useEffect } from 'react';
import { isInstalledApp } from '@/app/app/marking/OpenInApp';
import { isFileDoor } from '@/lib/admin-file-doors';

export default function AdminFileDoors() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || !isInstalledApp()) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;
      if (!isFileDoor(href, window.location.origin, { newTab: a.target === '_blank', download: a.hasAttribute('download') })) return;
      e.preventDefault();
      window.location.href = `/admin/file?u=${encodeURIComponent(href)}`;
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
