import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Topic Cards — Adrian's Math Tuition",
};

export default function TopicCardsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
