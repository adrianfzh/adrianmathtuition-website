import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Print Worksheet — AdrianMath Tuition',
  description: 'Self-service worksheet print kiosk.',
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Print Kiosk',
  },
};

// Kiosk — lock zoom (iPad on a stand), full-bleed.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1c3a5e',
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
