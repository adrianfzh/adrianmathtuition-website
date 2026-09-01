import type { Metadata } from 'next';

// PWA metadata like the other admin pages. Reuses the hub's icon set — no new
// binaries; give it its own the day it earns a home-screen spot.
export const metadata: Metadata = {
  title: "Calibration — Adrian's Math Tuition",
  manifest: '/manifest-calibration.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Calibration',
  },
  icons: {
    apple: '/icons/admin-180.png',
  },
};

export default function CalibrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
