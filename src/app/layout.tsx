import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adrian's Math Tuition",
  description: "Singapore's trusted math tuition for O-Level A-Math, E-Math, and JC H2 Math. Small group classes with proven results.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
