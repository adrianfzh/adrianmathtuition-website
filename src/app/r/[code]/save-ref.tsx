'use client';
// Drops the referral cookie on the visitor's device so the signup form (often
// opened days later, after they've WhatsApped Adrian) can attach the referrer
// automatically. 90 days — a tuition decision is slow.
import { useEffect } from 'react';

export default function SaveRef({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    try {
      const payload = encodeURIComponent(JSON.stringify({ id, name }));
      document.cookie = `am_ref=${payload}; max-age=7776000; path=/; SameSite=Lax`;
      localStorage.setItem('am_ref', JSON.stringify({ id, name })); // belt for cookie-blocked browsers
    } catch { /* best-effort — the wa.me message still carries the ref */ }
  }, [id, name]);
  return null;
}
