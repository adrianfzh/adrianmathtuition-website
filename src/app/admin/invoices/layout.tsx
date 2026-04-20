import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Invoices — Adrian's Math Tuition",
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Invoices',
  },
  icons: {
    apple: '/icons/admin-180.png',
  },
};

export default function InvoicesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
