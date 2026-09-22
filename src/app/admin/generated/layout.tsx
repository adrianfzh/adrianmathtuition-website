import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Generated questions — Adrian's Math Tuition",
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Generated' },
  icons: { apple: '/icons/admin-180.png' },
};

export default function GeneratedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
