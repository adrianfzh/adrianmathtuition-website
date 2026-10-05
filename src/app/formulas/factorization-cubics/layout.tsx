import type { Metadata } from 'next';
import { formulaPage, formulaPageDescription, formulaPageTitle } from '@/lib/formula-pages';

// The page itself is a client component; its <title> and description live here.
const p = formulaPage('factorization-cubics')!;

export const metadata: Metadata = {
  title: { absolute: formulaPageTitle(p) },
  description: formulaPageDescription(p),
  alternates: { canonical: 'https://www.adrianmathtuition.com/formulas/factorization-cubics' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
