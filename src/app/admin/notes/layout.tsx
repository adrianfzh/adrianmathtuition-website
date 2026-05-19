import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Notes — Adrian's Math Tuition",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Notes',
  },
  icons: {
    apple: '/icons/notes-180.png',
    icon: [
      { url: '/icons/notes-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/notes-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
