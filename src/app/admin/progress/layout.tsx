import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Progress — Adrian's Math Tuition",
  manifest: '/manifest-progress.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Progress',
  },
  icons: {
    apple: '/icons/progress-180.png',
  },
};

export default function ProgressLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
