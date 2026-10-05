import type { Metadata } from 'next';
import MfFormulaPage from '@/components/MfFormulaPage';
import { MF26 } from '@/lib/mf-lists';
import { ogCard } from '@/lib/og';

const PATH = '/formulas/mf26';
const DESC =
  'Every formula on MF26, the A-Level H1/H2 Maths formula list used from 2017 to 2024, typeset — and exactly what changed when MF27 replaced it in 2025. Free printable PDF.';

export const metadata: Metadata = {
  title: 'MF26 Formula List (H2 Math) and What Changed in MF27',
  description: DESC,
  alternates: { canonical: `https://adrianmathtuition.com${PATH}` },
  ...ogCard({
    card: 'MF26 Formula List',
    cardSub: 'The 2017–2024 A-Level list, typeset — and what changed in MF27.',
    tag: 'A-Level · H2 Maths',
    title: 'MF26 Formula List — and what changed in MF27',
    description: DESC,
    path: PATH,
    type: 'article',
  }),
};

export default function Mf26Page() {
  return (
    <MfFormulaPage
      list={MF26}
      copy={{
        path: PATH,
        eyebrow: 'A-Level · H1 · H2 · Further Maths · 2017–2024',
        h1: 'MF26 Formula List, and what changed in MF27',
        intro: [
          'MF26 was the List of Formulae and Statistical Tables for Singapore-Cambridge A-Level maths from 2017 to 2024. Past papers from those years were set with it beside you.',
          'Every formula on it is below. Each section says what happened to it in MF27, the list used from 2025.',
        ],
        facts: [
          { k: 'Used', v: '2017–2024' },
          { k: 'Replaced by', v: 'MF27' },
          { k: 'Booklet', v: '12 pages' },
          { k: 'Tables', v: '4' },
        ],
        banner: {
          text: 'Sitting A-Levels in 2025 or later? You get MF27, not MF26.',
          href: '/formulas/mf27',
          link: 'Go to the MF27 formula list →',
        },
        sibling: { href: '/formulas/mf27', text: 'The current list: MF27 (from 2025)' },
      }}
    />
  );
}
