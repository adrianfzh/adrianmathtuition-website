'use client';

import { useState } from 'react';

/** "Change this" — copies a short request for a session; Adrian finishes the sentence. */
export default function CopyButton({ text, label = 'Change this' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2500); }
        catch { window.prompt('Copy this:', text); }
      }}
      className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}
