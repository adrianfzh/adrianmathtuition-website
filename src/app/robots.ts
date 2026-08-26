import type { MetadataRoute } from 'next';

// Served at /robots.txt. Public pages are open to every crawler — search AND
// AI (GPTBot, ClaudeBot, PerplexityBot, CCBot all fall under '*'): being
// crawlable is the entry ticket to assistants recommending the tuition (GEO).
// Private/tokenized surfaces are kept out of the crawl; robots is crawl
// hygiene, not access control — auth still does the real gating.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/admin', '/api/', '/app/', '/app', '/kiosk', '/login', '/signup'],
      },
    ],
    sitemap: 'https://adrianmathtuition.com/sitemap.xml',
  };
}
