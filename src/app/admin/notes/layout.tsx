import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Notes — Adrian's Math Tuition",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Notes',
  },
};

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
