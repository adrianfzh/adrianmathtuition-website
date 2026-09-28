'use client';
// 📤 Open in… — hand a PDF to the phone's share sheet so the student can pick
// Notability, GoodNotes, Files… and annotate there (Adrian, 11 Sep 2026: "is it
// easy to save so that they can easily open to the app of their choice to
// annotate? (don't want to save to print, then export through print)"). Same
// route as the desk's Open in… (3 Sep 2026): iOS has no URL scheme that opens a
// GIVEN file in Notability, so the PDF is fetched as a File and handed to
// navigator.share, which Safari on iOS/iPadOS supports for files. Where files
// can't be shared (desktop browsers, old iOS) it opens the PDF in a new tab,
// whose own share button does the same job. Nothing here writes anything.
import { useState } from 'react';

// `label` (28 Sep 2026): the same share sheet is also the way to PRINT a Practice
// Again sheet on an iPad — Adrian: "there is no option to print". Share sheet →
// Print; on a computer the PDF opens in a tab and prints from there.
export default function OpenInApp({ url, name, className = '', label = '📤 Open in…', title = 'Share sheet → Notability, GoodNotes, Files…' }: { url: string; name: string; className?: string; label?: string; title?: string }) {
  const [busy, setBusy] = useState(false);
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
  const open = async () => {
    if (!canShareFiles) { window.open(url, '_blank', 'noopener'); return; }
    setBusy(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${name.replace(/[\\/:*?"<>|]/g, '-')}.pdf`, { type: 'application/pdf' });
      if (!navigator.canShare({ files: [file] })) { window.open(url, '_blank', 'noopener'); return; }
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      // AbortError = the sheet was dismissed; anything else falls back to a tab.
      if (!(e instanceof Error && e.name === 'AbortError')) window.open(url, '_blank', 'noopener');
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={open} disabled={busy} title={title} className={className}>
      {busy ? 'Preparing…' : label}
    </button>
  );
}
