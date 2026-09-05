import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp', '@sparticuz/chromium'],
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
    '/api/**/*': ['./node_modules/@sparticuz/chromium/bin/**'],
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
