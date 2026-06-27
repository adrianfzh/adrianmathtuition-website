import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Graphing Calculator | AdrianMath',
  description: 'A TI-84 Plus CE style graphing calculator for JC & O-Level maths — a pocket calculator in your browser.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#15161a',
};

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
