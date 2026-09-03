import type { Metadata } from 'next';

// PWA metadata like the other admin pages. Its own icon since 3 Sep 2026 (Adrian:
// "is there a good icon for desk also?") — the in-tray on the cover's brown,
// drawn by scripts/generate-icons.js.
export const metadata: Metadata = {
  title: "Marking desk — Adrian's Math Tuition",
  manifest: '/manifest-desk.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Marking desk',
  },
  icons: {
    apple: '/icons/desk-180.png',
  },
};

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
