'use client';
// While an essay is queued or being read, refresh the page every few seconds so
// the report appears without a tap (the bot writes the row in the background).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EssayPoll({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
