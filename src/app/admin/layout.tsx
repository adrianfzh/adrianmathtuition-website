import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Admin — Adrian's Math Tuition",
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Admin',
  },
  icons: {
    apple: '/icons/admin-180.png',
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
