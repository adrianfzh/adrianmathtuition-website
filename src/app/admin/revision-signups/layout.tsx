import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Revision Sign-ups — Adrian's Math Tuition",
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Revision Sign-ups',
  },
  icons: {
    apple: '/icons/admin-180.png',
  },
};

export default function RevisionSignupsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
