'use client';
// One quiet line on a phone held upright: turn it to see the two workings side
// by side. Gone for good on this device once the phone has been turned once.
import { useEffect, useState } from 'react';

const KEY = 'portal_review_turned';

export default function TurnHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch {}
    if (seen) return;
    const mq = window.matchMedia('(orientation: landscape)');
    const on = () => { if (mq.matches) { try { localStorage.setItem(KEY, '1'); } catch {} setShow(false); } };
    if (mq.matches) { on(); return; }
    setShow(true);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (!show) return null;
  return <p className="md:hidden text-[12px] text-gray-400">Turn your phone sideways to see them side by side.</p>;
}
