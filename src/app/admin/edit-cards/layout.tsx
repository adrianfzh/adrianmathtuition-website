import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Cards Editor — Adrian's Math Tuition",
};

export default function EditCardsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
