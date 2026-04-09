import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Schedule — Adrian\'s Math Tuition',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Schedule',
  },
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
