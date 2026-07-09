import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Exams — Adrian's Math Tuition",
};

export default function ExamsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
