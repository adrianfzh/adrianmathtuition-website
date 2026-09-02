import type { Metadata } from 'next';

// PWA metadata like the other admin pages. Reuses the hub's icon set — no new
// binaries; give it its own the day it earns a home-screen spot.
export const metadata: Metadata = {
  title: "Mark schemes — Adrian's Math Tuition",
  manifest: '/manifest-schemes.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mark schemes',
  },
  icons: {
    apple: '/icons/admin-180.png',
  },
};

export default function SchemesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
