import type { Metadata } from 'next';
import { ParentShell } from '@/components/ParentReport';

export const metadata: Metadata = { title: 'Reports stopped', robots: { index: false, follow: false } };

export default function StoppedPage() {
  return (
    <ParentShell>
      <h1 className="mt-6 text-xl font-bold text-[#1e3a5f]">Reports stopped</h1>
      <p className="mt-2 text-slate-600">You will not get any more weekly reports for this child. If you change your mind, ask your child to send you a new link from the app.</p>
    </ParentShell>
  );
}
