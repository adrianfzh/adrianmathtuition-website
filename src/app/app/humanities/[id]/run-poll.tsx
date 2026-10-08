'use client';
// While an answer is queued or being read, refresh every few seconds so the
// feedback appears without a tap (the reads come back on the plan queue; each refresh settles the run).
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
