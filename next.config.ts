import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // katex is external so lib/katex-inline.ts can `require.resolve` its real
  // on-disk path: inside the webpack bundle require.resolve returns a module
  // ID (a number), which took every /api/admin/questions action down with
  // 'The "path" argument must be of type string' on the first deploy (5 Sep 2026).
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp', '@sparticuz/chromium', 'katex', '@fontsource/tinos', '@fontsource/arimo', '@fontsource/gelasio'],
  async rewrites() {
    return [
      // The paywall page must live OUTSIDE the /app layout — that layout's
      // gate redirects pass-less stranger accounts to /app/pass, so a route
      // under src/app/app would redirect to itself forever. src/app/pass is
      // the real page; this rewrite serves it at the /app/pass URL. These are
      // afterFiles rewrites: a filesystem route would win, so never create
      // src/app/app/pass.
      { source: '/app/pass', destination: '/pass' },
    ];
  },
  // Files no route reads at runtime: generated exam papers (DOCX/PDF/JSON drafts, 18 MB) and the
  // backups. The tracer swept them into every route that reads from data/, and on 28 Oct 2026
  // (commit 9c1ee5ae added 340 of them) /api/admin/questions reached 261 MB, over Vercel's 250 MB
  // limit — every preview build failed for 12 hours.
  outputFileTracingExcludes: {
    '/api/**/*': ['./data/gce-generated/**', './_backups/**'],
  },
  outputFileTracingIncludes: {
    // The bundled Chromium's brotli-packed binary (5 Sep 2026, replaces the
    // runtime-downloaded chromium-min) must ride along with every API route that
    // can render a PDF through lib/generate-pdf.ts getBrowser — the tracer
    // cannot see the package's readdir-based file loading on its own.
    '/api/**/*': ['./node_modules/@sparticuz/chromium/bin/**', './node_modules/katex/dist/**', './node_modules/@fontsource/tinos/files/tinos-latin-*', './node_modules/@fontsource/arimo/files/arimo-latin-*', './node_modules/@fontsource/gelasio/files/gelasio-latin-*', './public/brand/*'],
    // The English word list the listening-paper check reads (lib/english-listening-words.ts).
    '/api/agent/listening-papers': ['./data/english/words.txt.gz'],
    '/api/mark-batch/init': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**/*',
      './node_modules/pdfjs-dist/**/*',
    ],
    '/api/mark-batch/execute': [
      './src/assets/fonts/**/*',
    ],
    '/api/mark-batch/assemble-pdf': [
      './src/assets/fonts/**/*',
    ],
  },
};

export default nextConfig;
