import type { Metadata } from 'next';
import { formulaPage, formulaPageDescription, formulaPageTitle } from '@/lib/formula-pages';

// The page itself is a client component; its <title> and description live here.
const p = formulaPage('em-circular-measure')!;

export const metadata: Metadata = {
  title: { absolute: formulaPageTitle(p) },
  description: formulaPageDescription(p),
  alternates: { canonical: 'https://adrianmathtuition.com/formulas/em-circular-measure' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
