'use client';

// After a reflex card's "See why →" jumps into the lesson, this floating pill
// offers the way back. It only exists once a jump has happened — the page has
// no persistent chrome for a path nobody has taken — and browser Back works
// too (hash jumps push history); this is the visible version of that.

import { useEffect, useState } from 'react';

export default function BackToReflexes({ anchor }: { anchor: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('a.nx-rc-link')) setShow(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!show) return null;
  return (
    <button
      className="nx-backpill"
      onClick={() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setShow(false);
      }}
    >
      ↩ Back to concepts
    </button>
  );
}
