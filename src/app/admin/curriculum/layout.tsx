import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Curriculum — Adrian's Math Tuition",
};

export default function CurriculumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
