'use client';
// 💡 Suggestions in the top bar, made to be noticed (Adrian, 7 Oct 2026: "can
// suggestions stand out a little more? Since it's something new to the app? To let
// students notice it"). A warm pill with the bulb, and a small dot that beats until
// the student has opened the page once on this device — then it is an ordinary pill.
import Link from 'next/link';
import { useEffect, useState } from 'react';

const SEEN_KEY = 'suggestions_seen_v1';

export default function SuggestLink() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    try { setFresh(window.localStorage.getItem(SEEN_KEY) !== '1'); } catch { /* private window: no dot */ }
  }, []);
  const seen = () => {
    setFresh(false);
    try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* fine */ }
  };
  return (
    <Link href="/app/suggestions" onClick={seen}
      className="relative inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 sm:px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 active:scale-95 transition">
      <span aria-hidden>💡</span>Suggestions
      {fresh && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-label="New">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
      )}
    </Link>
  );
}
