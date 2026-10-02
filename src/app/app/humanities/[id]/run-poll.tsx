'use client';
// While an answer is queued or being read, refresh every few seconds so the
// feedback appears without a tap (the bot writes the row in the background).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RunPoll({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
