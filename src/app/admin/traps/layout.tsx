import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Common traps — Adrian's Math Tuition",
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Traps' },
  icons: { apple: '/icons/admin-180.png' },
};

export default function TrapsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
