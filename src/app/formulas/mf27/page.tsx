import type { Metadata } from 'next';
import MfFormulaPage from '@/components/MfFormulaPage';
import { MF27 } from '@/lib/mf-lists';
import { ogCard } from '@/lib/og';

const PATH = '/formulas/mf27';
const DESC =
  'Every formula on MF27, the A-Level formula list for H1/H2 Maths and Further Maths from 2025, typeset and grouped — plus what is NOT on MF27 that you must memorise, MF26 vs MF27, and a free printable PDF.';

export const metadata: Metadata = {
  title: 'MF27 Formula List: Every H2 Math Formula + Free PDF (2026)',
  description: DESC,
  alternates: { canonical: `https://www.adrianmathtuition.com${PATH}` },
  ...ogCard({
    card: 'MF27 Formula List',
    cardSub: 'Every A-Level H2 Maths formula, typeset — and what you must memorise.',
    tag: 'A-Level · H2 Maths',
    title: 'MF27 Formula List — every H2 Maths formula, typeset',
    description: DESC,
    path: PATH,
    type: 'article',
  }),
};

export default function Mf27Page() {
  return (
    <MfFormulaPage
      list={MF27}
      copy={{
        path: PATH,
        eyebrow: 'A-Level · H1 · H2 · Further Maths',
        h1: 'MF27 Formula List: every formula, typeset',
        intro: [
          'MF27 is the List of Formulae and Results handed out in every Singapore-Cambridge A-Level maths paper from 2025 — H1, H2 and H3 Mathematics and H2 Further Mathematics. It replaced MF26.',
          'Below is every formula on it, grouped the same way, with one line on when each group is used. Under each group you will find what MF27 does NOT give you — the formulas you still have to memorise.',
        ],
        facts: [
          { k: 'Used from', v: '2025' },
          { k: 'Replaces', v: 'MF26' },
          { k: 'Booklet', v: '8 pages' },
          { k: 'In the exam', v: 'Given' },
        ],
        sibling: { href: '/formulas/mf26', text: 'The old list: MF26 (2017–2024)' },
      }}
    />
  );
}
