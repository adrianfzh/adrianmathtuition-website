import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Send a page — Adrian's Math Tuition",
  robots: { index: false, follow: false },
};

export default function SendPageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
