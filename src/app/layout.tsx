import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const SITE_URL = "https://adrianmathtuition.com";
const SITE_NAME = "Adrian's Math Tuition";
const DEFAULT_TITLE = "Adrian's Math Tuition — Personalized Math Coaching";
const DEFAULT_DESC =
  "Small group math tuition in Singapore. Maximum 4 students per Secondary class, 3 per JC class. Personalized learning with 10+ years experience.";

// metadataBase makes every relative og:image/canonical resolve to an absolute URL —
// link-preview crawlers (WhatsApp, Telegram, iMessage, Slack) reject relative ones.
// Pages inherit all of this and override only what differs; the static tool pages in
// public/tools/*.html sit outside Next's metadata system and carry their own tags.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESC,
  icons: { icon: "/favicon.svg" },
  // Bing Webmaster Tools site verification (Adrian's account, added 2026-08-26).
  verification: { other: { "msvalidate.01": "76578FC6617EF7A40833BFFE8C176CA8" } },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_SG",
    url: "/",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    images: [
      {
        url: `/api/og?title=${encodeURIComponent("Adrian's Math Tuition")}&sub=${encodeURIComponent(
          "Small-group math tuition in Kovan, Singapore — max 4 per Secondary class, 3 per JC class.",
        )}`,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the /notes portal's theme provider (next-themes,
    // via fumadocs) stamps `class` and `color-scheme` onto <html> before React
    // hydrates, which is a deliberate mismatch. React only suppresses warnings
    // for this element's own attributes — descendants are unaffected.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=DM+Serif+Display&family=Fira+Code:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
        />
      </head>
      <body>
        {/* Site-wide org schema — the machine-readable "who/where" search and
            AI crawlers key on. Facts must stay in sync with what the pages
            themselves claim; nothing here that isn't stated on the site. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'EducationalOrganization',
              '@id': `${SITE_URL}/#org`,
              name: SITE_NAME,
              url: SITE_URL,
              description: DEFAULT_DESC,
              email: 'adrian@adrianmathtuition.com',
              telephone: '+65 9139 7985',
              address: { '@type': 'PostalAddress', addressLocality: 'Singapore', addressCountry: 'SG' },
              areaServed: ['Kovan', 'Hougang', 'Singapore'],
              knowsAbout: ['O-Level E Math', 'O-Level A Math', 'JC H2 Math'],
            }),
          }}
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-26NZSXLE6S"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-26NZSXLE6S');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
