import type { Metadata } from 'next';

// Its own home-screen app (18 Sep 2026, Adrian: "i can't add /admin/student to
// home screen? … make /admin/student have a better icon"): without a layout the
// directory inherited /admin's manifest, so Add to Home Screen made another
// "Admin" tile. Icon: two figures on the Papers tab's violet
// (scripts/generate-icons.js 'students'). Scope "/" so a student's paper opens
// inside the app with the sign-in.
export const metadata: Metadata = {
  title: "Students — Adrian's Math Tuition",
  manifest: '/manifest-students.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Students' },
  icons: { apple: '/icons/students-180.png' },
};

export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
