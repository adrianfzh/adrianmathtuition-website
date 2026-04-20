import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Students — Adrian's Math Tuition",
};

export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
