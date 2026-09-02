import type { Metadata } from 'next';

// PWA metadata like the other admin pages. Reuses the hub's icon set — no new
// binaries; give it its own the day it earns a home-screen spot on the iPad.
export const metadata: Metadata = {
  title: "Marking desk — Adrian's Math Tuition",
  manifest: '/manifest-desk.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Marking desk',
  },
  icons: {
    apple: '/icons/admin-180.png',
  },
};

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
