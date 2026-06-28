import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Casio fx-97SG X Calculator | AdrianMath',
  description: 'A Casio fx-97SG X ClassWiz style scientific calculator for O-Level & JC maths.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2b2e33',
};

export default function CasioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
