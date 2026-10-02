'use client';
// 📤 Open in… / 🖨 Print — hand a PDF to the phone's share sheet so the student can
// pick Print, Notability, GoodNotes, Files… (Adrian, 11 Sep 2026: "is it easy to
// save so that they can easily open to the app of their choice to annotate?").
// Same route as the desk's Open in… (3 Sep 2026): iOS has no URL scheme that opens
// a GIVEN file in Notability, so the PDF is fetched as a File and handed to
// navigator.share, which Safari on iOS/iPadOS supports for files. Where files
// can't be shared (desktop browsers, old iOS) it opens the PDF in a new tab,
// whose own share/print button does the same job. Nothing here writes anything.
//
// Why the share sheet and not a link (28 Sep 2026, Adrian: "students claim they
// can't print"): the student app is INSTALLED on most phones (manifest display
// 'standalone'). Inside it a same-site link to a PDF — target="_blank" or not —
// renders the PDF full-screen in the app's own web view, which has no toolbar: no
// share button, no Print, no back. The share sheet is the only door to the
// printer there. `mode='tab'` keeps a plain new tab on a normal browser and only
// switches to the share sheet inside the installed app.
import { useState } from 'react';

/** True inside the installed (home-screen) app — iOS `navigator.standalone` or the display-mode media query. */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try { return window.matchMedia?.('(display-mode: standalone)').matches === true; } catch { return false; }
}

const canShareFiles = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

/**
 * Fetch the PDF and hand it to the share sheet. Returns false when the share
 * sheet is not available for files (the caller falls back to a tab); a dismissed
 * sheet counts as done.
 */
export async function sharePdf(url: string, name: string): Promise<boolean> {
  if (!canShareFiles()) return false;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `${name.replace(/[\\/:*?"<>|]/g, '-')}.pdf`, { type: 'application/pdf' });
  if (!navigator.canShare({ files: [file] })) return false;
  try { await navigator.share({ files: [file], title: name }); }
  catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) throw e; }
  return true;
}

/**
 * Open a PDF the way this device can actually use it: the share sheet where files
 * can be shared (`mode='share'`, the default — Print lives there on iPhone/iPad),
 * or a new tab on a normal browser (`mode='tab'`), falling back to the share sheet
 * inside the installed app where a tab is a dead end.
 */
export async function openPdf(url: string, name: string, mode: 'share' | 'tab' = 'share'): Promise<void> {
  if (mode === 'tab' && !isInstalledApp()) { window.open(url, '_blank', 'noopener'); return; }
  let shared = false;
  try { shared = await sharePdf(url, name); }
  catch { shared = false; }
  if (!shared) window.open(url, '_blank', 'noopener');
}

// `label` (28 Sep 2026): the same share sheet is also the way to PRINT a Practice
// Again sheet on an iPad — Adrian: "there is no option to print". Share sheet →
// Print; on a computer the PDF opens in a tab and prints from there.
export default function OpenInApp({ url, name, className = '', label = '📤 Open in…', title = 'Share sheet → Print, Notability, GoodNotes, Files…', mode = 'share' }: {
  url: string; name: string; className?: string; label?: string; title?: string; mode?: 'share' | 'tab';
}) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try { await openPdf(url, name, mode); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={open} disabled={busy} title={title} className={className}>
      {busy ? 'Preparing…' : label}
    </button>
  );
}
