import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Schedule — Adrian's Math Tuition",
  manifest: '/manifest-schedule.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Schedule',
  },
  icons: {
    apple: '/icons/schedule-180.png',
  },
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
