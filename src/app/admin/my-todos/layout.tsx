import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "My To-Dos — Adrian's Math Tuition",
  manifest: '/manifest-my-todos.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'My To-Dos',
  },
  icons: {
    apple: '/icons/my-todos-180.png',
  },
};

export default function MyTodosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
