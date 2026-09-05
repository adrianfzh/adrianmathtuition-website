import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // katex is external so lib/katex-inline.ts can `require.resolve` its real
  // on-disk path: inside the webpack bundle require.resolve returns a module
  // ID (a number), which took every /api/admin/questions action down with
  // 'The "path" argument must be of type string' on the first deploy (5 Sep 2026).
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp', '@sparticuz/chromium', 'katex'],
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
  outputFileTracingIncludes: {
    // The bundled Chromium's brotli-packed binary (5 Sep 2026, replaces the
    // runtime-downloaded chromium-min) must ride along with every API route that
    // can render a PDF through lib/generate-pdf.ts getBrowser — the tracer
    // cannot see the package's readdir-based file loading on its own.
    '/api/**/*': ['./node_modules/@sparticuz/chromium/bin/**', './node_modules/katex/dist/**'],
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
