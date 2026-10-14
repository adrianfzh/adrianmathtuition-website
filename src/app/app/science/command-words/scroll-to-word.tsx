'use client';
// A lost mark links here as /app/science/command-words#explain (14 Oct 2026).
// The browser's own #anchor jump can fire before the page settles, so jump
// once more after it has.
import { useEffect } from 'react';

export default function ScrollToWord() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'center' });
  }, []);
  return null;
}
